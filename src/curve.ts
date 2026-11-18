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

export function bezierPoint(controls: Point[], t: number): Point {
  let row = controls;
  while (row.length > 1)
    row = row.slice(1).map((point, index) => ({
      x: row[index].x * (1 - t) + point.x * t,
      y: row[index].y * (1 - t) + point.y * t,
    }));
  return row[0];
}

function evaluatePolynomial(coefficients: number[], t: number): number {
  return coefficients.reduceRight(
    (value, coefficient) => value * t + coefficient,
    0,
  );
}

// Derivative roots partition [0,1] into monotone intervals, retaining repeated roots.
function polynomialRoots(coefficients: number[]): number[] {
  const scale = Math.max(...coefficients.map(Math.abs));
  if (!scale || !Number.isFinite(scale)) return [];
  const p = coefficients.map((value) => value / scale);
  while (p.length > 1 && Math.abs(p[p.length - 1]) < 1e-14) p.pop();
  if (p.length === 1) return [];
  const derivative = p.slice(1).map((value, index) => value * (index + 1));
  const partitions = [0, ...polynomialRoots(derivative), 1];
  const roots = partitions.filter(
    (t) => Math.abs(evaluatePolynomial(p, t)) < 1e-12,
  );
  for (let i = 1; i < partitions.length; i++) {
    let low = partitions[i - 1];
    let high = partitions[i];
    let lowValue = evaluatePolynomial(p, low);
    if (lowValue * evaluatePolynomial(p, high) >= 0) continue;
    for (let iteration = 0; iteration < 50; iteration++) {
      const middle = (low + high) / 2;
      const value = evaluatePolynomial(p, middle);
      if (lowValue * value <= 0) high = middle;
      else {
        low = middle;
        lowValue = value;
      }
    }
    roots.push((low + high) / 2);
  }
  return roots
    .sort((a, b) => a - b)
    .filter((t, index, all) => !index || t - all[index - 1] > 1e-9);
}

function powerCoefficients(values: number[]): number[] {
  const [a, b, c, d] = values;
  return values.length === 3
    ? [a, 2 * (b - a), a - 2 * b + c]
    : [a, 3 * (b - a), 3 * (a - 2 * b + c), -a + 3 * b - 3 * c + d];
}

export function bezierCandidates(
  controls: Point[],
  reference: Point,
  mode: "nearest" | "perpendicular" | "tangent",
): Point[] {
  const x = powerCoefficients(controls.map((point) => point.x - reference.x));
  const y = powerCoefficients(controls.map((point) => point.y - reference.y));
  const dx = x.slice(1).map((value, index) => value * (index + 1));
  const dy = y.slice(1).map((value, index) => value * (index + 1));
  const equation = Array(2 * controls.length - 2).fill(0) as number[];
  for (let i = 0; i < x.length; i++)
    for (let j = 0; j < dx.length; j++)
      equation[i + j] +=
        mode === "tangent"
          ? x[i] * dy[j] - y[i] * dx[j]
          : x[i] * dx[j] + y[i] * dy[j];
  let parameters = polynomialRoots(equation);
  if (mode === "nearest") parameters = [0, ...parameters, 1];
  // A collinear curve has infinitely many tangent contacts if the anchor is on its line.
  if (mode === "tangent" && equation.every((value) => Math.abs(value) < 1e-12))
    parameters = [0, 1, ...polynomialRoots(x), ...polynomialRoots(y)];
  return parameters
    .filter((t) => {
      if (mode === "nearest") return true;
      let tangentX = dx,
        tangentY = dy;
      let vx = evaluatePolynomial(tangentX, t);
      let vy = evaluatePolynomial(tangentY, t);
      // Repeated endpoint controls can have zero first derivative but a valid limiting tangent.
      while (Math.hypot(vx, vy) < 1e-10 && tangentX.length > 1) {
        tangentX = tangentX.slice(1).map((value, index) => value * (index + 1));
        tangentY = tangentY.slice(1).map((value, index) => value * (index + 1));
        vx = evaluatePolynomial(tangentX, t);
        vy = evaluatePolynomial(tangentY, t);
      }
      const speed = Math.hypot(vx, vy);
      if (speed < 1e-10) return false;
      const px = evaluatePolynomial(x, t),
        py = evaluatePolynomial(y, t);
      const distance = Math.hypot(px, py);
      if (mode === "tangent" && distance <= 1e-9) return false;
      const residual =
        mode === "tangent" ? px * vy - py * vx : px * vx + py * vy;
      return Math.abs(residual) / speed <= 1e-7 * Math.max(1, distance);
    })
    .map((t) => bezierPoint(controls, t));
}
