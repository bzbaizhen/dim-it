import type { SnapKind } from "./snap.ts";

export const snapKinds: readonly SnapKind[] = [
  "endpoint",
  "midpoint",
  "intersection",
  "nearest",
  "perpendicular",
  "tangent",
];
export const snapLabels: Record<SnapKind, string> = {
  endpoint: "端点",
  midpoint: "中点",
  intersection: "交点",
  nearest: "最近点",
  perpendicular: "垂足",
  tangent: "切点",
};
export const defaultSnapKinds: readonly SnapKind[] = [
  "endpoint",
  "midpoint",
  "intersection",
];
export const snapPreferenceKey = "planmeasure.snap-kinds.v1";

export function parseSnapKinds(value: unknown): SnapKind[] {
  if (
    !Array.isArray(value) ||
    value.some((kind) => !snapKinds.includes(kind)) ||
    new Set(value).size !== value.length
  )
    throw new Error("Invalid snap preferences");
  return snapKinds.filter((kind) => value.includes(kind));
}

export function loadSnapKinds(): { kinds: SnapKind[]; warning: boolean } {
  try {
    const raw = window.localStorage.getItem(snapPreferenceKey);
    return {
      kinds:
        raw === null ? [...defaultSnapKinds] : parseSnapKinds(JSON.parse(raw)),
      warning: false,
    };
  } catch {
    return { kinds: [...defaultSnapKinds], warning: true };
  }
}
