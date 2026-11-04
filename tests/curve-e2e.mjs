import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments } from "../src/snap.ts";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
const profile = await mkdtemp(path.join(tmpdir(), "dim-it-curve-"));
const executablePath = process.env.PLANMEASURE_EXECUTABLE;
const app = await electron.launch({
  executablePath,
  args: [...(executablePath ? [] : ["."]), `--user-data-dir=${profile}`],
  timeout: 60000,
});
const page = await app.firstWindow();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => void d.accept().catch(() => {}));
const results = path.resolve("test-results");
await mkdir(results, { recursive: true });
async function settled() {
  await page.waitForFunction(
    () =>
      document.querySelector(".overlay")?.getAttribute("data-snap-state") ===
        "ready" &&
      document.querySelector(".statusbar")?.textContent.includes("已本地保存"),
  );
}
async function position(x, y, rotation = 0) {
  const b = await page.getByTestId("paper").boundingBox();
  const [vx, vy, w, h] =
    rotation === 90
      ? [y, x, 450, 600]
      : rotation === 270
        ? [450 - y, 600 - x, 450, 600]
        : [x, 450 - y, 600, 450];
  return { x: b.x + (vx / w) * b.width, y: b.y + (vy / h) * b.height };
}
async function pick(x, y, rotation = 0) {
  const p = await position(x, y, rotation);
  await page.mouse.click(p.x, p.y);
}
async function saveAs(name) {
  await app.evaluate(
    ({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    },
    path.join(results, name),
  );
}
async function calibrate(rotation = 0, length = "2000") {
  await page.getByRole("button", { name: "校准比例", exact: true }).click();
  await pick(100, 50, rotation);
  await pick(300, 50, rotation);
  await page.getByLabel("已知尺寸", { exact: true }).fill(length);
  await page.getByRole("button", { name: "确认校准" }).click();
}
try {
  await page.getByRole("button", { name: "跳过说明", exact: true }).click();
  await page
    .getByTestId("file-input")
    .setInputFiles(path.resolve("tests/fixtures/curves.pdf"));
  await settled();
  await page.getByRole("button", { name: "曲线长度", exact: true }).click();
  await page.getByRole("button", { name: "校准比例", exact: true }).waitFor();
  await calibrate();
  await page.keyboard.press("l");
  const p = await position(270.710678, 270.710678);
  await page.mouse.move(p.x, p.y);
  await page
    .locator(".dimension.preview")
    .filter({ hasText: "1,571.0 mm" })
    .waitFor();
  assert.ok(
    (
      await page
        .locator(".dimension.preview polyline.dimension-line")
        .getAttribute("points")
    ).split(" ").length > 20,
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({ path: path.join(results, "curve-highlight.png") });
  await page.mouse.click(p.x, p.y);
  await settled();
  assert.match(
    await page.locator(".measurement-row").innerText(),
    /1,571.0 mm/,
  );
  await page.mouse.move(20, 20);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({ path: path.join(results, "curve-measured.png") });
  await page.getByLabel("显示单位").selectOption("ft-in");
  assert.match(
    await page.locator(".measurement-row").innerText(),
    /5' 1 7\/8"/,
  );
  await page.getByLabel("显示单位").selectOption("mm");
  await saveAs("curve.planmeasure");
  await page.getByRole("button", { name: "保存项目", exact: true }).click();
  await page
    .getByText("项目已保存，包含原 PDF、校准和可编辑标注", { exact: true })
    .waitFor();
  const project = JSON.parse(
    await readFile(path.join(results, "curve.planmeasure"), "utf8"),
  );
  assert.equal(project.version, 2);
  assert.ok(project.data.measurements[0].path.length > 20);
  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(results, "curve.planmeasure"));
  await settled();
  assert.match(
    await page.locator(".measurement-row").innerText(),
    /1,571.0 mm/,
  );
  await page.locator(".measurement-row").click();
  await page.getByLabel("标注备注").fill("Quarter arc");
  await page.getByLabel("标注备注").press("Enter");
  await saveAs("curve.csv");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("button", { name: /测量清单 CSV/ }).click();
  await page.getByText("测量清单已导出", { exact: true }).waitFor();
  assert.match(
    await readFile(path.join(results, "curve.csv"), "utf8"),
    /1,571.0 mm.*Quarter arc/,
  );
  await saveAs("curve-measured.pdf");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("button", { name: /带标注 PDF/ }).click();
  await page
    .getByText("带标注 PDF 已导出，可在其他阅读器查看", { exact: true })
    .waitFor();
  const task = getDocument({
    standardFontDataUrl:
      path.resolve("node_modules/pdfjs-dist/standard_fonts") + path.sep,
    data: new Uint8Array(
      await readFile(path.join(results, "curve-measured.pdf")),
    ),
  });
  try {
    const doc = await task.promise;
    const segments = extractSegments(
      await (await doc.getPage(1)).getOperatorList(),
      OPS,
    );
    assert.ok(segments.length > project.data.measurements[0].path.length);
    assert.equal(doc.numPages, 5);
  } finally {
    await task.destroy();
  }
  await page.getByRole("button", { name: "删除标注", exact: true }).click();
  assert.equal(await page.locator(".measurement-row").count(), 0);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  assert.equal(await page.locator(".measurement-row").count(), 1);
  await calibrate(0, "4000");
  assert.match(
    await page.locator(".measurement-row").innerText(),
    /3,142.0 mm/,
  );
  await calibrate();
  await page.getByRole("button", { name: "曲线长度", exact: true }).click();
  await pick(495, 180);
  await settled();
  assert.equal(await page.locator(".measurement-row").count(), 2);
  assert.match(
    await page.locator(".measurement-row").last().innerText(),
    /2,827\.8/,
  );
  await pick(300, 380);
  await settled();
  assert.equal(await page.locator(".measurement-row").count(), 3);
  const sLength = Number(
    (
      await page
        .locator(".measurement-row")
        .last()
        .locator("strong")
        .innerText()
    ).replace(/[^\d.]/g, ""),
  );
  assert.ok(sLength > 4000 && sLength < 4500);
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await page.getByRole("button", { name: "旋转页面", exact: true }).click();
  await settled();
  assert.match(
    await page.locator(".measurement-row").first().innerText(),
    /1,571.0 mm/,
  );
  for (const [number, rotation] of [
    [2, 90],
    [3, 270],
  ]) {
    await page
      .getByRole("button", { name: `第 ${number} 页`, exact: true })
      .click();
    await settled();
    await calibrate(rotation);
    await page.getByRole("button", { name: "曲线长度", exact: true }).click();
    await pick(270.710678, 270.710678, rotation);
    await settled();
    assert.match(
      await page.locator(".measurement-row").innerText(),
      /1,571.0 mm/,
    );
  }
  await page.getByRole("button", { name: "第 5 页", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector(".overlay")?.getAttribute("data-snap-state") ===
      "empty",
  );
  await page.getByRole("button", { name: "校准比例", exact: true }).click();
  await pick(100, 50);
  await pick(300, 50);
  await page.getByLabel("已知尺寸", { exact: true }).fill("2000");
  await page.getByRole("button", { name: "确认校准" }).click();
  await page.getByRole("button", { name: "曲线长度", exact: true }).click();
  await pick(270, 270);
  await page
    .getByRole("status")
    .filter({ hasText: "此页没有可测量的矢量曲线" })
    .waitFor();
  assert.equal(await page.locator(".measurement-row").count(), 0);
  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(results, "curve-measured.pdf"));
  await settled();
  await page.screenshot({ path: path.join(results, "curve-exported.png") });
  assert.deepEqual(errors, []);
  console.log(
    "PASS curve hover / whole-path picking, quarter arc, closed loop, units, v2 project reopen, notes, undo, PDF / CSV, zoom and 90/270 pages, empty-page recovery",
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await app.close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
}
