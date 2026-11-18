import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultSnapKinds,
  parseSnapKinds,
  snapKinds,
} from "../src/snapPreferences.ts";

test("snap preferences preserve empty selection and normalize valid combinations", () => {
  assert.deepEqual(parseSnapKinds([]), []);
  assert.deepEqual(parseSnapKinds(["tangent", "endpoint"]), [
    "endpoint",
    "tangent",
  ]);
  assert.deepEqual(parseSnapKinds([...snapKinds]), snapKinds);
  assert.deepEqual(defaultSnapKinds, ["endpoint", "midpoint", "intersection"]);
});

test("snap preferences reject malformed, duplicate and unknown snap modes", () => {
  for (const value of [
    null,
    {},
    "endpoint",
    ["center"],
    ["tangent", "tangent"],
    [1],
    [null],
  ])
    assert.throws(() => parseSnapKinds(value));
});
