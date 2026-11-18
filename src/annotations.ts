import type { Point } from "./core.ts";

type AnnotationBox = {
  id: string;
  page: number;
  origin: Point;
  width: number;
  height: number;
  rotation: number;
  color: string;
  note: string;
};

export type MarkupStyle = {
  textColor: string;
  textOpacity: number;
  backgroundColor: string;
  backgroundOpacity: number;
  borderColor: string;
  borderOpacity: number;
};
export type Markup = AnnotationBox & {
  kind: "markup";
  fontSize: number;
  style?: MarkupStyle;
};
export type Revision = AnnotationBox & {
  kind: "revision";
  label: string;
  opacity?: number;
};
export type DrawingAnnotation = Markup | Revision;
export const annotationFont =
  'Arial, "PingFang SC", "Microsoft YaHei", sans-serif';
export const textPadding = 7;

export function markupStyle(
  markup: Pick<Markup, "color" | "style">,
): MarkupStyle {
  return (
    markup.style ?? {
      textColor: markup.color,
      textOpacity: 1,
      backgroundColor: "#ffffff",
      backgroundOpacity: 0.94,
      borderColor: markup.color,
      borderOpacity: 1,
    }
  );
}

export function validMarkupStyle(style: MarkupStyle): boolean {
  return (
    !!style &&
    (["text", "background", "border"] as const).every((channel) => {
      const color = style[`${channel}Color`];
      const opacity = style[`${channel}Opacity`];
      return (
        typeof color === "string" &&
        /^#[0-9a-f]{6}$/i.test(color) &&
        typeof opacity === "number" &&
        Number.isFinite(opacity) &&
        opacity >= 0 &&
        opacity <= 1
      );
    })
  );
}

// Annotation coordinates run right and down from the box's top-left corner.
// Rotation records the page orientation when the annotation was created.
export function annotationPoint(
  box: AnnotationBox,
  x: number,
  y: number,
): Point {
  const radians = (box.rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(radians));
  const sin = Math.round(Math.sin(radians));
  return {
    x: box.origin.x + x * cos + y * sin,
    y: box.origin.y + x * sin - y * cos,
  };
}

export function annotationLocal(box: AnnotationBox, point: Point): Point {
  const radians = (box.rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(radians));
  const sin = Math.round(Math.sin(radians));
  const dx = point.x - box.origin.x;
  const dy = point.y - box.origin.y;
  return { x: dx * cos + dy * sin, y: dx * sin - dy * cos };
}

export function fitAnnotationToPage<T extends DrawingAnnotation>(
  box: T,
  bounds: readonly number[],
): T {
  const basis = { ...box, origin: { x: 0, y: 0 } };
  const corners = [
    { x: bounds[0], y: bounds[1] },
    { x: bounds[2], y: bounds[3] },
  ].map((point) => annotationLocal(basis, point));
  const minX = Math.min(...corners.map((p) => p.x));
  const minY = Math.min(...corners.map((p) => p.y));
  const maxX = Math.max(...corners.map((p) => p.x));
  const maxY = Math.max(...corners.map((p) => p.y));
  const width = Math.min(box.width, maxX - minX);
  const height = Math.min(box.height, maxY - minY);
  const position = annotationLocal(basis, box.origin);
  const x = Math.max(minX, Math.min(maxX - width, position.x));
  const y = Math.max(minY, Math.min(maxY - height, position.y));
  return { ...box, width, height, origin: annotationPoint(basis, x, y) };
}

export function wrapAnnotationText(
  text: string,
  width: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const word of paragraph.match(/\S+\s*|\s+/gu) || []) {
      if (line && measure(line + word.trimEnd()) > width) {
        lines.push(line.trimEnd());
        line = "";
      }
      for (const character of word) {
        if (line && measure(line + character) > width) {
          lines.push(line.trimEnd());
          line = "";
        }
        line += character;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

let textContext: CanvasRenderingContext2D | null = null;
function textMeasurer(fontSize: number) {
  textContext ||= document.createElement("canvas").getContext("2d");
  if (!textContext) throw new Error("Canvas text rendering is unavailable");
  textContext.font = `${fontSize}px ${annotationFont}`;
  return (text: string) => textContext!.measureText(text).width;
}

export function markupMinimumWidth(markup: Markup): number {
  const measure = textMeasurer(markup.fontSize);
  return (
    textPadding * 2 +
    Math.max(markup.fontSize, ...[...new Set(markup.note)].map(measure))
  );
}

const markupLineCache = new WeakMap<Markup, string[]>();

export function markupLines(markup: Markup): string[] {
  const cached = markupLineCache.get(markup);
  if (cached) return cached;
  const lines = wrapAnnotationText(
    markup.note,
    markup.width - textPadding * 2,
    textMeasurer(markup.fontSize),
  );
  markupLineCache.set(markup, lines);
  return lines;
}

export function markupHeight(markup: Markup): number {
  return markupLines(markup).length * markup.fontSize * 1.4 + textPadding * 2;
}

export function revisionCloudPath(width: number, height: number): string {
  if (width <= 0 || height <= 0) return "";
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
    { x: 0, y: 0 },
  ];
  let path = "M 0 0";
  for (let edge = 1; edge < corners.length; edge++) {
    const a = corners[edge - 1],
      b = corners[edge];
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const count = Math.max(1, Math.min(100, Math.ceil(length / 18)));
    const bulge = Math.min(6, (length / count) * 0.4);
    for (let step = 1; step <= count; step++) {
      const middle = (step - 0.5) / count;
      path += ` Q ${a.x + dx * middle + (dy / length) * bulge} ${a.y + dy * middle - (dx / length) * bulge} ${a.x + (dx * step) / count} ${a.y + (dy * step) / count}`;
    }
  }
  return path + " Z";
}

export function revisionTag(box: Revision) {
  const characters = [...box.label].length;
  const width = Math.min(box.width - 10, Math.max(32, characters * 12 + 18));
  const fontSize = Math.min(11, (width * 0.65) / characters);
  return { x: box.width - width - 5, y: 5, width, height: 28, fontSize };
}
