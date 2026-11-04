// All test pages are generated geometry. No customer drawings are required.
import { mkdir, writeFile } from "node:fs/promises";
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFHexString,
  degrees,
  rgb,
} from "pdf-lib";

await mkdir("tests/fixtures", { recursive: true });
const pdf = await PDFDocument.create();
for (const rotation of [0, 90, 270]) {
  const page = pdf.addPage([600, 450]);
  page.setRotation(degrees(rotation));
  const color = rgb(0.2, 0.3, 0.4);
  page.drawLine({ start: { x: 100, y: 100 }, end: { x: 400, y: 100 }, color });
  page.drawLine({ start: { x: 320, y: 40 }, end: { x: 320, y: 180 }, color });
  page.drawRectangle({
    x: 100,
    y: 250,
    width: 200,
    height: 100,
    borderColor: color,
    borderWidth: 1,
  });
}
pdf.addPage([600, 450]);
const embedded = await pdf.embedPage(pdf.getPage(0));
pdf
  .addPage([600, 450])
  .drawPage(embedded, { x: 20, y: 30, xScale: 0.5, yScale: 0.8 });
await writeFile("tests/fixtures/snap.pdf", await pdf.save());

// A blank page with a synthetic password dictionary exercises PDF.js rejection.
const locked = await PDFDocument.create();
locked.addPage([600, 800]);
const encryption = locked.context.obj({
  Filter: PDFName.of("Standard"),
  V: PDFNumber.of(2),
  R: PDFNumber.of(3),
  Length: PDFNumber.of(128),
  P: PDFNumber.of(-4),
  O: PDFHexString.of("01".repeat(32)),
  U: PDFHexString.of("02".repeat(32)),
});
locked.context.trailerInfo.Encrypt = locked.context.register(encryption);
await writeFile(
  "tests/fixtures/locked.pdf",
  await locked.save({ useObjectStreams: false }),
);
console.log("Generated synthetic geometry and blank password fixtures");

const curves = await PDFDocument.create();
for (const rotation of [0, 90, 270]) {
  const page = curves.addPage([600, 450]);
  page.setRotation(degrees(rotation));
  page.drawLine({
    start: { x: 100, y: 50 },
    end: { x: 300, y: 50 },
    thickness: 1,
  });
  // drawSvgPath flips SVG Y. Translate it back into native PDF coordinates.
  page.drawSvgPath(
    "M 100 200 L 300 200 C 300 144.771525 255.228475 100 200 100 L 200 50",
    { x: 0, y: 400, borderWidth: 1, borderColor: rgb(0.2, 0.3, 0.4) },
  );
  page.drawSvgPath("M 100 70 C 200 170 400 -30 500 70", {
    x: 0,
    y: 450,
    borderWidth: 1,
    borderColor: rgb(0.2, 0.3, 0.4),
  });
  page.drawEllipse({
    x: 450,
    y: 180,
    xScale: 45,
    yScale: 45,
    borderWidth: 1,
    borderColor: rgb(0.2, 0.3, 0.4),
  });
}
const form = await curves.embedPage(curves.getPage(0));
curves
  .addPage([600, 450])
  .drawPage(form, { x: 20, y: 30, xScale: 0.5, yScale: 0.8 });
curves.addPage([600, 450]);
await writeFile("tests/fixtures/curves.pdf", await curves.save());
