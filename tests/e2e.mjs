import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const results = path.resolve("test-results");
await mkdir(results, { recursive: true });
const userData = await mkdtemp(path.join(tmpdir(), "planmeasure-e2e-"));
const app = await electron.launch({
  args: [".", `--user-data-dir=${userData}`],
  timeout: 60000,
});
const page = await app.firstWindow();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error")
    console.log("RENDERER", message.text().slice(0, 600));
});
page.on("dialog", (dialog) => {
  void dialog.accept().catch(() => {});
});

async function settled() {
  await page.waitForFunction(() => {
    const status = document.querySelector(".statusbar")?.textContent || "";
    return status.includes("已本地保存") && !status.includes("正在");
  });
}

async function pickPoint(x, y, width = 1000, height = 700) {
  const box = await page.getByTestId("paper").boundingBox();
  assert.ok(box && box.width > 10);
  await page.mouse.click(
    box.x + (x / width) * box.width,
    box.y + ((height - y) / height) * box.height,
  );
}

async function setSavePath(filename) {
  await app.evaluate(
    ({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: target,
      });
    },
    path.join(results, filename),
  );
}

try {
  await page.getByRole("button", { name: "跳过说明", exact: true }).click();
  await page.getByRole("button", { name: "用示例图纸体验" }).click();
  await settled();
  console.log("PASS demo opens in native Electron");
  await page.getByRole("button", { name: "校准比例", exact: true }).click();
  await pickPoint(160, 550);
  await pickPoint(460, 550);
  await page.getByLabel("已知尺寸", { exact: true }).fill("6000");
  await page.getByRole("button", { name: "确认校准" }).click();
  await pickPoint(160, 180);
  await pickPoint(760, 180);
  await page
    .locator(".measurement-row")
    .filter({ hasText: "12,000.0 mm" })
    .waitFor();
  console.log("PASS two-point calibration and 12000 mm measurement");
  await settled();
  const notice = page.getByRole("button", { name: "关闭提示" });
  if (await notice.count()) await notice.click();
  await page.screenshot({ path: path.join(results, "demo-workspace.png") });
  await pickPoint(160, 180);
  await pickPoint(460, 180);
  assert.equal(await page.locator(".measurement-row").count(), 2);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  assert.equal(await page.locator(".measurement-row").count(), 1);
  console.log("PASS consecutive measurements can share endpoints");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  assert.equal(await page.locator(".measurement-row").count(), 0);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  assert.equal(await page.locator(".measurement-row").count(), 1);
  await page.keyboard.press("Meta+z");
  assert.equal(await page.locator(".measurement-row").count(), 0);
  await page.keyboard.press("Meta+Shift+z");
  assert.equal(await page.locator(".measurement-row").count(), 1);
  await page.getByLabel("显示单位").selectOption("ft-in");
  assert.match(
    await page.locator(".measurement-row").innerText(),
    /39' 4 7\/16"/,
  );
  await page.getByLabel("显示单位").selectOption("mm");
  console.log("PASS undo / redo and imperial display");
  await page.locator(".measurement-row").click();
  await page.getByLabel("标注备注").fill("Living room");
  await page.getByLabel("标注备注").press("Enter");
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await settled();
  assert.match(
    await page.locator(".measurement-row").innerText(),
    /12,000.0 mm/,
  );
  await page.getByRole("button", { name: "旋转页面", exact: true }).click();
  await settled();
  assert.match(
    await page.locator(".measurement-row").innerText(),
    /12,000.0 mm/,
  );
  await page.getByRole("button", { name: "适合页面", exact: true }).click();
  await settled();
  await page.screenshot({ path: path.join(results, "demo-measured.png") });
  await setSavePath("demo.planmeasure");
  await page.getByRole("button", { name: "保存项目", exact: true }).click();
  await page
    .getByText("项目已保存，包含原 PDF、校准和可编辑标注", { exact: true })
    .waitFor();
  const project = JSON.parse(
    await readFile(path.join(results, "demo.planmeasure"), "utf8"),
  );
  assert.equal(project.data.measurements.length, 1);
  assert.equal(project.data.measurements[0].note, "Living room");
  await setSavePath("demo-measured.pdf");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("button", { name: "带标注 PDF" }).click();
  await page
    .getByText("带标注 PDF 已导出，可在其他阅读器查看", { exact: true })
    .waitFor();
  const exported = await PDFDocument.load(
    await readFile(path.join(results, "demo-measured.pdf")),
  );
  assert.equal(exported.getPageCount(), 2);
  assert.equal(exported.getPage(0).getRotation().angle, 90);
  console.log("PASS project save and rotated annotated PDF export");
  await page.reload();
  await page.getByRole("button", { name: "跳过说明", exact: true }).click();
  await settled();
  assert.match(
    await page.locator(".measurement-row").innerText(),
    /12,000.0 mm/,
  );
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await settled();
  assert.match(await page.locator(".scale-state").innerText(), /待校准/);
  assert.equal(await page.locator(".measurement-row").count(), 0);
  console.log("PASS autosave recovery and independent page calibration");
  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(results, "demo.planmeasure"));
  await settled();
  assert.match(
    await page.locator(".measurement-row").innerText(),
    /12,000.0 mm/,
  );
  console.log("PASS project file reopens with measurements");
  await setSavePath("measurements.csv");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("button", { name: "测量清单 CSV" }).click();
  await page.getByText("测量清单已导出", { exact: true }).waitFor();
  assert.match(
    await readFile(path.join(results, "measurements.csv"), "utf8"),
    /Living room/,
  );
  await page.getByTestId("file-input").setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nbroken"),
  });
  await page
    .getByRole("alert")
    .filter({ hasText: "打开失败，原图纸保留" })
    .waitFor();
  assert.match(await page.locator(".document-title").innerText(), /DimIt-Demo/);
  await page
    .getByTestId("file-input")
    .setInputFiles(path.resolve("tests/fixtures/locked.pdf"));
  await page
    .getByRole("alert")
    .filter({ hasText: "请先使用 PDF 阅读器解锁文件" })
    .waitFor();
  assert.match(await page.locator(".document-title").innerText(), /DimIt-Demo/);
  assert.equal(
    await page
      .getByRole("button", { name: "打开图纸", exact: true })
      .isEnabled(),
    true,
  );
  console.log(
    "PASS corrupt and encrypted PDFs preserve the active drawing and release the file operation lock",
  );
  await settled();
  assert.deepEqual(errors, []);
  console.log("PASS no renderer exceptions");
} finally {
  await app.close();
}
