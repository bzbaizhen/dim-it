import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, PDFName } from "pdf-lib";

const profile = await mkdtemp(path.join(tmpdir(), "dimit-regions-"));
const results = path.resolve("test-results");
await mkdir(results, { recursive: true });
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
const mod = process.platform === "darwin" ? "Meta" : "Control";
async function settled() {
  await frame();
  await page.waitForFunction(() => {
    const text = document.querySelector(".statusbar")?.textContent || "";
    return (
      text.includes("已本地保存") &&
      !text.includes("正在") &&
      document.querySelector(".overlay")?.getAttribute("data-snap-state") !==
        "loading"
    );
  });
}
async function frame() {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function press(key) {
  await page.keyboard.press(key);
  await frame();
}
async function regionCount(count) {
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll('[data-testid="region"]').length === expected,
    count,
  );
}
async function draftCount(count) {
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll(".region-draft circle").length === expected,
    count,
  );
}
async function position(x, y) {
  await frame();
  await page.waitForFunction(
    () =>
      document.querySelector(".overlay")?.getAttribute("data-snap-state") !==
      "loading",
  );
  const box = await page.getByTestId("paper").boundingBox();
  assert.ok(box);
  return {
    x: box.x + (x / 1000) * box.width,
    y: box.y + ((700 - y) / 700) * box.height,
  };
}
async function click(x, y) {
  const p = await position(x, y);
  await page.mouse.click(p.x, p.y);
  await frame();
}
async function drag(a, b, button = "left") {
  const p = await position(...a),
    q = await position(...b);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button });
  await page.mouse.move(q.x, q.y, { steps: 8 });
  await page.mouse.up({ button });
  await frame();
}
async function currentData() {
  await settled();
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("planmeasure-local", 1);
        r.onsuccess = () => {
          const db = r.result,
            q = db
              .transaction("projects")
              .objectStore("projects")
              .get("current");
          q.onsuccess = () => {
            resolve(q.result.data);
            db.close();
          };
          q.onerror = () => reject(q.error);
        };
        r.onerror = () => reject(r.error);
      }),
  );
}
let saved = 0;
async function save(extension = "planmeasure", key = "s") {
  const target = path.join(results, `fill-${++saved}.${extension}`);
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, target);
  await press(`${mod}+${key}`);
  for (let i = 0; i < 100; i++) {
    try {
      const bytes = await readFile(target);
      if (bytes.length) {
        await settled();
        return { target, bytes };
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Save did not create ${target}`);
}
async function lineInk() {
  return page.locator(".pdf-canvas").evaluate((canvas) => {
    const ratio = canvas.width / 1000,
      x = Math.round(460 * ratio),
      y = Math.round(((700 - 450) * canvas.height) / 700);
    const bytes = canvas.getContext("2d").getImageData(x - 12, y, 25, 1).data;
    let count = 0;
    for (let i = 0; i < bytes.length; i += 4)
      if (bytes[i] < 150 && bytes[i + 1] < 150 && bytes[i + 2] < 150) count++;
    return count;
  });
}
try {
  await page.getByLabel("下次不再显示").check();
  await page.getByRole("button", { name: "跳过说明", exact: true }).click();
  await page
    .getByRole("button", { name: "用示例图纸体验", exact: true })
    .click();
  await settled();
  // Thin lines operate on PDF strokes and preserve exact snap geometry.
  await page.getByTestId("drawing-overlay").focus();
  const thick = await lineInk();
  await press("Tab");
  await settled();
  assert.equal(
    await page.getByTestId("paper").getAttribute("data-thin-lines"),
    "true",
  );
  const thin = await lineInk();
  assert.ok(
    thin > 0 && thin < thick,
    `Expected reduced stroke width, normal=${thick}, thin=${thin}`,
  );
  await page.screenshot({ path: path.join(results, "thin-lines.png") });
  await press("Tab");
  await settled();
  assert.equal(await lineInk(), thick);
  console.log(
    `PASS Tab toggles actual PDF stroke pixels (${thick}→${thin}) and restores the original rendering`,
  );
  // Keep native OS pointer events from interrupting deterministic hover/drag tests.
  await app.evaluate(({ BrowserWindow }) => {
    const testWindow = BrowserWindow.getAllWindows()[0];
    testWindow.webContents.setBackgroundThrottling(false);
    testWindow.hide();
  });
  // No calibration is needed. Four directional rectangle gestures each create one item.
  await press("Digit3");
  await click(160, 180);
  // Park the OS cursor while exercising hover dwell through the SVG handler.
  await page.mouse.move(20, 20);
  await page.keyboard.down("Shift");
  const reference = await position(460, 350);
  await page.getByTestId("drawing-overlay").dispatchEvent("pointermove", {
    clientX: reference.x,
    clientY: reference.y,
    shiftKey: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await page.getByTestId("smart-reference").waitFor({ state: "attached" });
  let tracked = await position(460, 180);
  await page.getByTestId("drawing-overlay").dispatchEvent("pointermove", {
    clientX: tracked.x,
    clientY: tracked.y,
    shiftKey: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await page.getByTestId("smart-track-hit").waitFor({ state: "attached" });
  assert.equal(
    Number(
      await page.getByTestId("smart-track-hit").getAttribute("data-pdf-x"),
    ),
    460,
  );
  assert.equal(
    Number(
      await page.getByTestId("smart-track-hit").getAttribute("data-pdf-y"),
    ),
    180,
  );
  await page.keyboard.up("Shift");
  await press("Escape");
  await click(500, 400);
  await press("d");
  await settled();
  assert.equal(await page.locator(".region-draft").count(), 0);
  await press("a");
  await settled();
  console.log("PASS fill snapping/SmartTrack and page-change draft cleanup");
  for (const [a, b] of [
    [
      [190, 470],
      [400, 210],
    ],
    [
      [400, 470],
      [190, 210],
    ],
    [
      [190, 210],
      [400, 470],
    ],
    [
      [400, 210],
      [190, 470],
    ],
  ])
    await drag(a, b);
  await regionCount(4);
  let data = await currentData();
  assert.deepEqual(data.scales, {});
  assert.equal(data.regions.length, 4);
  assert.ok(
    data.regions.every((r) => r.kind === "rectangle" && r.opacity === 0.25),
  );
  await press(`${mod}+z`);
  await regionCount(3);
  await press(`${mod}+Shift+z`);
  await regionCount(4);
  // Select top-most overlapping fill, resize corner and check the fixed opposite.
  await page.getByRole("button", { name: "选择", exact: true }).click();
  await click(300, 400);
  await frame();
  assert.equal(
    await page.getByTestId("region").last().getAttribute("class"),
    "region-shape selected ",
  );
  const original = data.regions[3];
  await drag([original.a.x, original.a.y], [430, 240]);
  data = await currentData();
  assert.deepEqual(data.regions[3].b, original.b);
  assert.ok(Math.abs(data.regions[3].a.x - 430) < 0.1);
  await press(`${mod}+z`);
  data = await currentData();
  assert.deepEqual(data.regions[3], original);
  // A range drag/sequence is one history step, independent from later note edits.
  await page.getByTestId("region-row").last().click();
  const range = page.locator("#fill-opacity");
  await range.evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    for (const value of ["40", "55", "70"]) {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    input.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  assert.equal((await currentData()).regions[3].opacity, 0.7);
  await page.getByTestId("drawing-overlay").focus();
  await press(`${mod}+z`);
  assert.equal((await currentData()).regions[3].opacity, 0.25);
  await press(`${mod}+Shift+z`);
  assert.equal((await currentData()).regions[3].opacity, 0.7);
  await press("e");
  await page.getByLabel("标注备注").fill("Region note saved while editing");
  const firstSave = await save();
  const project = JSON.parse(firstSave.bytes);
  assert.equal(project.version, 3);
  assert.equal(project.data.regions[3].note, "Region note saved while editing");
  console.log(
    "PASS uncalibrated rectangles in all directions, topmost selection, opposite-fixed resizing, atomic opacity undo and save-while-editing note",
  );
  // Polygon point removal, pan, zoom, shortcut dialog and Tab preserve a live draft.
  await press("Digit3");
  await click(510, 470);
  await click(700, 470);
  await click(730, 380);
  await press("Backspace");
  await draftCount(2);
  await page.keyboard.down("Space");
  await drag([550, 420], [575, 430]);
  await page.keyboard.up("Space");
  await draftCount(2);
  await drag([550, 420], [540, 415], "middle");
  await draftCount(2);
  await press("x");
  await settled();
  await draftCount(2);
  await press("z");
  await settled();
  await press("F1");
  await page.getByRole("dialog", { name: "快捷键设置", exact: true }).waitFor();
  await press("Escape");
  await draftCount(2);
  await page.getByTestId("drawing-overlay").focus();
  await press("Tab");
  await settled();
  await draftCount(2);
  await click(700, 380);
  await press("Enter");
  await regionCount(5);
  assert.equal((await currentData()).regions[4].vertices.length, 3);
  // Double click closes with one final vertex, start-point closure adds no duplicate.
  await click(520, 320);
  await click(700, 320);
  let p = await position(680, 220);
  await page.mouse.dblclick(p.x, p.y, { delay: 80 });
  await frame();
  await regionCount(6);
  assert.equal((await currentData()).regions[5].vertices.length, 3);
  assert.equal(await page.locator(".region-draft").count(), 0);
  await click(810, 470);
  await click(910, 470);
  await click(910, 380);
  await click(810, 470);
  await regionCount(7);
  assert.equal((await currentData()).regions[6].vertices.length, 3);
  // Active polygon drags remain polygonal. Invalid closures remain editable.
  await click(810, 310);
  await drag([910, 310], [910, 210]);
  await click(810, 210);
  assert.equal(await page.getByTestId("region-preview").count(), 0);
  await press("Enter");
  await regionCount(8);
  await click(800, 470);
  await click(900, 380);
  await click(800, 380);
  await click(900, 470);
  await press("Enter");
  await regionCount(8);
  await draftCount(4);
  await press(`${mod}+s`);
  await page
    .getByText("请先完成区域或按 Esc 取消草稿", { exact: true })
    .waitFor();
  await draftCount(4);
  await press("Escape");
  assert.equal(await page.locator(".region-draft").count(), 0);
  assert.equal(
    await page.getByTestId("drawing-overlay").getAttribute("data-tool"),
    "fill",
  );
  await press("Escape");
  assert.equal(
    await page.getByTestId("drawing-overlay").getAttribute("data-tool"),
    "select",
  );
  // Invalid edited polygon is restored, one successful edit creates one undo record.
  await page.getByTestId("region-row").nth(4).click();
  const polygon = (await currentData()).regions[4];
  await drag(
    [polygon.vertices[0].x, polygon.vertices[0].y],
    [polygon.vertices[1].x, polygon.vertices[1].y],
  );
  assert.deepEqual((await currentData()).regions[4], polygon);
  await drag([polygon.vertices[0].x, polygon.vertices[0].y], [520, 450]);
  assert.notDeepEqual((await currentData()).regions[4], polygon);
  await press(`${mod}+z`);
  assert.deepEqual((await currentData()).regions[4], polygon);
  console.log(
    "PASS polygon closure by Enter/double-click/start, draft point removal, drag semantics, pan/zoom/Tab/modal preservation, invalid draft and edited-boundary recovery",
  );
  // Layer order and native menu share the keyboard command path exactly once.
  const beforeRotation = (await currentData()).rotations["1"] || 0;
  await press("r");
  await settled();
  assert.equal(
    (await currentData()).rotations["1"],
    (beforeRotation + 90) % 360,
  );
  await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu().getMenuItemById("rotateCCW");
    if (item.accelerator !== "Shift+R" || !item.enabled)
      throw new Error("Native menu binding/state mismatch");
    item.click();
  });
  await settled();
  assert.equal((await currentData()).rotations["1"], beforeRotation);
  await press("d");
  await settled();
  await regionCount(0);
  await press("a");
  await settled();
  await regionCount(8);
  await page.getByRole("button", { name: "适合页面", exact: true }).click();
  await settled();
  await page.screenshot({ path: path.join(results, "region-fill.png") });
  const savedProject = await save();
  data = JSON.parse(savedProject.bytes).data;
  await page.getByTestId("file-input").setInputFiles(savedProject.target);
  await settled();
  assert.deepEqual(await currentData(), data);
  await page.reload();
  await page.getByTestId("paper").waitFor();
  await settled();
  assert.deepEqual(await currentData(), data);
  const pdf = await save("pdf", "e");
  const parsed = await PDFDocument.load(pdf.bytes, { updateMetadata: false });
  assert.equal(parsed.getPageCount(), 2);
  assert.equal(parsed.getProducer(), "Dim It 0.4.3");
  const states = parsed
    .getPage(0)
    .node.Resources()
    .lookup(PDFName.of("ExtGState"))
    .toString();
  assert.match(states, /\/BM \/Multiply/);
  assert.match(states, /\/ca 0.25/);
  assert.match(states, /\/ca 0.7/);
  const exported = path.join(results, "fill-export.pdf");
  await writeFile(exported, pdf.bytes);
  await page.getByTestId("file-input").setInputFiles(exported);
  await settled();
  await page.screenshot({ path: path.join(results, "region-export.png") });
  await regionCount(0);
  // v1 records without regions still load, and uncalibrated tool request returns after calibration.
  const legacy = JSON.parse(savedProject.bytes);
  legacy.version = 1;
  delete legacy.data.regions;
  legacy.data.measurements = [];
  legacy.data.rotations = {};
  const legacyPath = path.join(results, "fill-legacy.planmeasure");
  await writeFile(legacyPath, JSON.stringify(legacy));
  await page.getByTestId("file-input").setInputFiles(legacyPath);
  await settled();
  assert.deepEqual((await currentData()).regions, []);
  await page.getByTestId("drawing-overlay").focus();
  await press("Digit2");
  assert.equal(
    await page.getByTestId("drawing-overlay").getAttribute("data-tool"),
    "calibrate",
  );
  await click(160, 550);
  await click(460, 550);
  await page.getByLabel("已知尺寸", { exact: true }).fill("6000");
  await page.getByRole("button", { name: "确认校准", exact: true }).click();
  assert.equal(
    await page.getByTestId("drawing-overlay").getAttribute("data-tool"),
    "curve",
  );
  await press("Digit1");
  await click(160, 180);
  await click(760, 180);
  assert.match(
    await page.locator(".measurement-row").innerText(),
    /12,000.0 mm/,
  );
  await save();
  // Exercise the complete mixed-annotation flow in one project.
  await page
    .getByTestId("file-input")
    .setInputFiles(path.resolve("tests/fixtures/curves.pdf"));
  await settled();
  const fixturePoint = async (x, y) => {
    await frame();
    const b = await page.getByTestId("paper").boundingBox();
    return {
      x: b.x + (x / 600) * b.width,
      y: b.y + ((450 - y) / 450) * b.height,
    };
  };
  const fixtureClick = async (x, y) => {
    const p = await fixturePoint(x, y);
    await page.mouse.click(p.x, p.y);
    await frame();
  };
  await press("Digit4");
  await fixtureClick(100, 50);
  await fixtureClick(300, 50);
  await page.getByLabel("已知尺寸", { exact: true }).fill("2000");
  await page.getByRole("button", { name: "确认校准", exact: true }).click();
  await press("Digit1");
  await fixtureClick(100, 50);
  await fixtureClick(300, 50);
  await press("Digit2");
  await fixtureClick(270.710678, 270.710678);
  await press("Digit3");
  const ra = await fixturePoint(100, 50),
    rb = await fixturePoint(320, 320);
  await page.mouse.move(ra.x, ra.y);
  await page.mouse.down();
  await page.mouse.move(rb.x, rb.y, { steps: 8 });
  await page.mouse.up();
  await frame();
  await press("d");
  await settled();
  await press("a");
  await settled();
  const mixed = JSON.parse((await save()).bytes);
  assert.equal(mixed.version, 3);
  assert.equal(mixed.data.measurements.length, 2);
  assert.equal(mixed.data.regions.length, 1);
  assert.ok(mixed.data.measurements[1].path.length > 20);
  const csv = (await save("csv", "Shift+e")).bytes.toString();
  assert.equal(csv.trim().split("\n").length, 3);
  console.log(
    "PASS 4 calibration → 1 line → 2 curve → 3 fill → A/D navigation → v3 save and lengths-only CSV",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS single-dispatch native/keyboard rotation, A/D navigation, v3 save/reopen/autorecovery/PDF, legacy v1 normalization and deferred curve-tool calibration",
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  const process = app.process();
  if (process.exitCode === null)
    await new Promise((resolve) => process.once("exit", resolve));
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
