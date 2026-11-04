import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const results = path.resolve("test-results");
await mkdir(results, { recursive: true });
const userData = await mkdtemp(path.join(tmpdir(), "planmeasure-snap-"));
const app = await electron.launch({
  args: [".", `--user-data-dir=${userData}`],
  timeout: 60000,
});
const page = await app.firstWindow();
// Isolate synthetic hover/modifier input from native OS pointer events.
await app.evaluate(({ BrowserWindow }) => {
  const testWindow = BrowserWindow.getAllWindows()[0];
  testWindow.webContents.setBackgroundThrottling(false);
  testWindow.hide();
});
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("dialog", (dialog) => {
  void dialog.accept().catch(() => {});
});

async function frame() {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function settled() {
  await frame();
  await page.waitForFunction(() => {
    const status = document.querySelector(".statusbar")?.textContent || "";
    const geometry = document
      .querySelector(".overlay")
      ?.getAttribute("data-snap-state");
    return (
      status.includes("已本地保存") &&
      !status.includes("正在") &&
      ["ready", "empty"].includes(geometry)
    );
  });
}

async function moveNear(x, y, rotation = 0, dx = 3, dy = 2) {
  await frame();
  const box = await page.getByTestId("paper").boundingBox();
  const [vx, vy, width, height] =
    rotation === 90
      ? [y, x, 450, 600]
      : rotation === 270
        ? [450 - y, 600 - x, 450, 600]
        : [x, 450 - y, 600, 450];
  const position = {
    x: box.x + (vx / width) * box.width + dx,
    y: box.y + (vy / height) * box.height + dy,
  };
  await page.mouse.move(position.x, position.y);
  return position;
}

async function highlighted(kind, x, y) {
  await page.waitForFunction(
    ({ kind, x, y }) => {
      const hit = document.querySelector(".snap-highlight");
      return (
        hit?.getAttribute("data-kind") === kind &&
        Math.abs(Number(hit.getAttribute("data-pdf-x")) - x) < 1e-6 &&
        Math.abs(Number(hit.getAttribute("data-pdf-y")) - y) < 1e-6
      );
    },
    { kind, x, y },
  );
  const hit = page.getByTestId("snap-highlight");
  assert.ok(Math.abs(Number(await hit.getAttribute("data-pdf-x")) - x) < 1e-6);
  assert.ok(Math.abs(Number(await hit.getAttribute("data-pdf-y")) - y) < 1e-6);
  const style = await hit
    .locator(".snap-marker")
    .evaluate((element) => getComputedStyle(element).stroke);
  assert.equal(style, "rgb(7, 134, 80)");
}

async function pick(kind, x, y, rotation = 0) {
  const position = await moveNear(x, y, rotation);
  await highlighted(kind, x, y);
  await page.mouse.click(position.x, position.y);
}

try {
  await page.getByRole("button", { name: "跳过说明", exact: true }).click();
  await page
    .getByTestId("file-input")
    .setInputFiles(path.resolve("tests/fixtures/snap.pdf"));
  await settled();
  await page.getByRole("button", { name: "校准比例", exact: true }).click();
  for (const [kind, x, y] of [
    ["endpoint", 100, 100],
    ["midpoint", 250, 100],
    ["intersection", 320, 100],
  ]) {
    await moveNear(x, y);
    await highlighted(kind, x, y);
    await page.screenshot({ path: path.join(results, `snap-${kind}.png`) });
  }
  await moveNear(100, 100, 0, 12, 0);
  await page.getByTestId("snap-highlight").waitFor({ state: "hidden" });
  assert.equal(await page.getByTestId("snap-highlight").count(), 0);
  await moveNear(100, 100);
  await highlighted("endpoint", 100, 100);
  await page.keyboard.down("Alt");
  await page.getByTestId("snap-highlight").waitFor({ state: "hidden" });
  assert.equal(await page.getByTestId("snap-highlight").count(), 0);
  await page.keyboard.up("Alt");
  await moveNear(250, 100);
  await highlighted("midpoint", 250, 100);
  await page.getByRole("button", { name: "对象捕捉", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "对象捕捉", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  await moveNear(250, 100);
  await page.getByTestId("snap-highlight").waitFor({ state: "hidden" });
  assert.equal(await page.getByTestId("snap-highlight").count(), 0);
  await page.keyboard.press("s");
  await pick("endpoint", 100, 100);
  await pick("midpoint", 250, 100);
  await page.getByLabel("已知尺寸", { exact: true }).fill("1500");
  await page.getByRole("button", { name: "确认校准" }).click();
  await pick("midpoint", 250, 100);
  await pick("intersection", 320, 100);
  await page
    .locator(".measurement-row")
    .filter({ hasText: "700.0 mm" })
    .waitFor();
  await app.evaluate(
    ({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    },
    path.join(results, "snapped.planmeasure"),
  );
  await page.getByRole("button", { name: "保存项目", exact: true }).click();
  await page
    .getByText("项目已保存，包含原 PDF、校准和可编辑标注", { exact: true })
    .waitFor();
  const saved = JSON.parse(
    await readFile(path.join(results, "snapped.planmeasure"), "utf8"),
  );
  assert.deepEqual(saved.data.scales[1].a, { x: 100, y: 100 });
  assert.deepEqual(saved.data.scales[1].b, { x: 250, y: 100 });
  assert.deepEqual(saved.data.measurements[0].a, { x: 250, y: 100 });
  assert.deepEqual(saved.data.measurements[0].b, { x: 320, y: 100 });
  console.log(
    "PASS three highlighted snap types, 10-pixel threshold, Alt / toggle, and exact saved calibration / measurement coordinates",
  );
  await page.getByRole("button", { name: "校准比例", exact: true }).click();
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await settled();
  await moveNear(250, 100);
  await highlighted("midpoint", 250, 100);
  assert.equal(await page.locator(".snap-halo").getAttribute("r"), "13");
  await page.getByRole("button", { name: "旋转页面", exact: true }).click();
  await page.getByRole("button", { name: "适合页面", exact: true }).click();
  await settled();
  await moveNear(320, 100, 90);
  await highlighted("intersection", 320, 100);
  await page.getByRole("button", { name: "第 2 页", exact: true }).click();
  await settled();
  await moveNear(100, 100, 90);
  await highlighted("endpoint", 100, 100);
  await page.getByRole("button", { name: "第 3 页", exact: true }).click();
  await settled();
  await moveNear(250, 100, 270);
  await highlighted("midpoint", 250, 100);
  await page.getByRole("button", { name: "第 4 页", exact: true }).click();
  await settled();
  assert.match(await page.getByTestId("snap-status").innerText(), /无矢量直线/);
  await moveNear(100, 100);
  assert.equal(await page.getByTestId("snap-highlight").count(), 0);
  await page.getByRole("button", { name: "第 5 页", exact: true }).click();
  await settled();
  await moveNear(180, 110);
  await highlighted("intersection", 180, 110);
  await page.getByRole("button", { name: "第 1 页", exact: true }).click();
  await settled();
  await moveNear(320, 100, 90);
  await highlighted("intersection", 320, 100);
  console.log(
    "PASS zoom, UI rotation, inherent 90 / 270 degree rotation, empty page, scaled Form XObject and page cache invalidation",
  );
  assert.deepEqual(errors, []);
} finally {
  await app.close();
  await rm(userData, { recursive: true, force: true });
}
