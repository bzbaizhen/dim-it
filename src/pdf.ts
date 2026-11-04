import { pathMidpoint } from "./curve.ts";
import { t } from "./i18n.ts";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import {
  formatDistance,
  measurementMM,
  type ProjectData,
  type Point,
} from "./core";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { extractSegments, SnapIndex } from "./snap";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function loadSnapIndex(
  pdf: PDFDocumentProxy,
  page: number,
): Promise<SnapIndex> {
  const item = await pdf.getPage(page);
  const list = await item.getOperatorList();
  const curves: Point[][] = [];
  return new SnapIndex(
    extractSegments(list, pdfjs.OPS, curves),
    item.view as [number, number, number, number],
    curves,
  );
}

export async function openPDF(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  // Copy before PDF.js transfers the buffer to its worker.
  const assetUrl = new URL("pdf-assets/", window.location.href).href;
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    cMapUrl: `${assetUrl}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetUrl}standard_fonts/`,
    wasmUrl: `${assetUrl}wasm/`,
  });
  try {
    return await task.promise;
  } catch (error) {
    await task.destroy().catch(() => {});
    if (error instanceof Error && error.name === "PasswordException") {
      throw new Error(t("请先使用 PDF 阅读器解锁文件，再打开"));
    }
    throw error;
  }
}

export async function createDemo(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (let index = 0; index < 2; index++) {
    const page = pdf.addPage([1000, 700]);
    const ink = rgb(0.22, 0.29, 0.35);
    const line = (a: Point, b: Point, width = 1) =>
      page.drawLine({ start: a, end: b, color: ink, thickness: width });
    const text = (value: string, x: number, y: number, size = 11) =>
      page.drawText(value, { x, y, size, font, color: ink });
    page.drawRectangle({
      x: 25,
      y: 25,
      width: 950,
      height: 650,
      borderColor: ink,
      borderWidth: 1,
    });
    page.drawText("GROUND FLOOR / CALIBRATION STUDY", {
      x: 65,
      y: 626,
      size: 21,
      font: bold,
      color: ink,
    });
    text(
      "Use the 6,000 mm reference line to calibrate, then measure the rooms.",
      65,
      602,
    );
    const x = 160,
      y = 180,
      width = 600,
      height = 330;
    page.drawRectangle({
      x,
      y,
      width,
      height,
      borderColor: ink,
      borderWidth: 5,
    });
    line({ x: 460, y }, { x: 460, y: y + height }, 4);
    line({ x: 460, y: 350 }, { x: 760, y: 350 }, 4);
    for (const wx of [220, 350, 550, 680]) {
      page.drawRectangle({
        x: wx,
        y: y + height - 4,
        width: 55,
        height: 8,
        color: rgb(1, 1, 1),
        borderColor: ink,
        borderWidth: 1,
      });
    }
    text("LIVING / DINING", 260, 340, 16);
    text("6,000 x 6,600 mm", 262, 315, 12);
    text("BEDROOM", 570, 440, 16);
    text("6,000 x 3,200 mm", 562, 415, 12);
    text("STUDIO", 580, 265, 16);
    text("6,000 x 3,400 mm", 562, 240, 12);
    line({ x: 160, y: 550 }, { x: 460, y: 550 });
    for (const dx of [160, 460]) {
      line({ x: dx, y: 525 }, { x: dx, y: 566 }, 0.6);
      line({ x: dx - 5, y: 545 }, { x: dx + 5, y: 555 }, 1.6);
    }
    text("6,000 mm", 285, 560, 14);
    line({ x: 160, y: 135 }, { x: 760, y: 135 });
    for (const dx of [160, 760])
      line({ x: dx, y: 120 }, { x: dx, y: 160 }, 0.7);
    text("12,000 mm", 425, 113, 12);
    text("DEMO DRAWING / NOT FOR CONSTRUCTION", 65, 65, 10);
    text(
      `A-10${index + 1}    |    SCALE 1:56.69    |    ${index === 0 ? "METRIC STUDY" : "SECOND SHEET - CALIBRATE SEPARATELY"}`,
      520,
      65,
      10,
    );
  }
  return pdf.save();
}

export async function exportPDF(
  bytes: Uint8Array,
  data: ProjectData,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  for (const item of data.measurements) {
    const mm = measurementMM(item, data);
    if (mm === null) continue;
    const page = pages[item.page - 1];
    const color = rgb(
      ...([1, 3, 5].map(
        (start) => parseInt(item.color.slice(start, start + 2), 16) / 255,
      ) as [number, number, number]),
    );
    const angle =
      (((page.getRotation().angle + (data.rotations[item.page] || 0)) % 360) +
        360) %
      360;
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians),
      sin = Math.sin(radians);
    const path = item.path || [item.a, item.b];
    for (let index = 1; index < path.length; index++)
      page.drawLine({
        start: path[index - 1],
        end: path[index],
        thickness: 1.2,
        color,
      });
    for (const point of [item.a, item.b]) {
      const adjacent = point === item.a ? path[1] : path[path.length - 2];
      const tangentLength = Math.hypot(
        point.x - adjacent.x,
        point.y - adjacent.y,
      );
      const tx = tangentLength
        ? (-(point.y - adjacent.y) / tangentLength) * 5
        : 0;
      const ty = tangentLength
        ? ((point.x - adjacent.x) / tangentLength) * 5
        : 5;
      page.drawLine({
        start: { x: point.x - tx, y: point.y - ty },
        end: { x: point.x + tx, y: point.y + ty },
        thickness: 1.2,
        color,
      });
    }
    const label = formatDistance(mm, data.unit, data.precision);
    const size = 10,
      padding = 4;
    const width = font.widthOfTextAtSize(label, size) + padding * 2;
    const height = size + padding * 2;
    const center = pathMidpoint(path);
    const origin = {
      x: center.x - (width / 2) * cos - 4 * sin,
      y: center.y - (width / 2) * sin + 4 * cos,
    };
    page.drawRectangle({
      x: origin.x,
      y: origin.y,
      width,
      height,
      rotate: degrees(angle),
      color: rgb(1, 1, 1),
      borderColor: color,
      borderWidth: 0.7,
    });
    page.drawText(label, {
      x: origin.x + padding * cos - (padding + 2) * sin,
      y: origin.y + padding * sin + (padding + 2) * cos,
      size,
      font,
      color,
      rotate: degrees(angle),
    });
  }
  for (let index = 0; index < pages.length; index++) {
    pages[index].setRotation(
      degrees(
        (pages[index].getRotation().angle + (data.rotations[index + 1] || 0)) %
          360,
      ),
    );
  }
  pdf.setProducer("Dim It 0.4.2");
  return pdf.save();
}
