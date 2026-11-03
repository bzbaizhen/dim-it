import type { Point } from "./core.ts";

export type Segment = { a: Point; b: Point };
export type SnapHit = {
  point: Point;
  kind: "endpoint" | "midpoint" | "intersection";
};
export type OrthoConstraint = { coordinate: "x" | "y"; value: number };
export type TrackHit = { point: Point; source: SnapHit };
export const SMART_POINT_DELAY = 350;

export function samePoint(a: Point, b: Point): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
}

export function captureSmartPoint(points: SnapHit[], hit: SnapHit): SnapHit[] {
  return points.some((item) => samePoint(item.point, hit.point))
    ? points
    : [...points.slice(-3), hit];
}

export function nearestTrackingPoint(
  point: Point,
  axis: OrthoConstraint,
  sources: SnapHit[],
  radius: number,
): TrackHit | null {
  if (!Number.isFinite(radius) || radius <= 0) return null;
  let result: TrackHit | null = null;
  let best = radius;
  for (let index = sources.length - 1; index >= 0; index--) {
    const source = sources[index];
    const projected = { ...source.point, [axis.coordinate]: axis.value };
    const delta = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (delta <= radius && (!result || delta < best - 1e-7)) {
      best = delta;
      result = { point: projected, source };
    }
  }
  return result;
}
type Matrix = [number, number, number, number, number, number];
type Operators = typeof import("pdfjs-dist").OPS;
type OperatorList = { fnArray: number[]; argsArray: unknown[][] };
type Box = readonly [number, number, number, number];

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export function extractSegments(list: OperatorList, ops: Operators): Segment[] {
  const segments: Segment[] = [];
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const transform = (x: number, y: number): Point => ({
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  });
  const append = (a: Point, b: Point) => {
    if (
      [a.x, a.y, b.x, b.y].every(Number.isFinite) &&
      Math.hypot(a.x - b.x, a.y - b.y) > 1e-7
    )
      segments.push({ a, b });
  };
  for (let index = 0; index < list.fnArray.length; index++) {
    const op = list.fnArray[index];
    const args = list.argsArray[index];
    if (
      op === ops.save ||
      op === ops.paintFormXObjectBegin ||
      op === ops.beginGroup ||
      op === ops.beginAnnotation
    ) {
      stack.push(matrix);
      if (op === ops.paintFormXObjectBegin && args[0])
        matrix = multiply(matrix, args[0] as Matrix);
      if (op === ops.beginAnnotation) {
        matrix = multiply(args[2] as Matrix, args[3] as Matrix);
      }
    } else if (
      op === ops.restore ||
      op === ops.paintFormXObjectEnd ||
      op === ops.endGroup ||
      op === ops.endAnnotation
    ) {
      matrix = stack.pop() || [1, 0, 0, 1, 0, 0];
    } else if (op === ops.transform) {
      matrix = multiply(matrix, args as Matrix);
    } else if (op === ops.constructPath && args[0] !== ops.endPath) {
      // PDF.js 6 DrawOPS packs move, line, cubic, quadratic and close as 0..4.
      const path = (args[1] as ArrayLike<ArrayLike<number>>)?.[0];
      if (!path) continue;
      const closesSubpaths = [
        ops.fill,
        ops.eoFill,
        ops.fillStroke,
        ops.eoFillStroke,
        ops.closeFillStroke,
        ops.closeEOFillStroke,
      ].includes(args[0] as number);
      let current: Point | null = null;
      let start: Point | null = null;
      for (let offset = 0; offset < path.length;) {
        const command = path[offset++];
        if (command === 0) {
          if (closesSubpaths && current && start) append(current, start);
          current = start = transform(path[offset++], path[offset++]);
        } else if (command === 1) {
          const next = transform(path[offset++], path[offset++]);
          if (current) append(current, next);
          current = next;
        } else if (command === 2 || command === 3) {
          offset += command === 2 ? 4 : 2;
          current = transform(path[offset++], path[offset++]);
        } else if (command === 4) {
          if (current && start) append(current, start);
          current = start;
        } else break;
      }
      if ((closesSubpaths || args[0] === ops.closeStroke) && current && start)
        append(current, start);
    }
  }
  return segments;
}

function segmentDistance(point: Point, segment: Segment): number {
  const dx = segment.b.x - segment.a.x,
    dy = segment.b.y - segment.a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(
        0,
        Math.min(
          1,
          ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) /
            lengthSquared,
        ),
      )
    : 0;
  return Math.hypot(
    point.x - segment.a.x - t * dx,
    point.y - segment.a.y - t * dy,
  );
}

export function intersection(first: Segment, second: Segment): Point | null {
  const rx = first.b.x - first.a.x,
    ry = first.b.y - first.a.y;
  const sx = second.b.x - second.a.x,
    sy = second.b.y - second.a.y;
  const cross = rx * sy - ry * sx;
  if (Math.abs(cross) <= 1e-10 * Math.hypot(rx, ry) * Math.hypot(sx, sy))
    return null;
  const qx = second.a.x - first.a.x,
    qy = second.a.y - first.a.y;
  const t = (qx * sy - qy * sx) / cross;
  const u = (qx * ry - qy * rx) / cross;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return {
    x: first.a.x + Math.max(0, Math.min(1, t)) * rx,
    y: first.a.y + Math.max(0, Math.min(1, t)) * ry,
  };
}

export class SnapIndex {
  readonly segments: Segment[];
  private cells = new Map<string, number[]>();
  private longSegments: number[] = [];
  private cellSize: number;
  private bounds: Box;

  constructor(segments: Segment[], bounds: Box) {
    this.bounds = bounds;
    const [left, bottom, right, top] = bounds;
    this.segments = segments.filter(
      ({ a, b }) =>
        Math.max(a.x, b.x) >= left &&
        Math.min(a.x, b.x) <= right &&
        Math.max(a.y, b.y) >= bottom &&
        Math.min(a.y, b.y) <= top,
    );
    this.cellSize = Math.max(
      1,
      Math.max(right - left, top - bottom) /
        Math.max(8, Math.min(128, Math.ceil(Math.sqrt(this.segments.length)))),
    );
    for (const [index, { a, b }] of this.segments.entries()) {
      const x1 = Math.floor(Math.max(left, Math.min(a.x, b.x)) / this.cellSize);
      const x2 = Math.floor(
        Math.min(right, Math.max(a.x, b.x)) / this.cellSize,
      );
      const y1 = Math.floor(
        Math.max(bottom, Math.min(a.y, b.y)) / this.cellSize,
      );
      const y2 = Math.floor(Math.min(top, Math.max(a.y, b.y)) / this.cellSize);
      if ((x2 - x1 + 1) * (y2 - y1 + 1) > 64) {
        this.longSegments.push(index);
        continue;
      }
      for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++) {
          const key = `${x},${y}`;
          const bucket = this.cells.get(key);
          if (bucket) bucket.push(index);
          else this.cells.set(key, [index]);
        }
    }
  }

  nearest(
    point: Point,
    radius: number,
    axis?: OrthoConstraint,
  ): SnapHit | null {
    if (!Number.isFinite(radius) || radius <= 0) return null;
    const ids = new Set(this.longSegments);
    const [left, bottom, right, top] = this.bounds;
    const x1 = Math.floor(Math.max(left, point.x - radius) / this.cellSize);
    const x2 = Math.floor(Math.min(right, point.x + radius) / this.cellSize);
    const y1 = Math.floor(Math.max(bottom, point.y - radius) / this.cellSize);
    const y2 = Math.floor(Math.min(top, point.y + radius) / this.cellSize);
    for (let x = x1; x <= x2; x++)
      for (let y = y1; y <= y2; y++) {
        for (const id of this.cells.get(`${x},${y}`) || []) ids.add(id);
      }
    const nearby = [...ids]
      .map((id) => this.segments[id])
      .filter((segment) => segmentDistance(point, segment) <= radius);
    let hit: SnapHit | null = null;
    let best = radius;
    const priority = { endpoint: 0, intersection: 1, midpoint: 2 };
    const consider = (candidate: Point, kind: SnapHit["kind"]) => {
      if (
        candidate.x < left ||
        candidate.x > right ||
        candidate.y < bottom ||
        candidate.y > top ||
        (axis && Math.abs(candidate[axis.coordinate] - axis.value) > 1e-6)
      )
        return;
      const delta = Math.hypot(point.x - candidate.x, point.y - candidate.y);
      if (
        delta <= radius &&
        (delta < best - 1e-7 ||
          (Math.abs(delta - best) <= 1e-7 &&
            (!hit || priority[kind] < priority[hit.kind])))
      ) {
        best = delta;
        hit = { point: candidate, kind };
      }
    };
    for (let i = 0; i < nearby.length; i++) {
      const segment = nearby[i];
      consider(segment.a, "endpoint");
      consider(segment.b, "endpoint");
      consider(
        {
          x: (segment.a.x + segment.b.x) / 2,
          y: (segment.a.y + segment.b.y) / 2,
        },
        "midpoint",
      );
    }
    // A closer intersection must lie on two segments inside the current best distance.
    const crossings = nearby
      .map((segment) => ({
        segment,
        distance: segmentDistance(point, segment),
      }))
      .filter((item) => item.distance <= best + 1e-7);
    for (let i = 0; i < crossings.length; i++) {
      if (crossings[i].distance > best + 1e-7) continue;
      for (let j = 0; j < i; j++) {
        if (crossings[j].distance > best + 1e-7) continue;
        const crossing = intersection(
          crossings[i].segment,
          crossings[j].segment,
        );
        if (crossing) consider(crossing, "intersection");
      }
    }
    return hit;
  }
}
