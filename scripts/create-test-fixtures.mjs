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
