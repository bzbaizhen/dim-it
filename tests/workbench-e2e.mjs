import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import { _electron as electron } from "playwright";

const profile = await mkdtemp(path.join(tmpdir(), "dim-it-workbench-"));
const executablePath = process.env.PLANMEASURE_EXECUTABLE;
const app = await electron.launch({
  executablePath,
  args: [...(executablePath ? [] : ["."]), `--user-data-dir=${profile}`],
  timeout: 60000,
});
const page = await app.firstWindow();
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("dialog", (dialog) => void dialog.accept().catch(() => {}));
const overlay = page.getByTestId("drawing-overlay");

async function saved() {
  await page.waitForFunction(() =>
    /已本地保存|Saved locally/.test(document.querySelector(".statusbar")?.textContent || ""),
  );
}

async function toolbarHeight(width, height) {
  await app.evaluate(
    ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size),
    [width, height],
  );
  await page.waitForFunction((width) => innerWidth === width, width);
  return (await page.locator(".toolbar").boundingBox()).height;
}

const markup = {
  id: "markup-one",
  kind: "markup",
  page: 1,
  origin: { x: 144, y: 480 },
  width: 200,
  height: 78,
  rotation: 0,
  color: "#d24a3e",
  fontSize: 14,
  note: "请复核净高 Check clear height",
};

try {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false),
  );
  await page.getByLabel("下次不再显示").check();
  await page.getByRole("button", { name: "跳过说明", exact: true }).click();
  const pdf = await PDFDocument.create();
  for (let index = 0; index < 96; index++) {
    pdf.addPage([800, 600]).drawLine({
      start: { x: 10, y: 10 },
      end: { x: 790, y: 590 },
      color: rgb(0, 0, 0),
    });
  }
  const bytes = await pdf.save();
  // Seed the old autosave format so the real startup path exercises migration.
  await page.evaluate(async ({ pdf, annotation }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("planmeasure-local", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put({
        filename: "Workbench fixture.pdf",
        bytes: new Uint8Array(pdf),
        page: 1,
        data: {
          scales: {},
          measurements: [],
          annotations: [annotation],
          regions: [],
          unit: "mm",
          precision: 1,
          rotations: {},
        },
      }, "current");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { pdf: Array.from(bytes), annotation: markup });
  await page.addInitScript(() => {
    const measureText = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = function (...args) {
      window.textMeasurements = (window.textMeasurements ?? 0) + 1;
      return measureText.apply(this, args);
    };
    const put = IDBObjectStore.prototype.put;
    window.autosavePuts = [];
    IDBObjectStore.prototype.put = function (value, key) {
      window.autosavePuts.push({ key, bytes: value?.bytes?.byteLength ?? 0 });
      return put.call(this, value, key);
    };
  });
  await page.reload();
  await saved();
  assert.equal(await page.locator(".thumbnail.active .count-badge").textContent(), "1");
  assert.equal(await page.locator(".list-heading small").textContent(), "1");
  const drawingShortcuts = page.locator(".toolbar .drawing-tools kbd:visible");
  const defaultKeys = ["4", "1", "2", "3", "5", "6", "S"];
  assert.ok(await toolbarHeight(1480, 900) <= 60);
  assert.deepEqual(await drawingShortcuts.allTextContents(), defaultKeys);
  const language = page.getByLabel("Language / 语言");
  await language.selectOption("en");
  assert.ok(await toolbarHeight(1480, 900) <= 60);
  assert.deepEqual(await drawingShortcuts.allTextContents(), defaultKeys);
  await toolbarHeight(1000, 650);
  assert.deepEqual(await drawingShortcuts.allTextContents(), defaultKeys);
  await page.getByRole("button", { name: "Export", exact: true }).waitFor();
  await language.selectOption("zh");
  assert.deepEqual(await drawingShortcuts.allTextContents(), defaultKeys);
  await toolbarHeight(1480, 900);
  console.log("PASS compact bilingual toolbars");

  await page.waitForFunction(() =>
    document.querySelector(".thumbnail.active canvas")?.dataset.rendered === "true",
  );
  const beforeScroll = await page.locator(".thumbnail canvas[data-rendered]").count();
  assert.ok(beforeScroll > 0 && beforeScroll <= 12);
  const lastPage = page.getByRole("button", { name: "第 96 页", exact: true });
  await lastPage.scrollIntoViewIfNeeded();
  await lastPage.locator("canvas[data-rendered]").waitFor();
  assert.ok(await page.locator(".thumbnail canvas[data-rendered]").count() < 20);
  await lastPage.click();
  assert.equal(await page.locator(".list-heading small").textContent(), "0");
  const paper = page.getByTestId("paper");
  await page.keyboard.press("Tab");
  assert.equal(await paper.getAttribute("data-thin-lines"), "true");
  await page.getByRole("button", { name: "上一页", exact: true }).click();
  await page.keyboard.press("Tab");
  assert.equal(await paper.getAttribute("data-thin-lines"), "false");
  const firstPage = page.getByRole("button", { name: "第 1 页", exact: true });
  await firstPage.focus();
  await page.keyboard.press("Enter");
  assert.equal(await firstPage.getAttribute("aria-current"), "page");
  await page.keyboard.press("Tab");
  assert.equal(await page.getByRole("button", { name: "第 2 页", exact: true })
    .evaluate((button) => button === document.activeElement), true);
  assert.equal(await paper.getAttribute("data-thin-lines"), "false");
  await page.keyboard.press("d");
  await page.keyboard.press("Tab");
  assert.equal(await paper.getAttribute("data-thin-lines"), "true");
  await firstPage.click();
  await page.keyboard.press("Tab");
  console.log("PASS Tab toggles after mouse and shortcut page changes and preserves keyboard focus navigation");

  console.log(`PASS page count and ${beforeScroll}/96 initial thumbnails`);
  const styleTop = async () => page.locator(".appearance-panel").evaluate((panel) =>
    Math.round(panel.getBoundingClientRect().top - panel.parentElement.getBoundingClientRect().top +
      panel.parentElement.scrollTop),
  );
  const top = await styleTop();
  await overlay.focus();
  await page.keyboard.press("Digit5");
  assert.equal(await styleTop(), top);
  await page.locator("#markup-background-percent").fill("42");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "颜色 #198267", exact: true }).click();
  await page.locator("#markup-font-size").selectOption("18");
  assert.equal(await page.locator("#markup-background-color").inputValue(), "#198267");
  const record = page.getByTestId("annotation-row");
  await record.click();
  assert.equal(await styleTop(), top);
  assert.equal(await page.locator("#markup-background-color").inputValue(), "#ffffff");
  await page.locator("#markup-border-percent").fill("27");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "颜色 #9b5bc2", exact: true }).click();
  assert.equal(await page.locator("#markup-text-color").inputValue(), "#d24a3e");
  const rect = page.getByTestId("drawing-annotation").locator("rect[stroke-opacity]");
  assert.equal(await rect.getAttribute("stroke-opacity"), "0.27");
  assert.equal(await rect.getAttribute("stroke"), "#9b5bc2");
  await saved();

  console.log("PASS markup controls and independent defaults");
  await page.evaluate(() => { window.textMeasurements = 0; });
  const bounds = await overlay.boundingBox();
  await page.mouse.move(bounds.x + 15, bounds.y + 20);
  await page.mouse.move(bounds.x + 150, bounds.y + 130, { steps: 16 });
  assert.equal(await page.evaluate(() => window.textMeasurements), 0);

  const puts = await page.evaluate(() => window.autosavePuts);
  assert.equal(puts.filter(({ bytes }) => bytes > 0).length, 1);
  assert.ok(puts.filter(({ key }) => key === "current-state").length >= 2);
  await lastPage.click();
  await saved();
  await page.reload();
  await saved();
  assert.equal(await page.locator(".thumbnail.active b").textContent(), "96");
  assert.equal(await page.evaluate(() => window.autosavePuts.some(({ bytes }) => bytes > 0)), false);
  await page.getByRole("button", { name: "第 1 页", exact: true }).click();
  await record.click();
  assert.equal(await page.locator("#markup-border-percent").inputValue(), "27");
  await overlay.focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Digit5");
  assert.equal(await page.locator("#markup-background-percent").inputValue(), "42");
  assert.equal(await page.locator("#markup-background-color").inputValue(), "#198267");
  assert.equal(await page.locator("#markup-font-size").inputValue(), "18");
  await page.locator(".appearance-panel").getByRole("button", { name: "恢复默认" }).click();
  assert.equal(await page.locator("#markup-background-percent").inputValue(), "94");
  assert.equal(await page.locator("#markup-font-size").inputValue(), "14");
  assert.deepEqual(errors, []);
  console.log(`PASS fixed style panel, preset channel, exact opacity and persistent defaults; ${beforeScroll}/96 thumbnails initially rendered, jumps on demand; current counts, legacy restore and lightweight autosave`);
} finally {
  // The isolated profile has already been checked after reload. Exit without
  // opening a native beforeunload dialog if a test fails during an edit.
  const child = app.process();
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await exited;
  }
  await rm(profile, { recursive: true, force: true });
}
