import { version as appVersion } from "../package.json" with { type: "json" };
import { PDFCanvasFactory } from "./thinLines.ts";
import {
  annotationFont,
  annotationPoint,
  markupLines,
  markupStyle,
  revisionCloudPath,
  revisionTag,
  textPadding,
} from "./annotations.ts";
import { regionVertices } from "./regions.ts";
import { pathMidpoint } from "./curve.ts";
import { t } from "./i18n.ts";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  PDFDocument, StandardFonts, rgb, degrees, BlendMode,
  pushGraphicsState, popGraphicsState, setGraphicsState,
  setStrokingColor, setLineWidth, setDashPattern, setLineCap, setLineJoin,
  LineCapStyle, LineJoinStyle, moveTo, lineTo, stroke,
} from "pdf-lib";
import {
  formatDistance,
  measurementMM,
  type ProjectData,
  type Point,
} from "./core";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { extractSegments, SnapIndex } from "./snap";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

function hexColor(value: string) {
  return rgb(
    parseInt(value.slice(1, 3), 16) / 255,
    parseInt(value.slice(3, 5), 16) / 255,
    parseInt(value.slice(5, 7), 16) / 255,
  );
}

export async function loadSnapIndex(
  pdf: PDFDocumentProxy,
  page: number,
): Promise<SnapIndex> {
  const item = await pdf.getPage(page);
  const list = await item.getOperatorList();
  const curves: Point[][] = [];
  const beziers: Point[][] = [];
  return new SnapIndex(
    extractSegments(list, pdfjs.OPS, curves, beziers),
    item.view as [number, number, number, number],
    curves,
    beziers,
  );
}

const canvasFactories = new WeakMap<PDFDocumentProxy, PDFCanvasFactory>();
export function setThinLines(pdf: PDFDocumentProxy, enabled: boolean) {
  const factory = canvasFactories.get(pdf);
  if (factory) factory.thinLines = enabled;
}

export async function openPDF(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  // Copy before PDF.js transfers the buffer to its worker.
  const assetUrl = new URL("pdf-assets/", window.location.href).href;
  let factory: PDFCanvasFactory;
  class CanvasFactory extends PDFCanvasFactory {
    constructor(options: ConstructorParameters<typeof PDFCanvasFactory>[0]) {
      super(options);
      factory = this;
    }
  }
  const task = pdfjs.getDocument({
    CanvasFactory,
    data: bytes.slice(),
    cMapUrl: `${assetUrl}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetUrl}standard_fonts/`,
    wasmUrl: `${assetUrl}wasm/`,
  });
  try {
    const pdf = await task.promise;
    canvasFactories.set(pdf, factory!);
    return pdf;
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
  for (const region of data.regions) {
    const vertices = regionVertices(region);
    const color = hexColor(region.color);
    // drawSvgPath flips SVG Y downward, so negate native PDF Y coordinates.
    const path =
      vertices
        .map((point, index) => `${index ? "L" : "M"} ${point.x} ${-point.y}`)
        .join(" ") + " Z";
    pages[region.page - 1].drawSvgPath(path, {
      x: 0,
      y: 0,
      color,
      borderColor: color,
      borderWidth: 0.7,
      opacity: region.opacity,
      borderOpacity: region.opacity,
      blendMode: BlendMode.Multiply,
    });
  }
  for (const item of data.measurements) {
    const mm = measurementMM(item, data);
    if (mm === null) continue;
    const page = pages[item.page - 1];
    const color = hexColor(item.color);
    const opacity = item.opacity === 1 ? undefined : item.opacity;
    const angle =
      (((page.getRotation().angle + (data.rotations[item.page] || 0)) % 360) +
        360) %
      360;
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians),
      sin = Math.sin(radians);
    const path = item.path || [item.a, item.b];
    const graphicsState = page.node.newExtGState(
      "GS",
      pdf.context.obj({ Type: "ExtGState", CA: item.opacity ?? 1 }),
    );
    page.pushOperators(
      pushGraphicsState(),
      setGraphicsState(graphicsState),
      setStrokingColor(color),
      setLineWidth(1.2),
      setDashPattern([], 0),
      setLineCap(LineCapStyle.Butt),
      // Rounded joins keep tightly sampled bends free of miter spikes.
      setLineJoin(LineJoinStyle.Round),
      moveTo(path[0].x, path[0].y),
    );
    // Keep one stroke without spreading potentially a million operators.
    for (let index = 1; index < path.length; index++)
      page.pushOperators(lineTo(path[index].x, path[index].y));
    page.pushOperators(stroke(), popGraphicsState());
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
        opacity,
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
      opacity,
      borderColor: color,
      borderWidth: 0.7,
      borderOpacity: opacity,
    });
    page.drawText(label, {
      x: origin.x + padding * cos - (padding + 2) * sin,
      y: origin.y + padding * sin + (padding + 2) * cos,
      size,
      font,
      color,
      opacity,
      rotate: degrees(angle),
    });
  }
  for (const item of data.annotations) {
    const page = pages[item.page - 1];
    const color = hexColor(item.color);
    const bottomLeft = annotationPoint(item, 0, item.height);
    const style = item.kind === "markup" ? markupStyle(item) : null;
    if (item.kind === "markup") {
      page.drawRectangle({
        ...bottomLeft,
        width: item.width,
        height: item.height,
        rotate: degrees(item.rotation),
        color: hexColor(style!.backgroundColor),
        opacity: style!.backgroundOpacity,
        borderColor: hexColor(style!.borderColor),
        borderWidth: 1,
        borderOpacity: style!.borderOpacity,
      });
    } else {
      page.drawSvgPath(revisionCloudPath(item.width, item.height), {
        ...item.origin,
        rotate: degrees(item.rotation),
        borderColor: color,
        borderWidth: 1.5,
        borderOpacity: item.opacity,
      });
    }
    // Browser font fallback preserves Chinese and other Unicode text offline.
    // Only text is rasterized. Box borders, clouds and revision triangles stay vector-based.
    const tag = item.kind === "revision" ? revisionTag(item) : null;
    const width = tag?.width ?? item.width;
    const height = tag?.height ?? item.height;
    const canvas = document.createElement("canvas");
    const density = Math.min(3, Math.sqrt(8000000 / (width * height)));
    canvas.width = Math.max(1, Math.ceil(width * density));
    canvas.height = Math.max(1, Math.ceil(height * density));
    const context = canvas.getContext("2d");
    if (!context) throw new Error(t("无法绘制批注文字"));
    context.scale(canvas.width / width, canvas.height / height);
    context.fillStyle = item.color;
    if (item.kind === "markup") {
      context.fillStyle = style!.textColor;
      context.globalAlpha = style!.textOpacity;
      context.font = `${item.fontSize}px ${annotationFont}`;
      markupLines(item).forEach((line, index) =>
        context.fillText(
          line,
          textPadding,
          textPadding + item.fontSize * (1 + index * 1.4),
        ),
      );
    } else if (tag) {
      const origin = annotationPoint(item, tag.x, tag.y);
      page.drawSvgPath(
        `M ${width / 2} 0 L ${width} ${height} L 0 ${height} Z`,
        {
          ...origin,
          rotate: degrees(item.rotation),
          color: rgb(1, 1, 1),
          opacity: item.opacity,
          borderColor: color,
          borderWidth: 1.2,
          borderOpacity: item.opacity,
        },
      );
      context.font = `${tag.fontSize}px ${annotationFont}`;
      context.textAlign = "center";
      context.fillText(item.label, width / 2, 22);
    }
    const image = await pdf.embedPng(canvas.toDataURL("image/png"));
    const imageOrigin = tag
      ? annotationPoint(item, tag.x, tag.y + tag.height)
      : bottomLeft;
    page.drawImage(image, {
      ...imageOrigin,
      width,
      height,
      rotate: degrees(item.rotation),
      opacity: item.kind === "revision" ? item.opacity : undefined,
    });
    canvas.width = canvas.height = 0;
  }
  for (let index = 0; index < pages.length; index++) {
    pages[index].setRotation(
      degrees(
        (pages[index].getRotation().angle + (data.rotations[index + 1] || 0)) %
          360,
      ),
    );
  }
  pdf.setProducer(`Dim It ${appVersion}`);
  return pdf.save();
}
