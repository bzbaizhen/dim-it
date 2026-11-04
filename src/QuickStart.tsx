import { commandLabel, type CommandId } from "./shortcuts.ts";
import { t, useLanguage, setLanguage } from "./i18n.ts";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  FolderOpen,
  Magnet,
  Ruler,
  Save,
} from "lucide-react";

const preferenceKey = "planmeasure.quickStartOnLaunch";

export function shouldShowQuickStart(): boolean {
  try {
    return window.localStorage.getItem(preferenceKey) !== "hide";
  } catch {
    return true;
  }
}

const stepCommands: CommandId[][] = [
  ["open", "prevPage", "nextPage", "thinLines"],
  ["calibrate"],
  ["measure", "curve", "fill"],
  ["snap"],
  [],
  ["save", "exportPdf"],
];
const steps = [
  {
    title: "打开与浏览图纸",
    icon: FolderOpen,
    items: [
      "点击「打开图纸」或拖入 PDF，也能打开已保存的项目。",
      "左侧切换页面，右下角可旋转图纸或适合页面。",
      "空格拖动平移，Cmd / Ctrl + 滚轮缩放。",
    ],
  },
  {
    title: "两点校准比例",
    icon: Crosshair,
    items: [
      "选取有明确尺寸的两个端点，输入实际长度。",
      "选好单位再填数值，英尺英寸可填 8' 6\"。",
      "每页分别校准，重新校准会重算该页测量。",
    ],
  },
  {
    title: "测量、单位与标注",
    icon: Ruler,
    items: [
      "点击「长度测量」连续选两点，右侧切换单位并自动换算。",
      "曲线可整段测量，区域填色可拖动矩形或逐点绘制多边形。",
      "选中标注可改备注、颜色，Delete 删除，撤销可恢复。",
    ],
  },
  {
    title: "端点、中点与交点捕捉",
    icon: Magnet,
    items: [
      "接近端点、中点或交点，会出现绿色标记和类型。",
      "点击采用高亮点的精确坐标，扫描图片可手动选点。",
      "工具栏「捕捉」可开关，按住 Alt 临时自由选点。",
    ],
  },
  {
    title: "Shift 智慧轨迹",
    icon: Crosshair,
    items: [
      "先选起点，按住 Shift，悬停捕捉点约 350 ms。",
      "紫色虚线帮助对齐，菱形标出最终正交落点。",
      "点击确认，Esc 取消。本段最多保留 4 个参考点。",
    ],
  },
  {
    title: "保存项目与导出",
    icon: Save,
    items: [
      "「保存项目」保留原 PDF、比例和可编辑标注。",
      "「导出」生成标注 PDF，或尺寸与备注的 CSV 清单。",
      "自动恢复保留最近一份工作，换图纸前请保存项目。",
    ],
  },
];

function Illustration({ step }: { step: number }) {
  return (
    <svg
      className="guide-art"
      viewBox="0 0 420 150"
      role="img"
      aria-label={t`${t(steps[step].title)}操作示意`}
    >
      <rect
        x="24"
        y="6"
        width="372"
        height="138"
        rx="7"
        className="guide-paper"
      />
      {step === 0 && (
        <g>
          <rect
            x="49"
            y="25"
            width="35"
            height="44"
            rx="2"
            className="guide-page-small"
          />
          <rect
            x="49"
            y="80"
            width="35"
            height="44"
            rx="2"
            className="guide-page-small"
          />
          <path
            d="M122 32 H337 V117 H122 Z M239 32 V117 M239 74 H337"
            className="guide-plan"
          />
          <path d="M146 32 H183 M267 32 H307" className="guide-window" />
          <text x="175" y="80">
            PDF
          </text>
          <text x="280" y="101" className="guide-caption">
            {t("多页图纸")}
          </text>
        </g>
      )}
      {step === 1 && (
        <g>
          <path
            d="M100 111 V45 M320 111 V45 M100 78 H320"
            className="guide-plan"
          />
          <circle cx="100" cy="78" r="5" className="guide-blue-point" />
          <circle cx="320" cy="78" r="5" className="guide-blue-point" />
          <text x="210" y="59" textAnchor="middle" className="guide-value">
            6,000 mm
          </text>
          <text x="100" y="128" textAnchor="middle" className="guide-caption">
            {t("第一点")}
          </text>
          <text x="320" y="128" textAnchor="middle" className="guide-caption">
            {t("第二点")}
          </text>
        </g>
      )}
      {step === 2 && (
        <g>
          <path
            d="M103 28 H317 V118 H103 Z M245 28 V118"
            className="guide-plan"
          />
          <path
            d="M103 101 H245 M103 96 V106 M245 96 V106"
            className="guide-dimension"
          />
          <rect
            x="133"
            y="73"
            width="82"
            height="23"
            rx="4"
            className="guide-label-box"
          />
          <text x="174" y="89" textAnchor="middle" className="guide-blue-text">
            2,400 mm
          </text>
          <text x="280" y="78" textAnchor="middle" className="guide-caption">
            {t("尺寸标注")}
          </text>
        </g>
      )}
      {step === 3 && (
        <g>
          <path d="M80 80 H340 M315 27 V111" className="guide-plan" />
          <rect
            x="75"
            y="75"
            width="10"
            height="10"
            className="guide-snap-shape"
          />
          <path
            d="M210 73 L203.5 85 H216.5 Z M310 75 l10 10 M310 85 l10 -10"
            className="guide-snap-shape"
          />
          <text x="80" y="128" textAnchor="middle" className="guide-green-text">
            {t("端点")}
          </text>
          <text
            x="210"
            y="128"
            textAnchor="middle"
            className="guide-green-text"
          >
            {t("中点")}
          </text>
          <text
            x="315"
            y="128"
            textAnchor="middle"
            className="guide-green-text"
          >
            {t("交点")}
          </text>
        </g>
      )}
      {step === 4 && (
        <g>
          <path d="M100 108 H310" className="guide-dimension" />
          <path d="M310 37 V108" className="guide-track" />
          <circle cx="100" cy="108" r="4" className="guide-blue-point" />
          <circle cx="310" cy="37" r="5" className="guide-track-point" />
          <path d="M310 101 l7 7 -7 7 -7 -7 Z" className="guide-track-point" />
          <text x="100" y="132" textAnchor="middle" className="guide-caption">
            {t("起点")}
          </text>
          <text
            x="310"
            y="25"
            textAnchor="middle"
            className="guide-purple-text"
          >
            {t("参考点")}
          </text>
          <text
            x="310"
            y="134"
            textAnchor="middle"
            className="guide-purple-text"
          >
            {t("正交落点")}
          </text>
        </g>
      )}
      {step === 5 && (
        <g>
          {[
            [".planmeasure", t("继续编辑")],
            [".pdf", t("查看与打印")],
            [".csv", t("尺寸与备注")],
          ].map(([extension, label], index) => (
            <g key={extension} transform={`translate(${55 + index * 107},26)`}>
              <rect width="96" height="98" rx="5" className="guide-file" />
              <text
                x="48"
                y="44"
                textAnchor="middle"
                className={
                  index === 0 ? "guide-file-project" : "guide-file-extension"
                }
              >
                {extension}
              </text>
              <text x="48" y="75" textAnchor="middle" className="guide-caption">
                {t(label)}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

export default function QuickStart({
  onClose,
  shortcutHint,
}: {
  onClose: () => void;
  shortcutHint: (id: CommandId) => string;
}) {
  const language = useLanguage();
  const [step, setStep] = useState(0);
  const [hideOnLaunch, setHideOnLaunch] = useState(
    () => !shouldShowQuickStart(),
  );
  const [preferenceError, setPreferenceError] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef(window.document.activeElement);

  useEffect(() => {
    primary.current?.focus();
    return () => {
      if (
        previousFocus.current instanceof HTMLElement &&
        previousFocus.current.isConnected
      )
        previousFocus.current.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    body.current?.scrollTo(0, 0);
  }, [step]);

  function keydown(event: KeyboardEvent<HTMLElement>) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
    if (
      (event.key === "ArrowRight" || event.key === "ArrowLeft") &&
      !(event.target instanceof HTMLInputElement) &&
      !(event.target instanceof HTMLSelectElement)
    ) {
      event.preventDefault();
      setStep((value) =>
        Math.max(
          0,
          Math.min(
            steps.length - 1,
            value + (event.key === "ArrowRight" ? 1 : -1),
          ),
        ),
      );
    }
    if (event.key === "Tab") {
      const elements = dialog.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input, select",
      );
      const first = elements?.[0],
        last = elements?.[elements.length - 1];
      if (event.shiftKey && window.document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && window.document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  return (
    <div className="modal-backdrop quick-start-backdrop">
      <section
        ref={dialog}
        className="modal quick-start"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-start-title"
        aria-describedby="quick-start-caption"
        onKeyDown={keydown}
      >
        <header className="quick-start-header">
          <div>
            <h2 id="quick-start-title">{t("快速上手")}</h2>
            <p id="quick-start-caption">
              {t("6 步了解核心功能，随时可以跳过。")}
            </p>
          </div>
          <select
            className="language-select"
            aria-label="Language / 语言"
            value={language}
            onChange={(event) => {
              if (!setLanguage(event.target.value as "zh" | "en"))
                setPreferenceError(true);
            }}
          >
            <option value="zh">简体中文</option>
            <option value="en">English</option>
          </select>
          <button
            className="guide-skip"
            title={`${t("跳过说明")} (Esc)`}
            onClick={onClose}
          >
            {t("跳过说明")}
            <kbd className="button-shortcut" aria-hidden="true">
              Esc
            </kbd>
          </button>
        </header>
        <div
          className="guide-progress"
          role="progressbar"
          aria-label={t("使用说明进度")}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={step + 1}
        >
          <span style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>
        <div ref={body} className="quick-start-body">
          <nav className="guide-topics" aria-label={t("使用说明章节")}>
            {steps.map((item, index) => (
              <button
                key={t(item.title)}
                aria-label={t`第 ${index + 1} 步 ${t(item.title)}`}
                aria-current={index === step ? "step" : undefined}
                className={step === index ? "active" : ""}
                onClick={() => setStep(index)}
              >
                <item.icon size={16} />
                <span>{t(item.title)}</span>
                {index < step && <Check size={12} />}
              </button>
            ))}
          </nav>
          <div
            className="guide-content"
            data-testid="guide-content"
            data-step={step + 1}
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="guide-content-heading">
              <h3>{t(steps[step].title)}</h3>
              <small>
                {step + 1} / {steps.length}
              </small>
            </div>
            <Illustration step={step} />
            <ul>
              {steps[step].items.map((item) => (
                <li key={item}>{t(item)}</li>
              ))}
            </ul>
            <div className="guide-shortcuts">
              {stepCommands[step].map((id) => (
                <kbd key={id}>
                  {commandLabel(id, language)} {shortcutHint(id) || t("未绑定")}
                </kbd>
              ))}
              {step === 4 && <kbd>{t("Shift 正交追踪")} · Alt</kbd>}
            </div>
          </div>
        </div>
        <footer className="quick-start-footer">
          <label className="guide-preference">
            <input
              type="checkbox"
              checked={hideOnLaunch}
              onChange={(event) => {
                try {
                  window.localStorage.setItem(
                    preferenceKey,
                    event.target.checked ? "hide" : "show",
                  );
                  setHideOnLaunch(event.target.checked);
                  setPreferenceError(false);
                } catch {
                  setPreferenceError(true);
                }
              }}
            />
            {t("下次不再显示")}
          </label>
          <div className="guide-actions">
            <button
              title={`${t("上一步")} (←)`}
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              disabled={step === 0}
            >
              <ChevronLeft size={15} />
              {t("上一步")}
              <kbd className="button-shortcut" aria-hidden="true">
                ←
              </kbd>
            </button>
            <button
              ref={primary}
              title={
                step === steps.length - 1 ? t("开始使用") : `${t("下一步")} (→)`
              }
              className="primary"
              onClick={() => {
                if (step === steps.length - 1) onClose();
                else setStep((value) => Math.min(steps.length - 1, value + 1));
              }}
            >
              {step === steps.length - 1 ? (
                <>
                  {t("开始使用")}
                  <Check size={15} />
                </>
              ) : (
                <>
                  {t("下一步")}
                  <kbd className="button-shortcut" aria-hidden="true">
                    →
                  </kbd>
                  <ChevronRight size={15} />
                </>
              )}
            </button>
          </div>
        </footer>
        {preferenceError && (
          <p className="guide-preference-error" role="alert">
            {t("启动偏好保存失败，可以跳过说明后继续使用。")}
          </p>
        )}
      </section>
    </div>
  );
}
