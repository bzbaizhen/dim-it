import type { Point } from "./core.ts";

type RegionBase = {
  id: string;
  page: number;
  color: string;
  opacity: number;
  note: string;
};
export type RegionFill = RegionBase &
  (
    | { kind: "rectangle"; a: Point; b: Point }
    | { kind: "polygon"; vertices: Point[] }
  );

export function regionVertices(region: RegionFill): Point[] {
  if (region.kind === "polygon")
    return region.vertices.map((point) => ({ ...point }));
  const { a, b } = region;
  return [{ ...a }, { x: b.x, y: a.y }, { ...b }, { x: a.x, y: b.y }];
}

function validPoint(point: Point): boolean {
  return (
    !!point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Math.abs(point.x) < 1e9 &&
    Math.abs(point.y) < 1e9
  );
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point, b: Point, point: Point): boolean {
  return (
    cross(a, b, point) === 0 &&
    point.x >= Math.min(a.x, b.x) &&
    point.x <= Math.max(a.x, b.x) &&
    point.y >= Math.min(a.y, b.y) &&
    point.y <= Math.max(a.y, b.y)
  );
}

function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c),
    abD = cross(a, b, d);
  const cdA = cross(c, d, a),
    cdB = cross(c, d, b);
  return (
    (Math.sign(abC) * Math.sign(abD) < 0 &&
      Math.sign(cdA) * Math.sign(cdB) < 0) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}

export function validPolygon(points: Point[]): boolean {
  if (
    !Array.isArray(points) ||
    points.length < 3 ||
    points.length > 4096 ||
    !points.every(validPoint)
  )
    return false;
  if (
    new Set(points.map((point) => `${point.x},${point.y}`)).size !==
    points.length
  )
    return false;
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index],
      b = points[(index + 1) % points.length];
    const previous = points[(index + points.length - 1) % points.length];
    // Adjacent edges may continue straight, but cannot double back and overlap.
    if (
      cross(previous, a, b) === 0 &&
      (a.x - previous.x) * (b.x - a.x) + (a.y - previous.y) * (b.y - a.y) < 0
    )
      return false;
    area += cross(points[0], a, b);
    for (let other = index + 2; other < points.length; other++) {
      if (index === 0 && other === points.length - 1) continue;
      if (intersects(a, b, points[other], points[(other + 1) % points.length]))
        return false;
    }
  }
  return Number.isFinite(area) && area !== 0;
}

export function isValidRegionGeometry(region: RegionFill): boolean {
  if (!region) return false;
  if (region.kind === "rectangle") {
    return (
      validPoint(region.a) &&
      validPoint(region.b) &&
      region.a.x !== region.b.x &&
      region.a.y !== region.b.y
    );
  }
  return region.kind === "polygon" && validPolygon(region.vertices);
}

export function resizeRegionVertex(
  region: RegionFill,
  index: number,
  newPoint: Point,
): RegionFill {
  const vertices = regionVertices(region);
  if (!Number.isInteger(index) || index < 0 || index >= vertices.length)
    throw new RangeError("Invalid region vertex index");
  if (region.kind === "polygon") {
    vertices[index] = { ...newPoint };
    return { ...region, vertices };
  }
  const opposite = vertices[(index + 2) % 4];
  return { ...region, a: { ...newPoint }, b: opposite };
}
