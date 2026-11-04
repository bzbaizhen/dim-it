import type { Point } from "./core.ts";

export function pathLength(points: Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index++)
    length += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y,
    );
  return length;
}

export function pathMidpoint(points: Point[]): Point {
  let remaining = pathLength(points) / 2;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1],
      b = points[index];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > 0 && remaining <= length)
      return {
        x: a.x + ((b.x - a.x) * remaining) / length,
        y: a.y + ((b.y - a.y) * remaining) / length,
      };
    remaining -= length;
  }
  return points[0];
}

// Subdivision bounds the length error by the control polygon minus its chord.
export function flattenBezier(controls: Point[]): Point[] {
  const result = [controls[0]];
  function divide(points: Point[], tolerance: number, depth: number) {
    const first = points[0],
      last = points[points.length - 1];
    if (
      depth === 18 ||
      pathLength(points) - Math.hypot(last.x - first.x, last.y - first.y) <=
        tolerance
    ) {
      result.push(last);
      return;
    }
    const left = [first],
      right = [last];
    let row = points;
    while (row.length > 1) {
      row = row.slice(1).map((point, index) => ({
        x: (row[index].x + point.x) / 2,
        y: (row[index].y + point.y) / 2,
      }));
      left.push(row[0]);
      right.unshift(row[row.length - 1]);
    }
    divide(left, tolerance / 2, depth + 1);
    divide(right, tolerance / 2, depth + 1);
  }
  divide(controls, Math.max(1e-6, pathLength(controls) * 1e-7), 0);
  return result;
}
