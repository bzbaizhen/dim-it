import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { SnapKind } from "./snap.ts";
import { defaultSnapKinds, snapKinds, snapLabels } from "./snapPreferences.ts";
import { t, useLanguage } from "./i18n.ts";

const descriptions: Record<SnapKind, string> = {
  endpoint: "直线和曲线的端点",
  midpoint: "直线中点与整段曲线的半长度点",
  intersection: "有限直线段的交点",
  nearest: "直线或曲线上距光标最近的位置",
  perpendicular: "从已选起点向直线或曲线作垂线",
  tangent: "从已选起点向曲线作切线",
};
const codes: Record<SnapKind, string> = {
  endpoint: "End",
  midpoint: "Mid",
  intersection: "Int",
  nearest: "Near",
  perpendicular: "Perp",
  tangent: "Tan",
};

export default function SnapSettings({
  enabled,
  warning,
  onChange,
  onClose,
}: {
  enabled: readonly SnapKind[];
  warning: boolean;
  onChange: (kinds: SnapKind[]) => void;
  onClose: () => void;
}) {
  const language = useLanguage();
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 110 });
  useLayoutEffect(() => {
    function place() {
      if (!panel.current?.parentElement) return;
      const anchor = panel.current.parentElement.getBoundingClientRect();
      const bounds = panel.current.getBoundingClientRect();
      setPosition({
        left: Math.max(
          12,
          Math.min(
            anchor.right - bounds.width,
            window.innerWidth - bounds.width - 12,
          ),
        ),
        top: Math.max(
          12,
          Math.min(anchor.bottom + 8, window.innerHeight - bounds.height - 12),
        ),
      });
    }
    place();
    const observer = new ResizeObserver(place);
    const toolbar = panel.current?.parentElement?.parentElement;
    if (toolbar) observer.observe(toolbar);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [warning, language]);
  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <>
      <button
        className="snap-menu-dismiss"
        aria-label={t("关闭捕捉设置")}
        onClick={onClose}
      />
      <section
        ref={panel}
        style={position}
        className="snap-settings"
        id="snap-settings"
        role="dialog"
        aria-label={t("捕捉设置")}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <header>
          <strong>{t("捕捉设置")}</strong>
          <button
            ref={close}
            className="icon-button"
            aria-label={t("关闭捕捉设置")}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="snap-options">
          {snapKinds.map((kind) => (
            <div className="snap-option" key={kind}>
              <label
                onContextMenu={(event) => {
                  event.preventDefault();
                  onChange([kind]);
                }}
              >
                <input
                  type="checkbox"
                  checked={enabled.includes(kind)}
                  aria-label={t`${t(snapLabels[kind])}捕捉`}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...enabled, kind]
                        : enabled.filter((value) => value !== kind),
                    )
                  }
                />
                <span>
                  <span>
                    {t(snapLabels[kind])}
                    <small className="snap-code">{codes[kind]}</small>
                  </span>
                  <small>{t(descriptions[kind])}</small>
                </span>
              </label>
              <button
                className="snap-only"
                aria-label={t`仅启用${t(snapLabels[kind])}捕捉`}
                onClick={() => onChange([kind])}
              >
                {t("仅此项")}
              </button>
            </div>
          ))}
        </div>
        <p>{t("垂足与切点在选取起点后可用。")}</p>
        {warning && (
          <p className="snap-warning" role="alert">
            {t("捕捉偏好读取或保存失败，本次设置仍在当前会话生效。")}
          </p>
        )}
        <footer>
          <button onClick={() => onChange([...snapKinds])}>{t("全选")}</button>
          <button onClick={() => onChange([])}>{t("清空")}</button>
          <button onClick={() => onChange([...defaultSnapKinds])}>
            {t("恢复默认")}
          </button>
        </footer>
      </section>
    </>
  );
}
