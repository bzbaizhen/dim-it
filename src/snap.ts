import {
  bezierCandidates,
  flattenBezier,
  pathLength,
  pathMidpoint,
} from "./curve.ts";
import type { Point } from "./core.ts";

export type Segment = { a: Point; b: Point };
export type SnapKind =
  | "endpoint"
  | "midpoint"
  | "intersection"
  | "nearest"
  | "perpendicular"
  | "tangent";
export type SnapOptions = { enabled?: readonly SnapKind[]; anchor?: Point };
export type SnapHit = {
  point: Point;
  kind: SnapKind;
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

export function extractSegments(
  list: OperatorList,
  ops: Operators,
  curves?: Point[][],
  beziers?: Point[][],
): Segment[] {
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
      let curve: Point[] = [];
      const finishCurve = () => {
        if (curve.length > 1 && pathLength(curve) > 1e-7) curves?.push(curve);
        curve = [];
      };
      let current: Point | null = null;
      let start: Point | null = null;
      for (let offset = 0; offset < path.length; ) {
        const command = path[offset++];
        if (command === 0) {
          finishCurve();
          if (closesSubpaths && current && start) append(current, start);
          current = start = transform(path[offset++], path[offset++]);
        } else if (command === 1) {
          finishCurve();
          const next = transform(path[offset++], path[offset++]);
          if (current) append(current, next);
          current = next;
        } else if (command === 2 || command === 3) {
          const controls: Point[] = [];
          for (let index = 0; index < (command === 2 ? 3 : 2); index++)
            controls.push(transform(path[offset++], path[offset++]));
          if (
            current &&
            [current, ...controls].every(
              (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
            )
          ) {
            beziers?.push([current, ...controls]);
            if (curves) {
              const points = flattenBezier([current, ...controls]);
              if (!curve.length) curve.push(current);
              for (let index = 1; index < points.length; index++)
                curve.push(points[index]);
            }
          }
          current = controls[controls.length - 1];
        } else if (command === 4) {
          finishCurve();
          if (current && start) append(current, start);
          current = start;
        } else break;
      }
      finishCurve();
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
  readonly curves: CurveIndex;
  private cells = new Map<string, number[]>();
  private longSegments: number[] = [];
  private cellSize: number;
  private bounds: Box;
  private beziers: CurveIndex;
  private curveEndpoints: CurveIndex;
  private curveMidpoints: CurveIndex;

  constructor(
    segments: Segment[],
    bounds: Box,
    curves: Point[][] = [],
    beziers: Point[][] = [],
  ) {
    this.curves = new CurveIndex(curves, bounds);
    this.beziers = new CurveIndex(
      beziers.filter(
        (path) =>
          (path.length === 3 || path.length === 4) &&
          path.every(
            (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
          ),
      ),
      bounds,
    );
    const paths = (
      curves.length ? curves : this.beziers.paths.map(flattenBezier)
    ).filter((path) => path.length > 1);
    this.curveEndpoints = new CurveIndex(
      paths.flatMap((path) => [[path[0]], [path[path.length - 1]]]),
      bounds,
    );
    this.curveMidpoints = new CurveIndex(
      paths.map((path) => [pathMidpoint(path)]),
      bounds,
    );
    this.bounds = bounds;
    const [left, bottom, right, top] = bounds;
    this.segments = segments.filter(
      ({ a, b }) =>
        [a.x, a.y, b.x, b.y].every(Number.isFinite) &&
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
    options?: SnapOptions,
  ): SnapHit | null {
    if (
      !Number.isFinite(radius) ||
      radius <= 0 ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y)
    )
      return null;
    const enabled = new Set(
      options?.enabled ?? ["endpoint", "midpoint", "intersection"],
    );
    if (!enabled.size) return null;
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
    let nearestHit: SnapHit | null = null;
    let nearestDistance = radius;
    const priority = {
      endpoint: 0,
      intersection: 1,
      midpoint: 2,
      perpendicular: 3,
      tangent: 4,
      nearest: 5,
    };
    const consider = (candidate: Point, kind: SnapHit["kind"]) => {
      if (
        !enabled.has(kind) ||
        !Number.isFinite(candidate.x) ||
        !Number.isFinite(candidate.y) ||
        candidate.x < left ||
        candidate.x > right ||
        candidate.y < bottom ||
        candidate.y > top ||
        (axis && Math.abs(candidate[axis.coordinate] - axis.value) > 1e-6)
      )
        return;
      const delta = Math.hypot(point.x - candidate.x, point.y - candidate.y);
      // Near is a fallback and must not reduce the discrete intersection search radius.
      if (kind === "nearest") {
        if (delta <= nearestDistance) {
          nearestDistance = delta;
          nearestHit = { point: candidate, kind };
        }
        return;
      }
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
      if (enabled.has("endpoint")) {
        consider(segment.a, "endpoint");
        consider(segment.b, "endpoint");
      }
      if (enabled.has("midpoint"))
        consider(
          {
            x: (segment.a.x + segment.b.x) / 2,
            y: (segment.a.y + segment.b.y) / 2,
          },
          "midpoint",
        );
    }
    if (enabled.has("endpoint"))
      for (const [candidate] of this.curveEndpoints.nearby(point, radius))
        consider(candidate, "endpoint");
    if (enabled.has("midpoint"))
      for (const [candidate] of this.curveMidpoints.nearby(point, radius))
        consider(candidate, "midpoint");
    for (const kind of ["nearest", "perpendicular"] as const) {
      const reference = kind === "nearest" ? point : options?.anchor;
      if (!enabled.has(kind) || !reference) continue;
      const candidates = this.beziers.paths.length
        ? nearby
        : [
            ...nearby,
            ...this.curves
              .nearby(point, radius)
              .flatMap((path) =>
                path.slice(1).map((b, index) => ({ a: path[index], b })),
              ),
          ];
      for (const { a, b } of candidates) {
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const lengthSquared = dx * dx + dy * dy;
        if (!lengthSquared) continue;
        let t =
          ((reference.x - a.x) * dx + (reference.y - a.y) * dy) / lengthSquared;
        if (kind === "perpendicular" && (t < 0 || t > 1)) continue;
        t = Math.max(0, Math.min(1, t));
        consider({ x: a.x + t * dx, y: a.y + t * dy }, kind);
      }
    }
    for (const kind of ["nearest", "perpendicular", "tangent"] as const) {
      const reference = kind === "nearest" ? point : options?.anchor;
      if (!enabled.has(kind) || !reference) continue;
      for (const controls of this.beziers.nearby(point, radius))
        for (const candidate of bezierCandidates(controls, reference, kind))
          consider(candidate, kind);
    }
    if (!enabled.has("intersection")) return hit ?? nearestHit;
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
    return hit ?? nearestHit;
  }
}

export class CurveIndex {
  private cells = new Map<string, number[]>();
  private longCurves: number[] = [];
  readonly paths: Point[][];
  private boxes: Box[];
  private cellSize: number;
  private bounds: Box;
  constructor(paths: Point[][], bounds: Box) {
    this.paths = paths;
    this.bounds = bounds;
    this.cellSize = Math.max(
      1,
      Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]) / 64,
    );
    this.boxes = paths.map((path) => {
      let left = Infinity,
        bottom = Infinity,
        right = -Infinity,
        top = -Infinity;
      for (const p of path) {
        left = Math.min(left, p.x);
        bottom = Math.min(bottom, p.y);
        right = Math.max(right, p.x);
        top = Math.max(top, p.y);
      }
      return [left, bottom, right, top];
    });
    this.boxes.forEach(([left, bottom, right, top], id) => {
      if (
        ![left, bottom, right, top].every(Number.isFinite) ||
        right < bounds[0] ||
        left > bounds[2] ||
        top < bounds[1] ||
        bottom > bounds[3]
      )
        return;
      const x1 = Math.floor(Math.max(left, bounds[0]) / this.cellSize),
        x2 = Math.floor(Math.min(right, bounds[2]) / this.cellSize);
      const y1 = Math.floor(Math.max(bottom, bounds[1]) / this.cellSize),
        y2 = Math.floor(Math.min(top, bounds[3]) / this.cellSize);
      if ((x2 - x1 + 1) * (y2 - y1 + 1) > 64) {
        this.longCurves.push(id);
        return;
      }
      for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++) {
          const key = `${x},${y}`;
          const bucket = this.cells.get(key);
          if (bucket) bucket.push(id);
          else this.cells.set(key, [id]);
        }
    });
  }
  nearby(point: Point, radius: number): Point[][] {
    if (
      !Number.isFinite(radius) ||
      radius <= 0 ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y)
    )
      return [];
    const ids = new Set(this.longCurves);
    for (
      let x = Math.floor(
        Math.max(this.bounds[0], point.x - radius) / this.cellSize,
      );
      x <=
      Math.floor(Math.min(this.bounds[2], point.x + radius) / this.cellSize);
      x++
    )
      for (
        let y = Math.floor(
          Math.max(this.bounds[1], point.y - radius) / this.cellSize,
        );
        y <=
        Math.floor(Math.min(this.bounds[3], point.y + radius) / this.cellSize);
        y++
      )
        for (const id of this.cells.get(`${x},${y}`) || []) ids.add(id);
    return [...ids]
      .filter((id) => {
        const box = this.boxes[id];
        return (
          point.x >= box[0] - radius &&
          point.x <= box[2] + radius &&
          point.y >= box[1] - radius &&
          point.y <= box[3] + radius
        );
      })
      .map((id) => this.paths[id]);
  }
  nearest(point: Point, radius: number): Point[] | null {
    if (!Number.isFinite(radius) || radius <= 0) return null;
    let best = radius,
      result: Point[] | null = null;
    for (const path of this.nearby(point, radius)) {
      for (let i = 1; i < path.length; i++) {
        const delta = segmentDistance(point, { a: path[i - 1], b: path[i] });
        if (delta <= best) {
          best = delta;
          result = path;
        }
      }
    }
    return result;
  }
}
