import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const profile = await mkdtemp(path.join(tmpdir(), "dim-it-shortcuts-"));
const executablePath = process.env.PLANMEASURE_EXECUTABLE;
let app;
try {
  app = await electron.launch({
    executablePath,
    args: [...(executablePath ? [] : ["."]), `--user-data-dir=${profile}`],
    timeout: 60000,
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept().catch(() => {}));
  await page.getByLabel("下次不再显示").check();
  await page.getByRole("button", { name: "跳过说明", exact: true }).click();
  await page
    .getByRole("button", { name: "用示例图纸体验", exact: true })
    .click();
  await page.getByTestId("paper").waitFor();
  await page.keyboard.press("Digit4");
  const paper = await page.getByTestId("paper").boundingBox();
  assert.ok(paper);
  await page.mouse.click(
    paper.x + paper.width * 0.2,
    paper.y + paper.height * 0.4,
  );
  await page.mouse.click(
    paper.x + paper.width * 0.5,
    paper.y + paper.height * 0.4,
  );
  await page.getByLabel("已知尺寸", { exact: true }).fill("3000");
  await page.getByRole("button", { name: "确认校准", exact: true }).click();
  await page.getByRole("button", { name: "选择", exact: true }).click();
  const length = page.getByRole("button", { name: "长度测量", exact: true });
  assert.doesNotMatch((await length.getAttribute("class")) ?? "", /\bactive\b/);
  await page.keyboard.press("Digit1");
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
  assert.match(
    (await length.getAttribute("class")) ?? "",
    /\bactive\b/,
    "Digit1 should activate Length after opening the built-in demo",
  );
  console.log(
    "PASS Digit4 calibrates and Digit1 activates Length in the built-in demo",
  );
  await page.keyboard.press("Digit3");
  assert.match(
    (await page
      .getByRole("button", { name: "区域填色", exact: true })
      .getAttribute("class")) ?? "",
    /\bactive\b/,
  );
  await page.keyboard.press("F1");
  const settings = page.getByRole("dialog", {
    name: "快捷键设置",
    exact: true,
  });
  await settings.waitFor();
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await settings
      .getByRole("button", { name: "恢复默认", exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await settings
      .getByRole("button", { name: "关闭", exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  );
  await settings
    .getByRole("button", { name: "长度测量 绑定 2", exact: true })
    .click();
  await page.keyboard.press("Digit2");
  await settings.getByRole("alert").filter({ hasText: "曲线长度" }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await settings.isVisible(), true);
  await settings
    .getByRole("button", { name: "长度测量 绑定 2", exact: true })
    .click();
  await page.keyboard.press("q");
  assert.equal(
    await settings
      .getByRole("button", { name: "长度测量 绑定 2", exact: true })
      .innerText(),
    "Q",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "选择", exact: true }).click();
  await page.keyboard.press("q");
  assert.match((await length.getAttribute("class")) ?? "", /\bactive\b/);
  assert.deepEqual(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("planmeasure.shortcuts.v1")).measure,
    ),
    ["Digit1", "KeyQ"],
  );
  console.log(
    "PASS fill shortcut, modal focus trap, capture Escape, conflict rejection and secondary binding persistence",
  );
  await page.waitForFunction(() =>
    document.querySelector(".statusbar")?.textContent.includes("已本地保存"),
  );
  await page.reload();
  await page.getByTestId("paper").waitFor();
  await page.getByRole("button", { name: "选择", exact: true }).click();
  await page.keyboard.press("q");
  assert.match((await length.getAttribute("class")) ?? "", /\bactive\b/);
  await page.keyboard.press("F1");
  await settings.waitFor();
  await settings
    .getByRole("button", { name: "清除 长度测量 2", exact: true })
    .click();
  await settings.getByRole("button", { name: "恢复默认", exact: true }).click();
  await settings.getByRole("button", { name: "取消", exact: true }).click();
  await settings.getByRole("button", { name: "恢复默认", exact: true }).click();
  await settings.getByRole("button", { name: "确认恢复", exact: true }).click();
  assert.deepEqual(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmeasure.shortcuts.v1")),
    ),
    {},
  );
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    localStorage.setItem("planmeasure.shortcuts.v1", "broken-record");
  });
  await page.waitForFunction(() =>
    document.querySelector(".statusbar")?.textContent.includes("已本地保存"),
  );
  await page.reload();
  await page.getByTestId("paper").waitFor();
  await page.keyboard.press("F1");
  await settings.waitFor();
  await settings
    .getByRole("alert")
    .filter({ hasText: "快捷键偏好已损坏" })
    .waitFor();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("planmeasure.shortcuts.v1")),
    "broken-record",
  );
  await settings
    .getByRole("button", { name: "长度测量 绑定 2", exact: true })
    .click();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(
    await settings
      .getByRole("button", { name: "长度测量 绑定 2", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("planmeasure.shortcuts.v1")),
    "broken-record",
  );
  await settings
    .getByRole("button", { name: "长度测量 绑定 2", exact: true })
    .click();
  await page.keyboard.press("q");
  assert.deepEqual(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("planmeasure.shortcuts.v1")).measure,
    ),
    ["Digit1", "KeyQ"],
  );
  console.log(
    "PASS preferences reload, per-binding clear, confirmed reset and corrupt-record preservation until explicit repair and blur cancellation",
  );
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    localStorage.removeItem("planmeasure.shortcuts.v1"),
  );
  await page.waitForFunction(() =>
    document.querySelector(".statusbar")?.textContent.includes("已本地保存"),
  );
  await page.reload();
  await page.getByTestId("paper").waitFor();
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new Error("Storage unavailable");
    };
  });
  await page.keyboard.press("F1");
  await settings.waitFor();
  await settings
    .getByRole("button", { name: "长度测量 绑定 2", exact: true })
    .click();
  await page.keyboard.press("q");
  await settings
    .getByRole("alert")
    .filter({ hasText: "快捷键偏好保存不可用" })
    .waitFor();
  await page.screenshot({
    path: "/private/tmp/dimit043-shortcuts-settings.png",
  });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1000, 650),
  );
  await page.waitForFunction(() => window.innerWidth === 1000);
  const bounds = await settings.boundingBox();
  assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 650);
  assert.ok(
    bounds.width >= 700,
    "Settings should retain its wide layout at the minimum supported window",
  );
  assert.equal(
    await settings.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
    true,
  );
  await page.screenshot({ path: "/private/tmp/dimit043-shortcuts-small.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "选择", exact: true }).click();
  await page.keyboard.press("q");
  assert.match((await length.getAttribute("class")) ?? "", /\bactive\b/);
  console.log(
    "PASS unavailable storage preserves session bindings and settings fit the minimum window",
  );
  await page.getByLabel("Language / 语言").selectOption("en");
  await page.keyboard.press("F1");
  const englishSettings = page.getByRole("dialog", {
    name: "Keyboard shortcuts",
    exact: true,
  });
  await englishSettings.waitFor();
  assert.equal(
    await englishSettings
      .getByRole("button", { name: "Length binding 2", exact: true })
      .innerText(),
    "Q",
  );
  await englishSettings
    .getByRole("alert")
    .filter({ hasText: "Shortcut storage is unavailable" })
    .waitFor();
  await page.screenshot({
    path: "/private/tmp/dimit043-shortcuts-english.png",
  });
  await englishSettings
    .getByRole("button", { name: "Close", exact: true })
    .click();
  console.log(
    "PASS English settings labels and storage warning share the existing language preference",
  );
  await page.keyboard.press("F1");
  await englishSettings.waitFor();
  await englishSettings
    .getByRole("button", { name: "Length binding 1", exact: true })
    .click();
  await page.keyboard.press("Shift+Digit1");
  await page.keyboard.press("Escape");
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const lengthEnglish = page.getByRole("button", {
    name: "Length",
    exact: true,
  });
  assert.match(await lengthEnglish.getAttribute("title"), /⇧1/);
  assert.match(
    await lengthEnglish.locator(".button-shortcut").innerText(),
    /⇧1/,
  );
  const primary = await app.evaluate(
    ({ Menu }) =>
      Menu.getApplicationMenu().getMenuItemById("measure").accelerator,
  );
  assert.equal(primary, "Shift+1");
  console.log(
    "PASS visible button hint, hover title and native primary accelerator update after rebinding",
  );
  assert.deepEqual(errors, []);
} finally {
  if (app) await app.close();
  await rm(profile, { recursive: true, force: true });
}
