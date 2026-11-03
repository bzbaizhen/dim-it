import assert from "node:assert/strict";
import test from "node:test";
import {
  distance,
  formatDistance,
  initialData,
  makeCalibration,
  measurementCSV,
  measurementMM,
  parseDistance,
  validateData,
  type Measurement,
} from "../src/core.ts";

test("unit conversions and feet / inches input", () => {
  assert.equal(parseDistance("6000", "mm"), 6000);
  assert.equal(parseDistance("1", "in"), 25.4);
  assert.equal(parseDistance("1", "ft"), 304.8);
  assert.equal(parseDistance("3 1/2", "in"), 88.89999999999999);
  assert.ok(Math.abs(parseDistance(`12' 6 1/2"`, "ft-in") - 3822.7) < 1e-8);
  assert.ok(Math.abs(parseDistance(`12'-6"`, "ft-in") - 3810) < 1e-8);
  assert.ok(Math.abs(parseDistance(`0' 6"`, "ft-in") - 152.4) < 1e-8);
  assert.ok(Math.abs(parseDistance(`6"`, "ft-in") - 152.4) < 1e-8);
  assert.equal(formatDistance(304.8, "ft-in"), `1' 0"`);
  assert.equal(formatDistance(3822.7, "ft-in"), `12' 6 1/2"`);
  assert.equal(formatDistance(304.799, "ft-in"), `1' 0"`);
  for (const value of ["0", "-1", "", "NaN", "1/0", "1abc", "Infinity"])
    assert.throws(() => parseDistance(value, "mm"));
  assert.throws(() => parseDistance(`-1' 6"`, "ft-in"));
});

test("calibration uses Euclidean PDF coordinates and stays page-local", () => {
  const data = initialData();
  data.scales[1] = makeCalibration({ x: 10, y: 20 }, { x: 310, y: 20 }, 6000);
  const measurement: Measurement = {
    id: "m1",
    page: 1,
    a: { x: 100, y: 80 },
    b: { x: 700, y: 80 },
    note: "",
    color: "#187bc1",
  };
  assert.equal(measurementMM(measurement, data), 12000);
  assert.equal(measurementMM({ ...measurement, page: 2 }, data), null);
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  data.measurements = [measurement];
  const recovered = validateData(JSON.parse(JSON.stringify(data)), 2);
  assert.equal(measurementMM(recovered.measurements[0], recovered), 12000);
  data.scales[1] = makeCalibration({ x: 10, y: 20 }, { x: 310, y: 20 }, 3000);
  assert.equal(measurementMM(measurement, data), 6000);
  assert.throws(() => makeCalibration({ x: 1, y: 1 }, { x: 1, y: 1 }, 1));
});

test("reject corrupted projects and escape spreadsheet notes", () => {
  const data = initialData();
  data.scales[1] = makeCalibration({ x: 0, y: 0 }, { x: 100, y: 0 }, 1000);
  data.measurements = [
    {
      id: "1",
      page: 1,
      a: { x: 1, y: 1 },
      b: { x: 11, y: 1 },
      note: '=HYPERLINK("x")',
      color: "#187bc1",
    },
  ];
  assert.match(measurementCSV(data), /'\=HYPERLINK/);
  assert.throws(() => validateData({ ...data, unit: "yards" }, 1));
  assert.throws(() => validateData({ ...data, scales: {} }, 1));
  assert.throws(() =>
    validateData(
      { ...data, measurements: [...data.measurements, ...data.measurements] },
      1,
    ),
  );
  assert.throws(() => validateData({ ...data, rotations: { 1: 33 } }, 1));
});
