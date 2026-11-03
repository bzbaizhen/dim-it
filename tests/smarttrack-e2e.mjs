import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const results = path.resolve("test-results");
await mkdir(results, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), "planmeasure-smarttrack-"));
const app = await electron.launch({
  args: [".", `--user-data-dir=${profile}`],
  timeout: 60000,
});
const page = await app.firstWindow();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("dialog", (dialog) => {
  void dialog.accept().catch(() => {});
});

async function settled() {
  await page.waitForFunction(
    () =>
      document.querySelector(".overlay")?.getAttribute("data-snap-state") ===
        "ready" &&
      document
        .querySelector(".statusbar")
        ?.textContent.includes("已本地保存") &&
      !document.querySelector(".statusbar")?.textContent.includes("正在"),
  );
}

async function move(x, y, rotation = 0, dx = 3, dy = 2) {
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

async function point(selector, x, y) {
  await page.waitForFunction(
    ({ selector, x, y }) =>
      [...document.querySelectorAll(selector)].some(
        (item) =>
          Math.abs(Number(item.getAttribute("data-pdf-x")) - x) < 1e-6 &&
          Math.abs(Number(item.getAttribute("data-pdf-y")) - y) < 1e-6,
      ),
    { selector, x, y },
  );
}

async function pick(x, y, rotation = 0) {
  const position = await move(x, y, rotation);
  await point(".snap-highlight", x, y);
  await page.mouse.click(position.x, position.y);
}

async function acquire(x, y, rotation = 0) {
  await move(x, y, rotation);
  await point(".smart-reference", x, y);
}

async function projected(x, y) {
  await point(".smart-track-hit", x, y);
  await page.getByTestId("smart-guides").waitFor({ state: "attached" });
  assert.equal(
    await page
      .locator(".smart-guide")
      .evaluate((line) => getComputedStyle(line).stroke),
    "rgb(128, 82, 184)",
  );
}

try {
  await page.getByRole("button", { name: "跳过说明", exact: true }).click();
  await page
    .getByTestId("file-input")
    .setInputFiles(path.resolve("tests/fixtures/snap.pdf"));
  await settled();
  await page.getByRole("button", { name: "校准比例", exact: true }).click();
  await pick(100, 100);
  await page.keyboard.down("Shift");
  await move(300, 250);
  await page.getByTestId("smart-candidate").waitFor();
  await move(180, 180);
  await page.waitForTimeout(450);
  assert.equal(await page.getByTestId("smart-reference").count(), 0);
  await acquire(300, 250);
  await projected(300, 100);
  await acquire(100, 350);
  assert.equal(await page.getByTestId("smart-reference").count(), 2);
  await move(300, 100);
  await projected(300, 100);
  const guide = await page.locator(".smart-guide").evaluate((line) => ({
    x1: Number(line.getAttribute("x1")),
    x2: Number(line.getAttribute("x2")),
    y1: Number(line.getAttribute("y1")),
    y2: Number(line.getAttribute("y2")),
  }));
  assert.ok(
    Math.abs(guide.x1 - guide.x2) < 1e-6 && Math.abs(guide.y1 - guide.y2) > 100,
  );
  await page.keyboard.up("Shift");
  await page.getByTestId("smart-track-overlay").waitFor({ state: "hidden" });
  await page.keyboard.down("Shift");
  await projected(300, 100);
  await page.keyboard.down("Alt");
  await page.getByTestId("smart-track-hit").waitFor({ state: "hidden" });
  await page.keyboard.up("Alt");
  await projected(300, 100);
  const notice = page.getByRole("button", { name: "关闭提示" });
  if (await notice.count()) await notice.click();
  const target = await move(300, 100);
  await projected(300, 100);
  await page.screenshot({
    path: path.join(results, "smarttrack-horizontal.png"),
  });
  await page.mouse.click(target.x, target.y);
  await page.keyboard.up("Shift");
  await page.getByLabel("已知尺寸", { exact: true }).fill("2000");
  await page.getByRole("button", { name: "确认校准" }).click();
  await pick(250, 100);
  await page.keyboard.down("Shift");
  assert.equal(await page.getByTestId("smart-reference").count(), 0);
  await acquire(300, 350);
  await projected(250, 350);
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await settled();
  const vertical = await move(250, 350);
  await projected(250, 350);
  await page.screenshot({
    path: path.join(results, "smarttrack-vertical.png"),
  });
  await page.mouse.click(vertical.x, vertical.y);
  await page.keyboard.up("Shift");
  await page
    .locator(".measurement-row")
    .filter({ hasText: "2,500.0 mm" })
    .waitFor();
  await app.evaluate(
    ({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    },
    path.join(results, "smarttrack.planmeasure"),
  );
  await page.getByRole("button", { name: "保存项目", exact: true }).click();
  await page
    .getByText("项目已保存，包含原 PDF、校准和可编辑标注", { exact: true })
    .waitFor();
  const saved = JSON.parse(
    await readFile(path.join(results, "smarttrack.planmeasure"), "utf8"),
  );
  assert.deepEqual(saved.data.scales[1].a, { x: 100, y: 100 });
  assert.deepEqual(saved.data.scales[1].b, { x: 300, y: 100 });
  assert.deepEqual(saved.data.measurements[0].a, { x: 250, y: 100 });
  assert.deepEqual(saved.data.measurements[0].b, { x: 250, y: 350 });
  console.log(
    "PASS hover acquisition / cancellation, multiple references, Shift / Alt refresh without moving, orthogonal calibration and measurement, zoom and exact saved coordinates",
  );

  for (const [number, rotation] of [
    [2, 90],
    [3, 270],
  ]) {
    await page
      .getByRole("button", { name: `第 ${number} 页`, exact: true })
      .click();
    await settled();
    await page.getByRole("button", { name: "校准比例", exact: true }).click();
    await pick(100, 100, rotation);
    await page.keyboard.down("Shift");
    assert.equal(await page.getByTestId("smart-reference").count(), 0);
    await acquire(300, 250, rotation);
    await projected(300, 100);
    await page.keyboard.press("Escape");
    await page.getByTestId("smart-reference").waitFor({ state: "hidden" });
    await page.keyboard.up("Shift");
  }
  await pick(100, 100, 270);
  await page.keyboard.down("Shift");
  await acquire(300, 250, 270);
  await page.getByRole("button", { name: "对象捕捉", exact: true }).click();
  await page.getByTestId("smart-track-overlay").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "对象捕捉", exact: true }).click();
  assert.equal(await page.getByTestId("smart-reference").count(), 0);
  await page.keyboard.up("Shift");
  console.log(
    "PASS native 90 / 270 degree pages, per-segment reset, page changes, Escape and snap-toggle cleanup",
  );
  assert.deepEqual(errors, []);
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
}
