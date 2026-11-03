import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const results = path.resolve("test-results");
await mkdir(results, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), "planmeasure-quickstart-"));
let app;
let page;
const errors = [];
const titles = [
  "打开与浏览图纸",
  "两点校准比例",
  "测量、单位与标注",
  "端点、中点与交点捕捉",
  "Shift 智慧轨迹",
  "保存项目与导出",
];

async function launch() {
  const executablePath = process.env.PLANMEASURE_EXECUTABLE;
  app = await electron.launch({
    executablePath,
    args: [...(executablePath ? [] : ["."]), `--user-data-dir=${profile}`],
    timeout: 60000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => {
    void dialog.accept().catch(() => {});
  });
}

async function step(number) {
  await page.waitForFunction(
    (number) =>
      document.querySelector(".guide-content")?.getAttribute("data-step") ===
      String(number),
    number,
  );
  await page
    .getByRole("heading", { name: titles[number - 1], exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("progressbar").getAttribute("aria-valuenow"),
    String(number),
  );
}

async function saved() {
  await page.waitForFunction(
    () =>
      document
        .querySelector(".statusbar")
        ?.textContent.includes("已本地保存") &&
      !document.querySelector(".statusbar")?.textContent.includes("正在"),
  );
}

async function pick(x, y) {
  const box = await page.getByTestId("paper").boundingBox();
  await page.mouse.click(
    box.x + (x / 1000) * box.width,
    box.y + ((700 - y) / 700) * box.height,
  );
}

try {
  await launch();
  await page.getByRole("dialog", { name: "快速上手" }).waitFor();
  await step(1);
  assert.equal(await page.getByLabel("下次不再显示").isChecked(), false);
  await page.getByRole("button", { name: "下一步", exact: true }).focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await page
      .getByRole("dialog")
      .getByLabel("Language / 语言")
      .evaluate((element) => element === document.activeElement),
    true,
  );
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await page
      .getByRole("button", { name: "下一步", exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  );
  await page.screenshot({ path: path.join(results, "quickstart-open.png") });
  for (let number = 2; number <= 6; number++) {
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await step(number);
    if (number === 5) {
      await page.screenshot({
        path: path.join(results, "quickstart-smarttrack.png"),
      });
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1000, 650),
      );
      await page.waitForFunction(() => window.innerWidth === 1000);
      const bounds = await page
        .getByRole("dialog", { name: "快速上手" })
        .boundingBox();
      assert.ok(
        bounds.y >= 0 &&
          bounds.y + bounds.height <=
            (await page.evaluate(() => window.innerHeight)),
      );
      assert.equal(
        await page
          .locator(".quick-start-body")
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
        true,
      );
      await page.getByRole("button", { name: "下一步", exact: true }).waitFor();
      await page.screenshot({
        path: path.join(results, "quickstart-small-window.png"),
      });
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1480, 960),
      );
    }
  }
  await page.getByRole("button", { name: "上一步", exact: true }).click();
  await step(5);
  await page.keyboard.press("ArrowRight");
  await step(6);
  await page.getByRole("button", { name: "开始使用", exact: true }).click();
  await page
    .getByRole("dialog", { name: "快速上手" })
    .waitFor({ state: "hidden" });
  console.log(
    "PASS automatic startup, six core functions with illustrations, progress, back / next, keyboard navigation and focus trap",
  );

  await page
    .getByRole("button", { name: "用示例图纸体验", exact: true })
    .click();
  await saved();
  await page.reload();
  await page.getByRole("dialog", { name: "快速上手" }).waitFor();
  await step(1);
  await saved();
  assert.match(await page.locator(".document-title").innerText(), /DimIt-Demo/);
  await page.getByRole("button", { name: "跳过说明", exact: true }).click();
  await page.getByRole("button", { name: "校准比例", exact: true }).click();
  await pick(160, 550);
  await page.getByRole("button", { name: "使用帮助", exact: true }).click();
  await page
    .getByRole("button", { name: "第 5 步 Shift 智慧轨迹", exact: true })
    .click();
  await step(5);
  await page.keyboard.press("Escape");
  await page
    .getByRole("dialog", { name: "快速上手" })
    .waitFor({ state: "hidden" });
  assert.match(
    await page.locator(".instruction-pill").innerText(),
    /第二个端点/,
  );
  await pick(460, 550);
  await page
    .getByRole("dialog", { name: "这段距离的实际尺寸是多少？" })
    .waitFor();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  console.log(
    "PASS completion / skip allow immediate use, startup restoration is preserved, and help Escape keeps the in-progress calibration",
  );

  await page.getByRole("button", { name: "使用帮助", exact: true }).click();
  await step(1);
  await page.getByLabel("下次不再显示").check();
  await page.getByRole("button", { name: "跳过说明", exact: true }).click();
  await page.reload();
  await saved();
  assert.equal(await page.getByRole("dialog", { name: "快速上手" }).count(), 0);
  await page.getByRole("button", { name: "使用帮助", exact: true }).click();
  await step(1);
  assert.equal(await page.getByLabel("下次不再显示").isChecked(), true);
  await page.getByLabel("下次不再显示").uncheck();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("dialog", { name: "快速上手" }).waitFor();
  await page.getByLabel("下次不再显示").check();
  await page.getByRole("button", { name: "跳过说明", exact: true }).click();
  await saved();
  await app.close();
  app = null;
  await launch();
  await saved();
  assert.equal(await page.getByRole("dialog", { name: "快速上手" }).count(), 0);
  assert.match(await page.locator(".document-title").innerText(), /DimIt-Demo/);
  await page.getByRole("button", { name: "使用帮助", exact: true }).click();
  await step(1);
  console.log(
    "PASS opt-out survives process restart, help reopens from the beginning, and the preference can be restored",
  );

  await page.keyboard.press("Escape");
  await page.addInitScript(() => {
    Storage.prototype.getItem = function () {
      throw new Error("Storage unavailable");
    };
    Storage.prototype.setItem = function () {
      throw new Error("Storage unavailable");
    };
  });
  await page.reload();
  await page.getByRole("dialog", { name: "快速上手" }).waitFor();
  await page.getByLabel("下次不再显示").click();
  await page
    .getByRole("alert")
    .filter({ hasText: "启动偏好保存失败" })
    .waitFor();
  assert.equal(await page.getByLabel("下次不再显示").isChecked(), false);
  await page.getByRole("button", { name: "跳过说明", exact: true }).click();
  await saved();
  assert.match(await page.locator(".document-title").innerText(), /DimIt-Demo/);
  assert.deepEqual(errors, []);
  console.log(
    "PASS unavailable preference storage falls back to a skippable guide and leaves the drawing usable",
  );
} finally {
  if (app) await app.close();
  await rm(profile, { recursive: true, force: true });
}
