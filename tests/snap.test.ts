import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { flattenBezier, pathMidpoint } from "../src/curve.ts";
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

test("snap filters generate only enabled candidates and anchor-dependent modes require an anchor", () => {
  const index = new SnapIndex(lines, bounds);
  assert.equal(
    index.nearest({ x: 100, y: 100 }, 10, undefined, { enabled: [] }),
    null,
  );
  assert.equal(
    index.nearest({ x: 100, y: 100 }, 10, undefined, { enabled: ["midpoint"] }),
    null,
  );
  assert.deepEqual(
    index.nearest({ x: 270, y: 102 }, 5, undefined, { enabled: ["nearest"] }),
    { kind: "nearest", point: { x: 270, y: 100 } },
  );
  for (const kind of ["perpendicular", "tangent"] as const)
    assert.equal(
      index.nearest({ x: 270, y: 100 }, 10, undefined, { enabled: [kind] }),
      null,
    );
  assert.deepEqual(
    index.nearest({ x: 270, y: 102 }, 5, undefined, {
      enabled: ["perpendicular"],
      anchor: { x: 270, y: 200 },
    }),
    { kind: "perpendicular", point: { x: 270, y: 100 } },
  );
  assert.equal(
    index.nearest({ x: 400, y: 100 }, 5, undefined, {
      enabled: ["perpendicular"],
      anchor: { x: 450, y: 200 },
    }),
    null,
  );
  assert.equal(
    index.nearest(
      { x: 270, y: 102 },
      5,
      { coordinate: "y", value: 102 },
      { enabled: ["nearest"] },
    ),
    null,
  );
  assert.equal(
    index.nearest({ x: 100, y: 100 }, NaN, undefined, { enabled: ["nearest"] }),
    null,
  );
});

test("Bezier snapping uses native curves for nearest, perpendicular and multiple true tangencies", () => {
  // B(t) = (100t, 100t²). From (50, 0), tangent roots are t = 0 and 1.
  const controls = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 100, y: 100 },
  ];
  const index = new SnapIndex([], bounds, [], [controls]);
  for (const point of [controls[0], controls[2]]) {
    const hit = index.nearest(point, 2, undefined, {
      enabled: ["tangent"],
      anchor: { x: 50, y: 0 },
    });
    assert.equal(hit?.kind, "tangent");
    assert.ok(
      Math.hypot(hit!.point.x - point.x, hit!.point.y - point.y) < 1e-6,
    );
  }
  const middle = { x: 50, y: 25 };
  const anchor = { x: 40, y: 35 };
  for (const kind of ["nearest", "perpendicular"] as const) {
    const hit = index.nearest(
      kind === "nearest" ? anchor : middle,
      20,
      undefined,
      { enabled: [kind], anchor },
    );
    assert.equal(hit?.kind, kind);
    assert.ok(
      Math.hypot(hit!.point.x - middle.x, hit!.point.y - middle.y) < 1e-6,
    );
  }
  assert.equal(
    index.nearest(middle, 2, undefined, {
      enabled: ["tangent"],
      anchor: { x: 50, y: 40 },
    }),
    null,
  );
  assert.equal(
    index.nearest(middle, 2, undefined, { enabled: ["endpoint"] }),
    null,
  );
  assert.equal(index.nearest(controls[0], 2)?.kind, "endpoint");
  assert.equal(index.nearest(controls[2], 2)?.kind, "endpoint");
  const degenerate = new SnapIndex([], bounds, [], [[middle, middle, middle]]);
  assert.equal(
    degenerate.nearest(middle, 2, undefined, { enabled: ["tangent"], anchor }),
    null,
  );
});

test("nearest remains a fallback when any discrete candidate is inside the radius", () => {
  const index = new SnapIndex(lines, bounds);
  assert.equal(
    index.nearest({ x: 104, y: 100 }, 10, undefined, {
      enabled: ["nearest", "endpoint"],
    })?.kind,
    "endpoint",
  );
  assert.equal(
    index.nearest({ x: 324, y: 100 }, 10, undefined, {
      enabled: ["nearest", "intersection"],
    })?.kind,
    "intersection",
  );
  assert.equal(
    index.nearest({ x: 254, y: 100 }, 10, undefined, {
      enabled: ["nearest", "midpoint"],
    })?.kind,
    "midpoint",
  );
  assert.equal(
    index.nearest({ x: 270, y: 100 }, 10, undefined, {
      enabled: ["nearest", "endpoint"],
    })?.kind,
    "nearest",
  );
});

test("cubic repeated and multiple tangent roots survive numerical isolation", () => {
  const repeated = [
    { x: 0, y: 37.5 },
    { x: 100 / 3, y: 62.5 },
    { x: 200 / 3, y: 37.5 },
    { x: 100, y: 62.5 },
  ];
  const index = new SnapIndex([], bounds, [], [repeated]);
  const hit = index.nearest({ x: 50, y: 50 }, 1, undefined, {
    enabled: ["tangent"],
    anchor: { x: 0, y: 50 },
  });
  assert.ok(hit);
  assert.ok(Math.hypot(hit.point.x - 50, hit.point.y - 50) < 1e-6);
  const cubic = [
    { x: 0, y: 0 },
    { x: 100 / 3, y: 0 },
    { x: 200 / 3, y: 0 },
    { x: 100, y: 100 },
  ];
  const multi = new SnapIndex([], bounds, [], [cubic]);
  for (const point of [
    { x: 0, y: 0 },
    { x: 75, y: 42.1875 },
  ]) {
    const result = multi.nearest(point, 1, undefined, {
      enabled: ["tangent"],
      anchor: { x: 50, y: 0 },
    });
    assert.ok(result);
    assert.ok(
      Math.hypot(result.point.x - point.x, result.point.y - point.y) < 1e-6,
    );
  }
});

test("transformed native tangencies and perpendiculars use page-space geometry", () => {
  // Rotate 90 degrees after a non-uniform scale, then translate into the page.
  const transform = (p: { x: number; y: number }) => ({
    x: 300 - 3 * p.y,
    y: 20 + 2 * p.x,
  });
  const controls = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 100, y: 100 },
  ].map(transform);
  const index = new SnapIndex([], bounds, [], [controls]);
  const tangent = index.nearest(transform({ x: 100, y: 100 }), 2, undefined, {
    enabled: ["tangent"],
    anchor: transform({ x: 50, y: 0 }),
  });
  assert.ok(tangent);
  const foot = transform({ x: 50, y: 25 });
  // Page-space tangent at t=.5 is (-300,200), so (20,30) is normal.
  const anchor = { x: foot.x + 20, y: foot.y + 30 };
  const perpendicular = index.nearest(foot, 2, undefined, {
    enabled: ["perpendicular"],
    anchor,
  });
  assert.ok(perpendicular);
  assert.ok(
    Math.hypot(perpendicular.point.x - foot.x, perpendicular.point.y - foot.y) <
      1e-6,
  );
  assert.equal(
    index.nearest(
      foot,
      2,
      { coordinate: "x", value: foot.x + 1 },
      { enabled: ["perpendicular"], anchor },
    ),
    null,
  );
  const outside = new SnapIndex(
    [],
    [0, 0, 10, 10],
    [],
    [
      [
        { x: 20, y: 20 },
        { x: 30, y: 30 },
        { x: 40, y: 20 },
      ],
    ],
  );
  assert.equal(
    outside.nearest({ x: 20, y: 20 }, 100, undefined, {
      enabled: ["endpoint", "nearest"],
    }),
    null,
  );
  assert.equal(index.nearest({ x: Infinity, y: 0 }, 5), null);
});

test("curve midpoint uses half the full arc length and flattened vertices are never endpoints", () => {
  const controls = [
    { x: 10, y: 10 },
    { x: 20, y: 180 },
    { x: 160, y: 10 },
  ];
  const path = flattenBezier(controls);
  const middle = pathMidpoint(path);
  const index = new SnapIndex([], bounds, [path], [controls]);
  assert.equal(index.nearest(middle, 0.01)?.kind, "midpoint");
  assert.equal(
    index.nearest(path[Math.floor(path.length / 4)], 0.01, undefined, {
      enabled: ["endpoint"],
    }),
    null,
  );
  const legacy = new SnapIndex([], bounds, [path]);
  assert.equal(
    legacy.nearest(path[100], 1, undefined, { enabled: ["nearest"] })?.kind,
    "nearest",
  );
  assert.equal(index.nearest({ x: 1, y: 1 }, 0), null);
  assert.equal(new SnapIndex([], bounds).nearest({ x: 10, y: 10 }, 10), null);
});

test("quadratic operator controls are transformed without depending on flattened output", () => {
  const native: { x: number; y: number }[][] = [];
  extractSegments(
    {
      fnArray: [OPS.transform, OPS.constructPath],
      argsArray: [
        [0, 2, -3, 0, 300, 20],
        [OPS.stroke, [[0, 0, 0, 3, 50, 0, 100, 100]], []],
      ],
    },
    OPS,
    undefined,
    native,
  );
  assert.deepEqual(native, [
    [
      { x: 300, y: 20 },
      { x: 300, y: 120 },
      { x: 0, y: 220 },
    ],
  ]);
});

test("zero endpoint derivatives use the limiting tangent and reject spurious stationary roots", () => {
  const controls = [
    { x: 20, y: 20 },
    { x: 20, y: 20 },
    { x: 100, y: 100 },
  ];
  const index = new SnapIndex([], bounds, [], [controls]);
  assert.equal(
    index.nearest(controls[0], 1, undefined, {
      enabled: ["tangent"],
      anchor: { x: 10, y: 10 },
    })?.kind,
    "tangent",
  );
  assert.equal(
    index.nearest(controls[0], 1, undefined, {
      enabled: ["tangent"],
      anchor: { x: 10, y: 20 },
    }),
    null,
  );
  assert.equal(
    index.nearest(controls[0], 1, undefined, {
      enabled: ["perpendicular"],
      anchor: { x: 10, y: 20 },
    }),
    null,
  );
});
