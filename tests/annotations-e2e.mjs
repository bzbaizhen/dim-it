import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";

const profile = await mkdtemp(path.join(tmpdir(), "dim-it-annotations-"));
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
page.on("pageerror", (error) => {
  errors.push(error.message);
  console.error(error.stack);
});
page.on("dialog", (dialog) => void dialog.accept().catch(() => {}));
const mod = process.platform === "darwin" ? "Meta" : "Control";

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
    return (
      /已本地保存|Saved locally/.test(status) &&
      !/正在|Rendering|Opening/.test(status)
    );
  });
}
async function press(key) {
  await page.keyboard.press(key);
  await frame();
}
async function draw(tool, a, b) {
  await page.getByTestId("drawing-overlay").focus();
  await press(tool);
  const box = await page.getByTestId("paper").boundingBox();
  const point = ([x, y]) => ({
    x: box.x + box.width * x,
    y: box.y + box.height * y,
  });
  const start = point(a),
    end = point(b);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await frame();
}
async function editNote(text) {
  await page.locator("#note").fill(text);
  await press(`${mod}+Enter`);
  await settled();
}
async function setAppearance(id, value) {
  const control = page.locator(`#markup-${id}`);
  await control.evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(element, String(value));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await frame();
  await control.focus();
  await control.blur();
  await frame();
}
async function checkCompactAppearance() {
  const panel = await page.locator(".appearance-panel").boundingBox();
  assert.ok(panel.height <= 210, `Appearance panel height ${panel.height}`);
  assert.equal(
    await page
      .locator(".appearance-panel")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
    true,
  );
  for (const channel of ["text", "background", "border"]) {
    const color = await page.locator(`#markup-${channel}-color`).boundingBox();
    const opacity = await page
      .locator(`#markup-${channel}-opacity`)
      .boundingBox();
    assert.ok(
      Math.abs(color.y + color.height / 2 - opacity.y - opacity.height / 2) < 1,
    );
    assert.ok(opacity.width >= 55, `Opacity slider width ${opacity.width}`);
    assert.ok(color.x + color.width < opacity.x);
    assert.ok(opacity.x + opacity.width <= panel.x + panel.width);
  }
  return panel.height;
}
async function data() {
  await settled();
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.open("planmeasure-local", 1);
        request.onsuccess = () => {
          const db = request.result;
          const query = db
            .transaction("projects")
            .objectStore("projects")
            .get("current-state");
          query.onsuccess = () => {
            resolve(query.result.data);
            db.close();
          };
        };
      }),
  );
}
async function save(name, key) {
  const target = path.join(results, name);
  await rm(target, { force: true });
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, target);
  await press(`${mod}+${key}`);
  await page.waitForFunction(
    () => !document.querySelector(".statusbar")?.textContent.includes("正在"),
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const bytes = await readFile(target);
      if (bytes.length) return { target, bytes };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Save did not create ${target}`);
}
async function open(target) {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [filePath],
    });
  }, target);
  await page.getByTestId("drawing-overlay").focus();
  await press(`${mod}+o`);
  await settled();
}

try {
  await page.getByLabel("下次不再显示").check();
  await page.getByRole("button", { name: "跳过说明", exact: true }).click();
  await page
    .getByRole("button", { name: "用示例图纸体验", exact: true })
    .click();
  await settled();
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.setBackgroundThrottling(false);
    window.hide();
  });

  // Markup and revision are available before scale calibration.
  await page.getByTestId("drawing-overlay").focus();
  await press("Digit5");
  await setAppearance("background-color", "#f4f0ff");
  await setAppearance("background-opacity", 20);
  await draw("Digit5", [0.2, 0.24], [0.5, 0.4]);
  assert.equal(
    await page
      .locator("#note")
      .evaluate((element) => element === document.activeElement),
    true,
  );
  await editNote("请复核门洞尺寸\nCheck opening before construction");
  let saved = await data();
  assert.equal(saved.annotations.length, 1);
  assert.equal(saved.annotations[0].kind, "markup");
  assert.equal(saved.annotations[0].style.backgroundColor, "#f4f0ff");
  assert.equal(saved.annotations[0].style.backgroundOpacity, 0.2);
  assert.deepEqual(saved.scales, {});
  await page.getByLabel("文字字号").selectOption("18");
  // Changing style must also retain text committed by the preceding blur event.
  await page.locator("#markup-text-color").focus();
  await page
    .locator("#note")
    .fill("请复核门洞尺寸\nCheck opening before construction");
  await page.getByRole("button", { name: "颜色 #198267", exact: true }).click();
  saved = await data();
  assert.equal(saved.annotations[0].fontSize, 18);
  assert.equal(saved.annotations[0].color, "#198267");
  assert.equal(
    saved.annotations[0].note,
    "请复核门洞尺寸\nCheck opening before construction",
  );

  // Each channel is independent, and slider gestures produce one undo step.
  await setAppearance("text-color", "#234567");
  await setAppearance("background-color", "#ffe4a3");
  await setAppearance("border-color", "#9b5bc2");
  await setAppearance("text-opacity", 80);
  await setAppearance("background-opacity", 35);
  const opacity = page.locator("#markup-border-opacity");
  await opacity.scrollIntoViewIfNeeded();
  const slider = await opacity.boundingBox();
  await page.mouse.move(
    slider.x + slider.width - 8,
    slider.y + slider.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    slider.x + slider.width * 0.65,
    slider.y + slider.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  const draggedOpacity = (await data()).annotations[0].style.borderOpacity;
  assert.ok(draggedOpacity > 0.5 && draggedOpacity < 0.8);
  await page.getByTestId("drawing-overlay").focus();
  await press(`${mod}+z`);
  assert.equal((await data()).annotations[0].style.borderOpacity, 1);
  await press(`${mod}+Shift+z`);
  assert.equal(
    (await data()).annotations[0].style.borderOpacity,
    draggedOpacity,
  );
  await setAppearance("border-opacity", 65);
  const appearance = {
    textColor: "#234567",
    textOpacity: 0.8,
    backgroundColor: "#ffe4a3",
    backgroundOpacity: 0.35,
    borderColor: "#9b5bc2",
    borderOpacity: 0.65,
  };
  saved = await data();
  assert.deepEqual(saved.annotations[0].style, appearance);
  const markupRect = page
    .getByTestId("drawing-annotation")
    .locator(":scope > rect")
    .first();
  assert.equal(
    await markupRect.getAttribute("fill"),
    appearance.backgroundColor,
  );
  assert.equal(await markupRect.getAttribute("fill-opacity"), "0.35");
  assert.equal(await markupRect.getAttribute("stroke"), appearance.borderColor);
  assert.equal(await markupRect.getAttribute("stroke-opacity"), "0.65");
  await setAppearance("background-opacity", 0);
  await setAppearance("border-opacity", 0);
  await setAppearance("text-opacity", 0);
  assert.equal(await markupRect.getAttribute("fill-opacity"), "0");
  assert.equal(await markupRect.getAttribute("stroke-opacity"), "0");
  const transparent = await save("annotations-transparent.pdf", "e");
  const transparentPdf = await PDFDocument.load(transparent.bytes);
  const transparentStates = transparentPdf
    .getPage(0)
    .node.Resources()
    .lookup(PDFName.of("ExtGState"), PDFDict);
  assert.ok(
    transparentStates.entries().some(([, ref]) => {
      const state = transparentPdf.context.lookup(ref, PDFDict);
      return (
        state.get(PDFName.of("ca"))?.asNumber() === 0 &&
        state.get(PDFName.of("CA"))?.asNumber() === 0
      );
    }),
  );
  await setAppearance("text-opacity", 80);
  await setAppearance("background-opacity", 35);
  await setAppearance("border-opacity", 65);
  await page
    .locator(".inspector")
    .evaluate((element) => (element.scrollTop = 0));
  const compactHeight = await checkCompactAppearance();
  console.log(
    `PASS compact appearance panel ${compactHeight}px, aligned controls and usable sliders`,
  );
  await page.screenshot({
    path: path.join(results, "annotations-appearance.png"),
  });

  const markup = page.getByTestId("drawing-annotation");
  let box = await markup.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 35,
    box.y + box.height / 2 + 20,
    { steps: 5 },
  );
  await page.mouse.up();
  const moved = (await data()).annotations[0];
  assert.notDeepEqual(moved.origin, saved.annotations[0].origin);
  await press(`${mod}+z`);
  assert.deepEqual(
    (await data()).annotations[0].origin,
    saved.annotations[0].origin,
  );
  await press(`${mod}+Shift+z`);
  assert.deepEqual((await data()).annotations[0].origin, moved.origin);

  const handle = page.getByTestId("annotation-handle").nth(2);
  box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 40,
    box.y + box.height / 2 + 25,
    { steps: 5 },
  );
  await page.mouse.up();
  assert.ok((await data()).annotations[0].width > moved.width);
  await press("Delete");
  assert.equal((await data()).annotations.length, 0);
  await press(`${mod}+z`);
  assert.equal((await data()).annotations.length, 1);

  await draw("Digit6", [0.58, 0.29], [0.85, 0.62]);
  assert.equal(await page.locator("#revision-label").inputValue(), "1");
  await page.locator("#revision-label").fill("A1");
  await press("Enter");
  await editNote("墙体位置调整，待设计确认");
  const revisionOpacity = page.getByRole("slider", { name: "修订不透明度", exact: true });
  await revisionOpacity.press("PageDown");
  await page.getByLabel("修订颜色").fill("#198267");
  assert.equal(
    await page
      .locator('[data-kind="revision"] > path')
      .getAttribute("stroke-opacity"),
    "0.9",
  );
  saved = await data();
  assert.equal(saved.annotations[1].label, "A1");
  assert.equal(saved.annotations[1].note, "墙体位置调整，待设计确认");
  assert.equal(saved.annotations[1].color, "#198267");
  assert.equal(saved.annotations[1].opacity, 0.9);
  await page.screenshot({
    path: path.join(results, "annotations-workspace.png"),
  });
  const normalExport = await save("annotations.pdf", "e");
  const pdf = await PDFDocument.load(normalExport.bytes);
  assert.equal(pdf.getPageCount(), 2);
  const resources = pdf.getPage(0).node.Resources();
  const states = resources.lookup(PDFName.of("ExtGState"), PDFDict);
  assert.match(states.toString(), /\/CA 0.9/);
  assert.match(states.toString(), /\/ca 0.9/);
  assert.ok(
    states.entries().some(([, ref]) => {
      const state = pdf.context.lookup(ref, PDFDict);
      return (
        state.get(PDFName.of("ca"))?.asNumber() === 0.35 &&
        state.get(PDFName.of("CA"))?.asNumber() === 0.65
      );
    }),
  );
  const objects = resources.lookup(PDFName.of("XObject"), PDFDict);
  const masks = objects.entries().flatMap(([, ref]) => {
    const image = pdf.context.lookup(ref, PDFRawStream);
    const mask = image.dict.get(PDFName.of("SMask"));
    return mask
      ? [decodePDFRawStream(pdf.context.lookup(mask, PDFRawStream)).decode()]
      : [];
  });
  assert.ok(
    masks.some(
      (pixels) =>
        pixels.reduce((max, value) => Math.max(max, value), 0) === 204,
    ),
  );
  console.log(
    "PASS uncalibrated markup and revision, multiline Chinese, color, size, move, resize, undo, redo and delete",
  );

  // A cancelled gesture makes no project or history change.
  await page.getByTestId("drawing-overlay").focus();
  await press("Digit6");
  box = await page.getByTestId("paper").boundingBox();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.8, {
    steps: 5,
  });
  await press("Escape");
  await page.mouse.up();
  assert.equal((await data()).annotations.length, 2);

  await page.getByTestId("drawing-overlay").focus();
  await press("d");
  await settled();
  assert.equal(await page.getByTestId("drawing-annotation").count(), 0);
  await press("a");
  await settled();
  assert.equal(await page.getByTestId("drawing-annotation").count(), 2);

  // New annotations stay upright in their creation view, then follow page rotation.
  for (const rotation of [90, 180, 270]) {
    await page.getByTestId("drawing-overlay").focus();
    await press("r");
    await settled();
    await draw("Digit5", [0.12, 0.12], [0.38, 0.26]);
    await editNote(`旋转 ${rotation}°\nReview ${rotation}`);
    saved = await data();
    assert.equal(saved.annotations.at(-1).rotation, rotation);
    assert.equal(saved.annotations.at(-1).style.backgroundColor, "#f4f0ff");
    assert.equal(saved.annotations.at(-1).style.backgroundOpacity, 0.2);
    const matrix = await page
      .getByTestId("drawing-annotation")
      .last()
      .getAttribute("transform");
    const values = matrix.match(/[-\d.]+/g).map(Number);
    assert.ok(
      values[0] > 0 &&
        values[3] > 0 &&
        Math.abs(values[1]) < 0.001 &&
        Math.abs(values[2]) < 0.001,
    );
  }
  await page.getByLabel("Language / 语言").selectOption("en");
  await page
    .getByRole("button", { name: "Text markup", exact: true })
    .waitFor();
  assert.equal(
    await page.locator("main").evaluate((element) => {
      const clone = element.cloneNode(true);
      clone
        .querySelectorAll(
          ".annotation-layer, .annotation-records, .drawing-editor",
        )
        .forEach((item) => item.remove());
      return /[\u3400-\u9fff]/u.test(clone.textContent);
    }),
    false,
  );
  await page.getByLabel("Language / 语言").selectOption("zh");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1000, 650),
  );
  await page.waitForFunction(() => window.innerWidth === 1000);
  await checkCompactAppearance();
  await page.getByLabel("Language / 语言").selectOption("en");
  await checkCompactAppearance();
  await page.screenshot({
    path: path.join(results, "annotations-appearance-compact-minimum-en.png"),
  });
  await page.getByLabel("Language / 语言").selectOption("zh");
  assert.equal(
    await page
      .locator(".toolbar")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
    true,
  );
  await page.getByRole("button", { name: "导出", exact: true }).click();
  const menuBounds = await page.locator(".dropdown").boundingBox();
  assert.ok(menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= 1000);
  await press("Escape");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1480, 960),
  );
  await frame();
  const project = await save("annotations.planmeasure", "s");
  assert.equal(JSON.parse(project.bytes.toString()).version, 4);
  await page.reload();
  await settled();
  assert.equal((await data()).annotations.length, 5);
  await open(project.target);
  assert.deepEqual((await data()).annotations, saved.annotations);
  const rotatedExport = await save("annotations-rotated.pdf", "e");
  assert.equal(
    (await PDFDocument.load(rotatedExport.bytes)).getPage(0).getRotation()
      .angle,
    270,
  );
  await open(normalExport.target);
  await page.screenshot({ path: path.join(results, "annotations-export.png") });
  await open(rotatedExport.target);
  await page.screenshot({
    path: path.join(results, "annotations-rotated-export.png"),
  });
  const legacy = JSON.parse(project.bytes.toString());
  legacy.data.annotations.forEach((item) => {
    delete item.style;
    delete item.opacity;
  });
  const legacyPath = path.join(results, "annotations-legacy.planmeasure");
  await writeFile(legacyPath, JSON.stringify(legacy));
  await open(legacyPath);
  await page.getByTestId("annotation-row").first().click();
  assert.equal(
    await page.locator("#markup-text-color").inputValue(),
    appearance.textColor,
  );
  assert.equal(
    await page.locator("#markup-border-color").inputValue(),
    appearance.textColor,
  );
  assert.equal(
    await page.locator("#markup-background-color").inputValue(),
    "#ffffff",
  );
  assert.equal(
    await page.locator("#markup-background-opacity").inputValue(),
    "94",
  );
  await page.getByTestId("annotation-row").nth(1).click();
  assert.equal(await revisionOpacity.inputValue(), "100");
  assert.deepEqual(errors, []);
  console.log(
    "PASS independent appearance channels, transparent PDF, defaults, atomic opacity undo, legacy compatibility, rotations, bilingual UI, autosave and project reopen",
  );
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
}
