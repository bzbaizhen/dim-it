import { useState } from "react";
import { t } from "./i18n.ts";

export default function AppearanceColor({
  id,
  label,
  color,
  opacity,
  disabled,
  active,
  onActivate,
  onColor,
  onOpacity,
  onCommit,
}: {
  id: string;
  label: string;
  color: string;
  opacity: number;
  disabled?: boolean;
  active?: boolean;
  onActivate?: () => void;
  onColor: (color: string) => void;
  onOpacity: (opacity: number) => void;
  onCommit: () => void;
}) {
  const [opacityInput, setOpacityInput] = useState<string | null>(null);
  const percent = Math.round(opacity * 100);
  return (
    <div
      className={`appearance-channel${active ? " active" : ""}`}
      onFocus={onActivate}
      onPointerDown={onActivate}
    >
      <div className="appearance-color-row">
        <label htmlFor={`${id}-color`}>{label}</label>
        <label
          className="appearance-color-value"
          htmlFor={`${id}-color`}
          title={color.toUpperCase()}
        >
          <input
            id={`${id}-color`}
            type="color"
            aria-label={t`${label}颜色`}
            value={color}
            disabled={disabled}
            onChange={(event) => onColor(event.target.value)}
            onBlur={onCommit}
          />
        </label>
      </div>
      <div className="appearance-opacity-row">
        <input
          id={`${id}-opacity`}
          type="range"
          min="0"
          max="100"
          aria-label={t`${label}不透明度`}
          value={percent}
          disabled={disabled}
          onChange={(event) => onOpacity(Number(event.target.value) / 100)}
          onPointerUp={onCommit}
          onPointerCancel={onCommit}
          onKeyUp={onCommit}
          onBlur={onCommit}
        />
        <label className="appearance-percent">
          <input
            id={`${id}-percent`}
            type="text"
            inputMode="numeric"
            aria-label={t`${label}不透明度百分比`}
            value={opacityInput ?? String(percent)}
            disabled={disabled}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setOpacityInput(event.target.value)}
            onBlur={() => {
              const value = Number(opacityInput);
              if (opacityInput?.trim() && Number.isFinite(value)) {
                const next = Math.min(100, Math.max(0, Math.round(value)));
                if (next !== percent) onOpacity(next / 100);
                onCommit();
              }
              setOpacityInput(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                event.stopPropagation();
                setOpacityInput(null);
              }
            }}
          />
          <span aria-hidden="true">%</span>
        </label>
      </div>
    </div>
  );
}
