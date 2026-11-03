import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { OPS, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  extractSegments,
  SnapIndex,
  intersection,
  type Segment,
} from "../src/snap.ts";

const lines: Segment[] = [
  { a: { x: 100, y: 100 }, b: { x: 400, y: 100 } },
  { a: { x: 320, y: 40 }, b: { x: 320, y: 180 } },
];
const bounds = [0, 0, 600, 450] as const;

test("nearest endpoint, midpoint and finite-segment intersection", () => {
  const index = new SnapIndex(lines, bounds);
  assert.deepEqual(index.nearest({ x: 104, y: 103 }, 10), {
    point: { x: 100, y: 100 },
    kind: "endpoint",
  });
  assert.deepEqual(index.nearest({ x: 254, y: 103 }, 10), {
    point: { x: 250, y: 100 },
    kind: "midpoint",
  });
  assert.deepEqual(index.nearest({ x: 324, y: 103 }, 10), {
    point: { x: 320, y: 100 },
    kind: "intersection",
  });
  assert.equal(index.nearest({ x: 280, y: 100 }, 10), null);
  assert.equal(
    intersection(lines[0], { a: { x: 500, y: 40 }, b: { x: 500, y: 180 } }),
    null,
  );
  assert.equal(
    intersection(lines[0], { a: { x: 150, y: 100 }, b: { x: 200, y: 100 } }),
    null,
  );
  assert.equal(
    index.nearest({ x: 324, y: 103 }, 10, { coordinate: "y", value: 103 }),
    null,
  );
  assert.deepEqual(
    index.nearest({ x: 324, y: 100 }, 10, { coordinate: "y", value: 100 })
      ?.point,
    { x: 320, y: 100 },
  );
  assert.equal(index.nearest({ x: 324, y: 103 }, 1), null);
});

test("coincident types favor endpoints and candidates outside the page bounds are ignored", () => {
  const index = new SnapIndex(
    [...lines, { a: { x: 320, y: 100 }, b: { x: 350, y: 100 } }],
    bounds,
  );
  assert.equal(index.nearest({ x: 320, y: 100 }, 10)?.kind, "endpoint");
  const clipped = new SnapIndex(
    [{ a: { x: -2, y: 10 }, b: { x: 2, y: 10 } }],
    [0, 0, 100, 100],
  );
  assert.ok(clipped.nearest({ x: 0, y: 10 }, 10)!.point.x >= 0);
  assert.equal(index.nearest({ x: 320, y: 100 }, Infinity), null);
});

test("local intersection pruning matches exhaustive nearest-point selection", () => {
  let seed = 403;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const segments = Array.from({ length: 40 }, () => ({
    a: { x: random() * 600, y: random() * 450 },
    b: { x: random() * 600, y: random() * 450 },
  }));
  const index = new SnapIndex(segments, bounds);
  const candidates = [];
  for (const [i, segment] of segments.entries()) {
    candidates.push(
      { point: segment.a, kind: "endpoint" },
      { point: segment.b, kind: "endpoint" },
      {
        point: {
          x: (segment.a.x + segment.b.x) / 2,
          y: (segment.a.y + segment.b.y) / 2,
        },
        kind: "midpoint",
      },
    );
    for (let j = 0; j < i; j++) {
      const point = intersection(segment, segments[j]);
      if (point) candidates.push({ point, kind: "intersection" });
    }
  }
  const priority = { endpoint: 0, intersection: 1, midpoint: 2 };
  for (let i = 0; i < 200; i++) {
    const point = { x: random() * 600, y: random() * 450 };
    const nearest = candidates
      .map((hit) => ({
        ...hit,
        distance: Math.hypot(point.x - hit.point.x, point.y - hit.point.y),
      }))
      .filter((hit) => hit.distance <= 28)
      .sort((a, b) =>
        Math.abs(a.distance - b.distance) > 1e-7
          ? a.distance - b.distance
          : priority[a.kind] - priority[b.kind],
      )[0];
    const actual = index.nearest(point, 28);
    assert.equal(actual?.kind, nearest?.kind);
    if (actual && nearest)
      assert.ok(
        Math.hypot(
          actual.point.x - nearest.point.x,
          actual.point.y - nearest.point.y,
        ) < 1e-6,
      );
  }
});

test("PDF path parsing honors graphics saves, affine transforms, forms and curves", () => {
  const segments = extractSegments(
    {
      fnArray: [
        OPS.save,
        OPS.transform,
        OPS.constructPath,
        OPS.paintFormXObjectBegin,
        OPS.constructPath,
        OPS.paintFormXObjectEnd,
        OPS.restore,
        OPS.constructPath,
        OPS.constructPath,
      ],
      argsArray: [
        [],
        [2, 0, 0, 3, 10, 20],
        [OPS.stroke, [new Float32Array([0, 1, 2, 1, 11, 2])], [1, 2, 11, 2]],
        [[1, 0, 0, 1, 5, 7], null],
        [OPS.stroke, [new Float32Array([0, 0, 0, 1, 1, 0])], [0, 0, 1, 0]],
        [],
        [],
        [
          OPS.stroke,
          [new Float32Array([0, 0, 0, 2, 1, 2, 3, 4, 5, 6, 1, 10, 6])],
          [0, 0, 10, 6],
        ],
        [
          OPS.endPath,
          [new Float32Array([0, 0, 0, 1, 999, 999])],
          [0, 0, 999, 999],
        ],
      ],
    },
    OPS,
  );
  assert.deepEqual(segments, [
    { a: { x: 12, y: 26 }, b: { x: 32, y: 26 } },
    { a: { x: 20, y: 41 }, b: { x: 22, y: 41 } },
    { a: { x: 5, y: 6 }, b: { x: 10, y: 6 } },
  ]);
  const closed = extractSegments(
    {
      fnArray: [OPS.constructPath],
      argsArray: [
        [OPS.fill, [[0, 10, 10, 1, 30, 10, 1, 30, 30]], [10, 10, 30, 30]],
      ],
    },
    OPS,
  );
  assert.equal(closed.length, 3);
});

test("real PDF.js operator list produces exact fixture snap coordinates", async () => {
  const task = getDocument({
    data: new Uint8Array(await readFile("tests/fixtures/snap.pdf")),
  });
  try {
    const page = await (await task.promise).getPage(1);
    const index = new SnapIndex(
      extractSegments(await page.getOperatorList(), OPS),
      bounds,
    );
    assert.deepEqual(index.nearest({ x: 324, y: 103 }, 10), {
      point: { x: 320, y: 100 },
      kind: "intersection",
    });
    assert.deepEqual(index.nearest({ x: 254, y: 103 }, 10), {
      point: { x: 250, y: 100 },
      kind: "midpoint",
    });
    assert.deepEqual(index.nearest({ x: 104, y: 103 }, 10), {
      point: { x: 100, y: 100 },
      kind: "endpoint",
    });
  } finally {
    await task.destroy();
  }
});
