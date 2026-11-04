import { pathLength } from "./curve.ts";
import { t } from "./i18n.ts";
import { isValidRegionGeometry, type RegionFill } from "./regions.ts";
export type { RegionFill } from "./regions.ts";
export type Unit = "mm" | "in" | "ft" | "ft-in";
export type Point = { x: number; y: number };
export type Calibration = {
  a: Point;
  b: Point;
  millimeters: number;
  mmPerPoint: number;
};
export type Measurement = {
  id: string;
  page: number;
  a: Point;
  b: Point;
  path?: Point[];
  note: string;
  color: string;
};
export type ProjectData = {
  scales: Record<string, Calibration>;
  measurements: Measurement[];
  regions: RegionFill[];
  unit: Unit;
  precision: number;
  rotations: Record<string, number>;
};

export const initialData = (): ProjectData => ({
  scales: {},
  measurements: [],
  regions: [],
  unit: "mm",
  precision: 1,
  rotations: {},
});
export const distance = (a: Point, b: Point) =>
  Math.hypot(b.x - a.x, b.y - a.y);

function positiveNumber(value: string): number {
  const match = value
    .trim()
    .match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$|^(\d+(?:\.\d*)?|\.\d+)$/);
  if (!match)
    throw new Error(t("请输入数字、小数或分数，例如 1200、3.5、3 1/2"));
  const number =
    match[4] !== undefined
      ? Number(match[4])
      : Number(match[1] || 0) + Number(match[2]) / Number(match[3]);
  if (!Number.isFinite(number))
    throw new Error(t("请输入有效尺寸，分母不能为 0"));
  return number;
}

export function parseDistance(input: string, unit: Unit): number {
  const text = input.trim().replace(/[′’‘]/g, "'").replace(/[″“”]/g, '"');
  let value: number;
  if (unit === "ft-in" && /['"]/.test(text)) {
    const match = text.match(/^(?:(.*?)'\s*-?\s*)?(?:(.*?)")?$/);
    if (!match || (!match[1] && !match[2]))
      throw new Error(t("英尺英寸格式例如 12' 6 1/2\""));
    const feet = match[1] ? positiveNumber(match[1]) : 0;
    const inches = match[2] ? positiveNumber(match[2]) : 0;
    value = feet * 304.8 + inches * 25.4;
  } else {
    value =
      positiveNumber(text) *
      { mm: 1, in: 25.4, ft: 304.8, "ft-in": 304.8 }[unit];
  }
  if (!Number.isFinite(value) || value <= 0 || value > 1e12)
    throw new Error(t("校准尺寸必须大于 0，且小于 1 万亿 mm"));
  return value;
}

export function formatDistance(mm: number, unit: Unit, precision = 1): string {
  if (unit === "ft-in") {
    const sixteenths = Math.round((mm / 25.4) * 16);
    const feet = Math.floor(sixteenths / 192);
    const inches = Math.floor((sixteenths % 192) / 16);
    let numerator = sixteenths % 16;
    let denominator = 16;
    while (numerator && numerator % 2 === 0) {
      numerator /= 2;
      denominator /= 2;
    }
    return `${feet}' ${inches}${numerator ? ` ${numerator}/${denominator}` : ""}"`;
  }
  const value = mm / { mm: 1, in: 25.4, ft: 304.8 }[unit];
  return `${value.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision })} ${unit}`;
}

export function makeCalibration(
  a: Point,
  b: Point,
  millimeters: number,
): Calibration {
  const length = distance(a, b);
  if (
    !Number.isFinite(length) ||
    length < 0.01 ||
    !Number.isFinite(millimeters) ||
    millimeters <= 0
  )
    throw new Error(t("校准的两点必须分开，实际尺寸必须大于 0"));
  return { a, b, millimeters, mmPerPoint: millimeters / length };
}

export function measurementMM(
  measurement: Measurement,
  data: ProjectData,
): number | null {
  const scale = data.scales[measurement.page];
  return scale
    ? (measurement.path
        ? pathLength(measurement.path)
        : distance(measurement.a, measurement.b)) * scale.mmPerPoint
    : null;
}

function isPoint(value: unknown): value is Point {
  const point = value as Point | null;
  return (
    !!point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Math.abs(point.x) < 1e9 &&
    Math.abs(point.y) < 1e9
  );
}

export function validateData(value: unknown, pageCount: number): ProjectData {
  if (!value || typeof value !== "object")
    throw new Error(t("项目数据格式无效"));
  const data = value as ProjectData;
  if (
    !["mm", "in", "ft", "ft-in"].includes(data.unit) ||
    ![0, 1, 2, 3].includes(data.precision) ||
    !data.scales ||
    !data.rotations ||
    !Array.isArray(data.measurements)
  )
    throw new Error(t("项目设置格式无效"));
  const pageValid = (page: number) =>
    Number.isInteger(page) && page >= 1 && page <= pageCount;
  const scales: ProjectData["scales"] = {};
  for (const [page, scale] of Object.entries(data.scales)) {
    if (
      !pageValid(Number(page)) ||
      !scale ||
      !isPoint(scale.a) ||
      !isPoint(scale.b)
    )
      throw new Error(t("项目校准数据无效"));
    scales[page] = makeCalibration(scale.a, scale.b, scale.millimeters);
  }
  const ids = new Set<string>();
  if (data.measurements.length > 100000)
    throw new Error(t("项目标注数量超出限制"));
  let totalPathPoints = 0;
  for (const measurement of data.measurements) {
    if (
      !measurement ||
      !pageValid(measurement.page) ||
      !isPoint(measurement.a) ||
      !isPoint(measurement.b) ||
      typeof measurement.id !== "string" ||
      ids.has(measurement.id) ||
      typeof measurement.note !== "string" ||
      measurement.note.length > 1000 ||
      !/^#[0-9a-f]{6}$/i.test(measurement.color) ||
      !scales[measurement.page]
    )
      throw new Error(t("项目标注数据无效"));
    if (measurement.path !== undefined) {
      const path = measurement.path;
      if (
        !Array.isArray(path) ||
        path.length < 2 ||
        path.length > 1000000 ||
        !path.every(isPoint) ||
        distance(path[0], measurement.a) > 1e-6 ||
        distance(path[path.length - 1], measurement.b) > 1e-6 ||
        pathLength(path) <= 0 ||
        (totalPathPoints += path.length) > 1000000
      )
        throw new Error(t("项目曲线数据无效"));
    }
    ids.add(measurement.id);
  }
  const regions = data.regions === undefined ? [] : data.regions;
  if (!Array.isArray(regions) || data.measurements.length + regions.length > 100000)
    throw new Error(t("项目区域数据无效"));
  for (const region of regions) {
    if (
      !region ||
      !pageValid(region.page) ||
      typeof region.id !== "string" ||
      ids.has(region.id) ||
      typeof region.note !== "string" ||
      region.note.length > 1000 ||
      !/^#[0-9a-f]{6}$/i.test(region.color) ||
      !Number.isFinite(region.opacity) ||
      region.opacity < 0 || region.opacity > 1 ||
      !isValidRegionGeometry(region)
    ) throw new Error(t("项目区域数据无效"));
    totalPathPoints += region.kind === "polygon" ? region.vertices.length : 4;
    if (totalPathPoints > 1000000) throw new Error(t("项目区域数据无效"));
    ids.add(region.id);
  }
  for (const [page, rotation] of Object.entries(data.rotations)) {
    if (!pageValid(Number(page)) || ![0, 90, 180, 270].includes(rotation))
      throw new Error(t("项目旋转设置无效"));
  }
  return { ...data, scales, regions };
}

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let start = 0; start < bytes.length; start += 32768)
    parts.push(String.fromCharCode(...bytes.subarray(start, start + 32768)));
  return btoa(parts.join(""));
}

export function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export function measurementCSV(data: ProjectData): string {
  const cell = (value: string | number) =>
    `"${String(value).replaceAll('"', '""')}"`;
  const rows = [
    ["Page", "ID", "Measurement", "Unit", "Length_mm", "Note"],
    ...data.measurements.map((item, index) => {
      const mm = measurementMM(item, data);
      // Prevent spreadsheet formula execution in user-entered notes.
      const note = /^[\s]*[=+@\-]/.test(item.note)
        ? `'${item.note}`
        : item.note;
      return [
        item.page,
        index + 1,
        mm === null ? "" : formatDistance(mm, data.unit, data.precision),
        data.unit,
        mm ?? "",
        note,
      ];
    }),
  ];
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
