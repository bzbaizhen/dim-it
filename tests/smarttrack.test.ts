import test from "node:test";
import assert from "node:assert/strict";
import {
  captureSmartPoint,
  nearestTrackingPoint,
  samePoint,
  type SnapHit,
} from "../src/snap.ts";

const reference: SnapHit = { point: { x: 300, y: 250 }, kind: "endpoint" };

test("SmartTrack projects off-axis references to the locked coordinate", () => {
  assert.deepEqual(
    nearestTrackingPoint(
      { x: 303, y: 100 },
      { coordinate: "y", value: 100 },
      [reference],
      10,
    ),
    { point: { x: 300, y: 100 }, source: reference },
  );
  assert.deepEqual(
    nearestTrackingPoint(
      { x: 100, y: 253 },
      { coordinate: "x", value: 100 },
      [reference],
      10,
    ),
    { point: { x: 100, y: 250 }, source: reference },
  );
  assert.equal(
    nearestTrackingPoint(
      { x: 311, y: 100 },
      { coordinate: "y", value: 100 },
      [reference],
      10,
    ),
    null,
  );
  assert.equal(
    nearestTrackingPoint(
      { x: 300, y: 100 },
      { coordinate: "y", value: 100 },
      [],
      10,
    ),
    null,
  );
  assert.equal(
    nearestTrackingPoint(
      { x: 300, y: 100 },
      { coordinate: "y", value: 100 },
      [reference],
      Infinity,
    ),
    null,
  );
});

test("nearest track wins with the newest reference breaking a tie", () => {
  const near: SnapHit = { point: { x: 305, y: 400 }, kind: "midpoint" };
  assert.equal(
    nearestTrackingPoint(
      { x: 304, y: 100 },
      { coordinate: "y", value: 100 },
      [reference, near],
      10,
    )?.source,
    near,
  );
  const duplicateAxis: SnapHit = {
    point: { x: 300, y: 410 },
    kind: "intersection",
  };
  assert.equal(
    nearestTrackingPoint(
      { x: 300, y: 100 },
      { coordinate: "y", value: 100 },
      [reference, duplicateAxis],
      10,
    )?.source,
    duplicateAxis,
  );
});

test("captured reference points are unique and bounded to the latest four", () => {
  const initial = [reference];
  assert.equal(
    captureSmartPoint(initial, {
      point: { x: 300 + 1e-8, y: 250 },
      kind: "midpoint",
    }),
    initial,
  );
  let points: SnapHit[] = [];
  for (let x = 0; x < 6; x++)
    points = captureSmartPoint(points, {
      point: { x, y: 100 },
      kind: "endpoint",
    });
  assert.deepEqual(
    points.map((item) => item.point.x),
    [2, 3, 4, 5],
  );
  assert.ok(samePoint({ x: 1, y: 2 }, { x: 1, y: 2 }));
  assert.equal(samePoint({ x: 1, y: 2 }, { x: 1, y: 3 }), false);
});
