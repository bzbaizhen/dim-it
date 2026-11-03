import { useSyncExternalStore } from "react";
import english from "./translations.json" with { type: "json" };

export type Language = "zh" | "en";
const preferenceKey = "planmeasure.language";
const listeners = new Set<() => void>();
let language: Language = "zh";
try {
  if (
    typeof window !== "undefined" &&
    window.localStorage.getItem(preferenceKey) === "en"
  )
    language = "en";
} catch {
  /* The interface remains usable when storage is unavailable. */
}

export function setLanguage(value: Language): boolean {
  language = value;
  for (const listener of listeners) listener();
  try {
    window.localStorage.setItem(preferenceKey, value);
    return true;
  } catch {
    return false;
  }
}

export function useLanguage(): Language {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => language,
  );
}

export function t(
  message: string | TemplateStringsArray,
  ...values: unknown[]
): string {
  const key =
    typeof message === "string"
      ? message
      : message.reduce(
          (text, part, index) => text + (index ? `{${index - 1}}` : "") + part,
          "",
        );
  const dictionary: Record<string, string> = english;
  const translated = language === "en" ? (dictionary[key] ?? key) : key;
  return translated.replace(/\{(\d+)\}/g, (placeholder, index) =>
    Number(index) < values.length ? String(values[Number(index)]) : placeholder,
  );
}
