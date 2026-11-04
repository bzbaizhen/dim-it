import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { flattenBezier, pathLength, pathMidpoint } from "../src/curve.ts";
import { CurveIndex, extractSegments } from "../src/snap.ts";
import {
  initialData,
  makeCalibration,
  measurementMM,
  measurementCSV,
  validateData,
  type Point,
} from "../src/core.ts";

function referenceLength(p: Point[]) {
  const speed = (t: number) =>
    Math.hypot(
      ...(["x", "y"] as const).map(
        (k) =>
          3 *
          ((1 - t) ** 2 * (p[1][k] - p[0][k]) +
            2 * (1 - t) * t * (p[2][k] - p[1][k]) +
            t * t * (p[3][k] - p[2][k])),
      ),
    );
  const n = 20000;
  let sum = speed(0) + speed(1);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * speed(i / n);
  return sum / (3 * n);
}

test("Bezier length follows bends, inflections and reversals with a bounded numerical error", () => {
  for (const p of [
    [
      { x: 300, y: 200 },
      { x: 300, y: 255.228475 },
      { x: 255.228475, y: 300 },
      { x: 200, y: 300 },
    ],
    [
      { x: 0, y: 0 },
      { x: 100, y: 300 },
      { x: 200, y: -300 },
      { x: 400, y: 0 },
    ],
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: -100, y: 0 },
      { x: 0, y: 0 },
    ],
  ]) {
    const path = flattenBezier(p);
    const reference = referenceLength(p);
    assert.ok(Math.abs(pathLength(path) - reference) < 0.0001);
    assert.deepEqual(path[0], p[0]);
    assert.deepEqual(path.at(-1), p[3]);
  }
  const quadratic = flattenBezier([
    { x: 0, y: 0 },
    { x: 50, y: 100 },
    { x: 100, y: 0 },
  ]);
  assert.ok(pathLength(quadratic) > 147.89 && pathLength(quadratic) < 147.9);
  assert.deepEqual(
    pathMidpoint([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 300 },
    ]),
    { x: 100, y: 100 },
  );
});

test("PDF.js curves retain continuous segments, stop at lines, transform Forms and support closed loops", async () => {
  const task = getDocument({
    data: new Uint8Array(await readFile("tests/fixtures/curves.pdf")),
  });
  try {
    const doc = await task.promise;
    const paths: Point[][] = [];
    const page = await doc.getPage(1);
    extractSegments(await page.getOperatorList(), OPS, paths);
    assert.equal(paths.length, 3);
    assert.ok(Math.abs(pathLength(paths[0]) - 157.10167) < 0.0001);
    assert.ok(Math.abs(pathLength(paths[2]) - 2 * Math.PI * 45) < 0.05);
    assert.ok(
      Math.hypot(
        paths[2][0].x - paths[2].at(-1)!.x,
        paths[2][0].y - paths[2].at(-1)!.y,
      ) < 1e-6,
    );
    const index = new CurveIndex(paths, [0, 0, 600, 450]);
    assert.equal(index.nearest({ x: 270.71, y: 270.71 }, 10), paths[0]);
    assert.equal(index.nearest({ x: 250, y: 200 }, 5), null);
    const transformed: Point[][] = [];
    extractSegments(
      await (await doc.getPage(4)).getOperatorList(),
      OPS,
      transformed,
    );
    assert.equal(transformed.length, 3);
    assert.ok(
      Math.abs(transformed[0][0].x - (paths[0][0].x * 0.5 + 20)) < 1e-5,
    );
    assert.ok(
      Math.abs(transformed[0][0].y - (paths[0][0].y * 0.8 + 30)) < 1e-5,
    );
  } finally {
    await task.destroy();
  }
});

test("curve projects validate endpoints, retain legacy lines and recalculate path lengths and CSV", () => {
  const d = initialData();
  d.scales[1] = makeCalibration({ x: 0, y: 0 }, { x: 100, y: 0 }, 1000);
  const path = flattenBezier([
    { x: 0, y: 0 },
    { x: 50, y: 100 },
    { x: 100, y: 0 },
  ]);
  d.measurements = [
    {
      id: "curve",
      page: 1,
      a: path[0],
      b: path.at(-1)!,
      path,
      note: "Curve",
      color: "#187bc1",
    },
  ];
  const restored = validateData(JSON.parse(JSON.stringify(d)), 1);
  assert.ok(measurementMM(restored.measurements[0], restored)! > 1478);
  assert.match(measurementCSV(restored), /1,478/);
  assert.throws(() =>
    validateData(
      { ...d, measurements: [{ ...d.measurements[0], path: [] }] },
      1,
    ),
  );
  assert.throws(() =>
    validateData(
      {
        ...d,
        measurements: [
          { ...d.measurements[0], path: [{ x: NaN, y: 0 }, ...path] },
        ],
      },
      1,
    ),
  );
  assert.throws(() =>
    validateData(
      { ...d, measurements: [{ ...d.measurements[0], a: { x: 1, y: 1 } }] },
      1,
    ),
  );
  d.scales[1] = makeCalibration({ x: 0, y: 0 }, { x: 100, y: 0 }, 2000);
  assert.ok(
    Math.abs(measurementMM(d.measurements[0], d)! - pathLength(path) * 20) <
      1e-7,
  );
  delete d.measurements[0].path;
  assert.equal(measurementMM(validateData(d, 1).measurements[0], d), 2000);
});
