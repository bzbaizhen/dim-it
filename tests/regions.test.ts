import assert from 'node:assert/strict';
import test from 'node:test';
import { initialData, validateData, makeCalibration, measurementCSV, type RegionFill } from '../src/core.ts';
import { isValidRegionGeometry, regionVertices, resizeRegionVertex, validPolygon } from '../src/regions.ts';

test('new projects contain an empty region collection', () => {
  assert.deepEqual((initialData() as unknown as { regions: unknown }).regions, []);
});

test('supplied invalid region data is rejected', () => {
  assert.throws(() => validateData({ ...initialData(), regions: [{ id: 'bad', kind: 'rectangle', page: 1, a: { x: 0, y: 0 }, b: { x: 10, y: 10 }, color: '#ff0000', opacity: 2, note: '' }] }, 1));
});


const rectangle: RegionFill = { id: 'r1', page: 1, kind: 'rectangle', a: { x: 10, y: 20 }, b: { x: 60, y: 80 }, color: '#18ac32', opacity: 0.3, note: 'Room' };
const polygon: RegionFill = { id: 'p1', page: 1, kind: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 15 }], color: '#aa2233', opacity: 1, note: '' };

test('directional rectangles retain native PDF geometry across page rotation', () => {
  for (const [a, b] of [
    [{ x: 10, y: 20 }, { x: 60, y: 80 }],
    [{ x: 60, y: 80 }, { x: 10, y: 20 }],
    [{ x: 10, y: 80 }, { x: 60, y: 20 }],
    [{ x: 60, y: 20 }, { x: 10, y: 80 }],
  ]) {
    const region = { ...rectangle, a, b };
    assert.ok(isValidRegionGeometry(region));
    assert.deepEqual(regionVertices(region), [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]);
    for (const angle of [0, 90, 180, 270]) {
      const data = validateData({ ...initialData(), rotations: { 1: angle }, regions: [region] }, 1);
      assert.deepEqual(data.regions[0], region);
    }
  }
  assert.equal(isValidRegionGeometry({ ...rectangle, b: { ...rectangle.a } }), false);
});

test('polygon rejects crossings, touching, repeated points, zero area and overlapping edges', () => {
  assert.ok(validPolygon(polygon.vertices));
  assert.ok(validPolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }]));
  const invalid = [
    [], [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
    [{ x: 0, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }, { x: 20, y: 0 }],
    [...polygon.vertices, polygon.vertices[0]],
    [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }],
    [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 10, y: 0 }, { x: 0, y: 20 }],
    [{ x: 0, y: 0 }, { x: NaN, y: 2 }, { x: 3, y: 4 }],
    Array.from({ length: 4097 }, (_, index) => ({ x: index, y: index % 2 })),
  ];
  for (const points of invalid) assert.equal(validPolygon(points), false);
});

test('rectangle vertex resizing keeps its opposite fixed and previews are immutable', () => {
  const original = structuredClone(rectangle);
  const corners = regionVertices(rectangle);
  for (let index = 0; index < 4; index++) {
    const point = { x: 100, y: 120 };
    const resized = resizeRegionVertex(rectangle, index, point);
    assert.equal(resized.kind, 'rectangle');
    if (resized.kind !== 'rectangle') throw new Error('rectangle expected');
    assert.deepEqual(resized.a, point);
    assert.deepEqual(resized.b, corners[(index + 2) % 4]);
    point.x = -100;
    assert.equal(resized.a.x, 100);
    assert.ok(isValidRegionGeometry(resized));
  }
  corners[0].x = -100;
  assert.deepEqual(rectangle, original);
  assert.throws(() => resizeRegionVertex(rectangle, 4, { x: 1, y: 2 }));
});

test('polygon resizing edits only its selected vertex without sharing mutable points', () => {
  const original = structuredClone(polygon);
  const resized = resizeRegionVertex(polygon, 1, { x: 30, y: 5 });
  assert.equal(resized.kind, 'polygon');
  if (resized.kind !== 'polygon') throw new Error('polygon expected');
  assert.deepEqual(resized.vertices, [polygon.vertices[0], { x: 30, y: 5 }, polygon.vertices[2]]);
  resized.vertices[0].x = 999;
  assert.deepEqual(polygon, original);
});

test('legacy data normalizes missing regions and regions do not require calibration', () => {
  const { regions: _regions, ...legacy } = initialData();
  assert.deepEqual(validateData(legacy, 1).regions, []);
  const data = validateData({ ...initialData(), regions: [rectangle, polygon] }, 1);
  assert.deepEqual(data.regions, [rectangle, polygon]);
  assert.equal(measurementCSV(data), measurementCSV(initialData()));
  assert.equal(validateData({ ...data, regions: [{ ...rectangle, opacity: 0 }] }, 1).regions[0].opacity, 0);
});

test('region trust boundary rejects malformed geometry, metadata and shared IDs', () => {
  for (const patch of [
    { opacity: NaN }, { opacity: Infinity }, { opacity: -0.1 }, { opacity: 1.1 }, { opacity: '0.3' },
    { id: 3 }, { page: 0 }, { page: 2 }, { page: 1.5 }, { note: 'x'.repeat(1001) },
    { color: 'red' }, { kind: 'unknown' }, { a: { x: 1e9, y: 0 } },
    { kind: 'polygon', vertices: null },
  ]) assert.throws(() => validateData({ ...initialData(), regions: [{ ...rectangle, ...patch }] }, 1));
  assert.throws(() => validateData({ ...initialData(), regions: null }, 1));
  assert.throws(() => validateData({ ...initialData(), regions: [rectangle, rectangle] }, 1));
  const data = initialData();
  data.scales[1] = makeCalibration({ x: 0, y: 0 }, { x: 10, y: 0 }, 100);
  data.measurements = [{ id: rectangle.id, page: 1, a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, color: '#000000', note: '' }];
  assert.throws(() => validateData({ ...data, regions: [rectangle] }, 1));
});
