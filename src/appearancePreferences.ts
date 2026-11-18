import { markupStyle, validMarkupStyle, type MarkupStyle } from "./annotations.ts";

type StrokeStyle = { color: string; opacity: number };
export type AppearanceDefaults = {
  measurement: StrokeStyle;
  fill: StrokeStyle;
  revision: StrokeStyle;
  markup: MarkupStyle;
  fontSize: number;
};

export const appearanceKey = "planmeasure.appearance.v1";
export const appearanceColors = ["#187bc1", "#d24a3e", "#198267", "#9b5bc2"];
export const markupFontSizes = [8, 10, 12, 14, 16, 18, 24, 32, 48];
export const factoryAppearance: AppearanceDefaults = {
  measurement: { color: appearanceColors[0], opacity: 1 },
  fill: { color: appearanceColors[0], opacity: 0.25 },
  revision: { color: appearanceColors[1], opacity: 1 },
  markup: markupStyle({ color: appearanceColors[1] }),
  fontSize: 14,
};

function validStroke(style: StrokeStyle | undefined): style is StrokeStyle {
  return (
    typeof style?.color === "string" &&
    /^#[0-9a-f]{6}$/i.test(style.color) &&
    Number.isFinite(style.opacity) &&
    style.opacity >= 0 &&
    style.opacity <= 1
  );
}

export function loadAppearanceDefaults(): AppearanceDefaults {
  try {
    const raw = window.localStorage.getItem(appearanceKey);
    if (!raw) return factoryAppearance;
    const saved: Partial<AppearanceDefaults> = JSON.parse(raw);
    return {
      measurement: validStroke(saved.measurement) ? saved.measurement : factoryAppearance.measurement,
      fill: validStroke(saved.fill) ? saved.fill : factoryAppearance.fill,
      revision: validStroke(saved.revision) ? saved.revision : factoryAppearance.revision,
      markup: saved.markup && validMarkupStyle(saved.markup) ? saved.markup : factoryAppearance.markup,
      fontSize: saved.fontSize !== undefined && markupFontSizes.includes(saved.fontSize)
        ? saved.fontSize
        : factoryAppearance.fontSize,
    };
  } catch {
    return factoryAppearance;
  }
}
