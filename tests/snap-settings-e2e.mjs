import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const profile = await mkdtemp(path.join(tmpdir(), "dim-it-snap-settings-"));
const executablePath = process.env.PLANMEASURE_EXECUTABLE;
const app = await electron.launch({
  executablePath,
  args: [...(executablePath ? [] : ["."]), `--user-data-dir=${profile}`],
  timeout: 60000,
});
const page = await app.firstWindow();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("dialog", (dialog) => void dialog.accept().catch(() => {}));
await mkdir("test-results", { recursive: true });

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
  await page.waitForFunction(
    () =>
      document.querySelector(".overlay")?.getAttribute("data-snap-state") ===
        "ready" &&
      /已本地保存|Saved locally/.test(
        document.querySelector(".statusbar")?.textContent || "",
      ),
  );
}
async function press(key) {
  await page.keyboard.press(key);
  await frame();
}
async function position(x, y, rotation = 0) {
  const box = await page.getByTestId("paper").boundingBox();
  const [vx, vy, width, height] =
    rotation === 90
      ? [y, x, 450, 600]
      : rotation === 270
        ? [450 - y, 600 - x, 450, 600]
        : [x, 450 - y, 600, 450];
  return {
    x: box.x + (box.width * vx) / width,
    y: box.y + (box.height * vy) / height,
  };
}
async function click(x, y, rotation = 0) {
  const point = await position(x, y, rotation);
  await page.mouse.click(point.x, point.y);
  await frame();
}
async function hover(x, y, rotation = 0) {
  const point = await position(x, y, rotation);
  await page.mouse.move(point.x, point.y);
  await frame();
}
async function hit(kind, x, y, tolerance = 0.002) {
  await page.waitForFunction(
    ({ kind, x, y, tolerance }) => {
      const item = document.querySelector('[data-testid="snap-highlight"]');
      return (
        item?.getAttribute("data-kind") === kind &&
        Math.abs(Number(item.getAttribute("data-pdf-x")) - x) < tolerance &&
        Math.abs(Number(item.getAttribute("data-pdf-y")) - y) < 0.002
      );
    },
    { kind, x, y, tolerance },
  );
}
async function settings() {
  await page.getByRole("button", { name: "捕捉设置", exact: true }).click();
  return page.getByRole("dialog", { name: "捕捉设置", exact: true });
}
async function only(name) {
  const panel = await settings();
  await panel
    .getByRole("button", { name: `仅启用${name}捕捉`, exact: true })
    .click();
  await press("Escape");
  await page.getByTestId("drawing-overlay").focus();
}

try {
  await page.getByLabel("下次不再显示").check();
  await page.getByRole("button", { name: "跳过说明", exact: true }).click();
  await page
    .getByTestId("file-input")
    .setInputFiles(path.resolve("tests/fixtures/snap-modes.pdf"));
  await settled();
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.setBackgroundThrottling(false);
    window.hide();
  });
  let panel = await settings();
  const drawing = await page.getByTestId("paper").boundingBox();
  const backdrop = page.locator(".snap-menu-dismiss");
  for (const [x, y] of [
    [0.2, 0.65],
    [0.5, 0.75],
    [0.8, 0.75],
    [0.5, 0.65],
  ]) {
    await page.mouse.move(
      drawing.x + drawing.width * x,
      drawing.y + drawing.height * y,
      { steps: 8 },
    );
    await frame();
    assert.equal(
      await backdrop.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
      "rgba(0, 0, 0, 0)",
      "Moving over the drawing while snap settings are open must leave the dismissal layer transparent",
    );
  }
  await page.mouse.down();
  await frame();
  assert.deepEqual(
    await backdrop.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, transform: style.transform };
    }),
    { background: "rgba(0, 0, 0, 0)", transform: "none" },
  );
  await page.screenshot({ path: "test-results/snap-settings-hover.png" });
  await page.mouse.up();
  await frame();
  assert.equal(
    await panel.count(),
    0,
    "The transparent backdrop must still close settings on click",
  );
  assert.equal(await page.getByTestId("paper").isVisible(), true);
  assert.deepEqual(errors, []);
  panel = await settings();
  for (const name of ["端点", "中点", "交点"])
    assert.equal(
      await panel
        .getByRole("checkbox", { name: `${name}捕捉`, exact: true })
        .isChecked(),
      true,
    );
  for (const name of ["最近点", "垂足", "切点"])
    assert.equal(
      await panel
        .getByRole("checkbox", { name: `${name}捕捉`, exact: true })
        .isChecked(),
      false,
    );
  await panel
    .getByRole("checkbox", { name: "端点捕捉", exact: true })
    .uncheck();
  await press("Escape");
  await page.getByTestId("drawing-overlay").focus();
  await press("Digit4");
  await hover(60, 40);
  assert.equal(await page.getByTestId("snap-highlight").count(), 0);
  await hover(160, 40);
  await hit("midpoint", 160, 40);
  await hover(220, 40);
  await hit("intersection", 220, 40);
  panel = await settings();
  await panel.getByRole("button", { name: "恢复默认", exact: true }).click();
  await press("Escape");
  await click(60, 40);
  await click(260, 40);
  await page.getByLabel("已知尺寸", { exact: true }).fill("2000");
  await page.getByRole("button", { name: "确认校准", exact: true }).click();

  await only("切点");
  await hover(200, 200);
  assert.equal(
    await page.getByTestId("snap-highlight").count(),
    0,
    "Tangent requires a start point",
  );
  await click(100, 200);
  await hover(200, 200);
  await hit("tangent", 200, 200);
  await page.keyboard.down("Alt");
  await frame();
  assert.equal(await page.getByTestId("snap-highlight").count(), 0);
  await page.keyboard.up("Alt");
  await frame();
  await hit("tangent", 200, 200);
  await click(200, 200);
  await settled();
  assert.match(
    await page.locator(".measurement-row").last().innerText(),
    /1,000.0 mm/,
  );
  await only("垂足");
  await click(180, 160);
  await hover(180, 40);
  // The free-picked anchor gets rounded to Chromium's pointer coordinates.
  await hit("perpendicular", 180, 40, 0.01);
  await click(180, 40);
  await settled();
  assert.match(
    await page.locator(".measurement-row").last().innerText(),
    /1,200.0 mm/,
  );
  const perpendicular = await page.evaluate(() =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open("planmeasure-local", 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("projects");
        const state = tx.objectStore("projects").get("current-state");
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => {
          resolve(state.result.data.measurements.at(-1));
          db.close();
        };
      };
    }),
  );
  assert.ok(Math.abs(perpendicular.a.x - perpendicular.b.x) < 1e-8);
  assert.equal(perpendicular.b.y, 40);
  await only("最近点");
  await hover(140, 42);
  await hit("nearest", 140, 40);
  await press("s");
  assert.equal(await page.getByTestId("snap-highlight").count(), 0);
  await press("s");
  await hit("nearest", 140, 40);
  console.log(
    "PASS per-mode filtering, original defaults, curve tangent after anchor, perpendicular, nearest, Alt and global snap toggle",
  );

  panel = await settings();
  await panel.getByRole("button", { name: "清空", exact: true }).click();
  await press("Escape");
  assert.match(
    await page.getByTestId("snap-status").innerText(),
    /未选择捕捉类型/,
  );
  await page.reload();
  await settled();
  panel = await settings();
  for (const checkbox of await panel.getByRole("checkbox").all())
    assert.equal(await checkbox.isChecked(), false);
  await panel.getByRole("button", { name: "全选", exact: true }).click();
  for (const checkbox of await panel.getByRole("checkbox").all())
    assert.equal(await checkbox.isChecked(), true);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1000, 650),
  );
  await page.waitForFunction(() => window.innerWidth === 1000);
  await frame();
  const bounds = await panel.boundingBox();
  assert.ok(
    bounds.x >= 0 &&
      bounds.x + bounds.width <= 1000 &&
      bounds.y >= 0 &&
      bounds.y + bounds.height <= 650,
    JSON.stringify(bounds),
  );
  await page.screenshot({ path: "test-results/snap-settings-small.png" });
  await press("Escape");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1480, 960),
  );
  await page.getByLabel("Language / 语言").selectOption("en");
  await page
    .getByRole("button", { name: "Object snap settings", exact: true })
    .click();
  const english = page.getByRole("dialog", {
    name: "Object snap settings",
    exact: true,
  });
  assert.equal(
    await english.evaluate((element) =>
      /[\u3400-\u9fff]/u.test(element.textContent),
    ),
    false,
  );
  await press("Escape");
  await page.getByLabel("Language / 语言").selectOption("zh");

  await only("切点");
  for (const [number, rotation] of [
    [2, 90],
    [3, 270],
  ]) {
    await page
      .getByRole("button", { name: `第 ${number} 页`, exact: true })
      .click();
    await settled();
    await page.getByTestId("drawing-overlay").focus();
    await press("Digit4");
    await click(60, 40, rotation);
    await click(260, 40, rotation);
    await page.getByLabel("已知尺寸", { exact: true }).fill("2000");
    await page.getByRole("button", { name: "确认校准", exact: true }).click();
    await click(100, 200, rotation);
    await hover(200, 200, rotation);
    await hit("tangent", 200, 200);
    await click(200, 200, rotation);
    await settled();
    assert.match(
      await page.locator(".measurement-row").last().innerText(),
      /1,000.0 mm/,
    );
  }
  panel = await settings();
  await page.screenshot({ path: "test-results/snap-settings.png" });
  await press("Escape");
  await page.reload();
  await settled();
  panel = await settings();
  assert.equal(
    await panel
      .getByRole("checkbox", { name: "切点捕捉", exact: true })
      .isChecked(),
    true,
  );
  assert.equal(
    await panel
      .getByRole("checkbox", { name: "端点捕捉", exact: true })
      .isChecked(),
    false,
  );
  await press("Escape");
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new Error("Storage unavailable");
    };
  });
  panel = await settings();
  await panel.getByRole("checkbox", { name: "端点捕捉", exact: true }).check();
  await panel.getByRole("alert").waitFor();
  assert.equal(
    await panel
      .getByRole("checkbox", { name: "端点捕捉", exact: true })
      .isChecked(),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS empty/all selection, persistence across reloads, minimum window, English settings, native 90/270 pages and session fallback on storage failure",
  );
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
}
