import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const profile = await mkdtemp(path.join(tmpdir(), "dim-it-language-"));
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
await mkdir("test-results", { recursive: true });
async function pick(x, y) {
  const b = await page.getByTestId("paper").boundingBox();
  await page.mouse.click(
    b.x + (x / 1000) * b.width,
    b.y + ((700 - y) / 700) * b.height,
  );
}
async function saved() {
  await page.waitForFunction(() =>
    document.querySelector(".statusbar")?.textContent.includes("Saved locally"),
  );
}
try {
  await page
    .getByRole("dialog", { name: "快速上手" })
    .getByLabel("Language / 语言")
    .selectOption("en");
  const guide = page.getByRole("dialog", { name: "Quick start" });
  await guide.waitFor();
  for (let n = 1; n <= 6; n++) {
    assert.equal(
      await guide
        .locator(".guide-content")
        .evaluate((e) => /[\u3400-\u9fff]/u.test(e.textContent)),
      false,
    );
    if (n < 6)
      await guide.getByRole("button", { name: "Next", exact: true }).click();
  }
  await guide.getByRole("button", { name: "Get started", exact: true }).click();
  await page
    .getByRole("button", { name: "Try the demo drawing", exact: true })
    .click();
  await saved();
  await page.getByRole("button", { name: "Calibrate", exact: true }).click();
  await pick(160, 550);
  await pick(460, 550);
  await page
    .getByRole("dialog", { name: "What is the actual dimension?" })
    .waitFor();
  await page.getByLabel("Known dimension", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Confirm calibration" }).click();
  assert.match(
    await page.getByRole("alert").innerText(),
    /Calibration length must be positive/,
  );
  await page.getByLabel("Known dimension", { exact: true }).fill("6000");
  await page.getByRole("button", { name: "Confirm calibration" }).click();
  await pick(160, 180);
  await pick(760, 180);
  await page
    .locator(".measurement-row")
    .filter({ hasText: "12,000.0 mm" })
    .waitFor();
  await saved();
  const dismiss = page.getByRole("button", { name: "Dismiss notification" });
  if (await dismiss.count()) await dismiss.click();
  await page.screenshot({ path: "test-results/english-workspace.png" });
  assert.equal(
    await page
      .locator("main")
      .evaluate((e) => /[\u3400-\u9fff]/u.test(e.textContent)),
    false,
  );
  await page.getByLabel("Language / 语言").selectOption("zh");
  await page.getByRole("button", { name: "长度测量", exact: true }).waitFor();
  assert.match(
    await page.locator(".measurement-row").innerText(),
    /12,000.0 mm/,
  );
  await page.getByLabel("Language / 语言").selectOption("en");
  await saved();
  await page.reload();
  await page.getByRole("dialog", { name: "Quick start" }).waitFor();
  await page.getByRole("button", { name: "Skip guide", exact: true }).click();
  await saved();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  const menu = await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu().items.map((i) => i.label),
  );
  assert.ok(menu.includes("File") && menu.includes("Help"));
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page.screenshot({ path: "test-results/english-quickstart.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: /Measurements CSV/ }).waitFor();
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  console.log(
    "PASS English guide, calibration validation, measurement, units, live switch, persistence, native menus and export labels",
  );
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
}
