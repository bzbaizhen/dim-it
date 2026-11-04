import { _electron as electron } from "playwright";
import { PDFDocument } from "pdf-lib";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const profile = await mkdtemp(path.join(tmpdir(), "dimit-overlap-"));
const pdf = await PDFDocument.create();
pdf.addPage([600, 450]);
const data = {
  unit: "mm",
  precision: 1,
  rotations: {},
  scales: {
    1: {
      a: { x: 100, y: 200 },
      b: { x: 300, y: 200 },
      millimeters: 2000,
      mmPerPoint: 10,
    },
  },
  measurements: [
    {
      id: "length",
      page: 1,
      a: { x: 100, y: 200 },
      b: { x: 500, y: 200 },
      color: "#187bc1",
      note: "",
    },
  ],
  regions: [
    {
      id: "region",
      page: 1,
      kind: "rectangle",
      a: { x: 200, y: 200 },
      b: { x: 400, y: 350 },
      color: "#16846a",
      opacity: 0.25,
      note: "",
    },
  ],
};
const fixture = path.join(profile, "overlap.planmeasure");
await writeFile(
  fixture,
  JSON.stringify({
    version: 3,
    filename: "Synthetic-overlap.pdf",
    pdf: Buffer.from(await pdf.save()).toString("base64"),
    data,
  }),
);
const app = await electron.launch({
  args: [".", `--user-data-dir=${profile}`],
  timeout: 60000,
});
const page = await app.firstWindow();
page.setDefaultTimeout(15000);
page.on("dialog", (d) => void d.accept().catch(() => {}));
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.webContents.setBackgroundThrottling(false);
  w.hide();
});
async function frame() {
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}
try {
  await page.getByRole("button", { name: "跳过说明", exact: true }).click();
  await page.getByTestId("file-input").setInputFiles(fixture);
  await page.getByTestId("region-row").waitFor();
  await page.getByTestId("region-row").click();
  await frame();
  const handle = await page.getByTestId("region-vertex").first().boundingBox();
  assert.ok(handle);
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.width / 2 + 30,
    handle.y + handle.height / 2 - 30,
    { steps: 8 },
  );
  await page.mouse.up();
  await frame();
  assert.match(
    await page.getByTestId("region-row").getAttribute("class"),
    /selected/,
    "Region handle must receive pointer input above an overlapping measurement",
  );
  const moved = await page.getByTestId("region-vertex").first().boundingBox();
  assert.ok(moved.x > handle.x + 25);
  await page.getByTestId("drawing-overlay").focus();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+z" : "Control+z",
  );
  await frame();
  await page.getByTestId("region-row").click();
  await frame();
  const restored = await page
    .getByTestId("region-vertex")
    .first()
    .boundingBox();
  assert.ok(Math.abs(restored.x - handle.x) < 0.1);
  console.log(
    "PASS region vertex above crossing dimension hit area, fixed opposite and one-step undo",
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  const p = app.process();
  if (p.exitCode === null) await new Promise((r) => p.once("exit", r));
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
