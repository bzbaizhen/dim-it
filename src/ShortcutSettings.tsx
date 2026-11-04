import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLanguage } from "./i18n.ts";
import {
  chordFromEvent,
  commandLabel,
  commandRegistry,
  defaultBindings,
  shortcutLabel,
  validateBinding,
  type CommandId,
  type ShortcutBindings,
} from "./shortcuts.ts";
import "./shortcuts.css";

type Props = {
  bindings: ShortcutBindings;
  onChange: (bindings: ShortcutBindings) => void;
  onClose: () => void;
  onCaptureChange: (capturing: boolean) => void;
  isMac: boolean;
  warning?: string | null;
};
export default function ShortcutSettings({
  bindings,
  onChange,
  onClose,
  onCaptureChange,
  isMac,
  warning,
}: Props) {
  const language = useLanguage();
  const en = language === "en";
  const [capture, setCapture] = useState<{
    id: CommandId;
    index: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef(document.activeElement);
  const captureCallback = useRef(onCaptureChange);
  captureCallback.current = onCaptureChange;
  useEffect(() => {
    close.current?.focus();
    function cancelCapture() {
      setCapture(null);
      setError("");
      captureCallback.current(false);
    }
    window.addEventListener("blur", cancelCapture);
    return () => {
      window.removeEventListener("blur", cancelCapture);
      captureCallback.current(false);
      if (
        previousFocus.current instanceof HTMLElement &&
        previousFocus.current.isConnected
      )
        previousFocus.current.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    captureCallback.current(!!capture);
  }, [capture]);
  function keydown(event: KeyboardEvent<HTMLElement>) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      if (capture) {
        setCapture(null);
        setError("");
      } else if (confirmReset) setConfirmReset(false);
      else onClose();
      return;
    }
    if (event.key === "Tab") {
      const elements = dialog.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input, select, [tabindex='0']",
      );
      const first = elements?.[0],
        last = elements?.[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
      return;
    }
    if (!capture) return;
    event.preventDefault();
    if (
      event.repeat ||
      /^(Control|Meta|Shift|Alt)(Left|Right)$/.test(event.code)
    )
      return;
    const chord = chordFromEvent(event.nativeEvent, isMac);
    const result = chord
      ? validateBinding(capture.id, chord, bindings)
      : { ok: false as const, reason: "reserved" as const };
    if (!result.ok) {
      setError(
        result.reason === "conflict" && result.command
          ? en
            ? `Already assigned to ${commandLabel(result.command, language)}. Clear that binding first.`
            : `已分配给“${commandLabel(result.command, language)}”，请先清除该绑定。`
          : en
            ? "This key is reserved for the system, typing, or a fixed interaction."
            : "此按键已保留给系统、文本编辑或固定交互。",
      );
      return;
    }
    const next = [...bindings[capture.id]];
    if (next.includes(chord!)) {
      setCapture(null);
      setError("");
      return;
    }
    next[capture.index] = chord!;
    onChange({ ...bindings, [capture.id]: next });
    setCapture(null);
    setError("");
  }
  const groups = [
    ["tools", en ? "Tools" : "工具"],
    ["view", en ? "View" : "视图"],
    ["edit", en ? "Edit" : "编辑"],
    ["file", en ? "File and settings" : "文件与设置"],
  ];
  return (
    <div className="modal-backdrop shortcuts-backdrop">
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        aria-describedby="shortcuts-description"
        className="modal shortcuts-modal"
        onKeyDown={keydown}
      >
        <header className="shortcuts-header">
          <h2 id="shortcuts-title">
            {en ? "Keyboard shortcuts" : "快捷键设置"}
          </h2>
          <button ref={close} title={en ? "Close" : "关闭"} onClick={onClose}>
            {en ? "Close" : "关闭"}
            {!capture && !confirmReset && (
              <kbd className="button-shortcut" aria-hidden="true">
                Esc
              </kbd>
            )}
          </button>
        </header>
        <p id="shortcuts-description">
          {en
            ? "Choose a binding and press a key. Up to two bindings per action. Escape cancels capture. Alt free pick and Space pan remain fixed. Tab toggles thin lines on the canvas and moves focus in dialogs."
            : "点击绑定后按下快捷键，每项最多两个绑定。Escape 取消录入。Alt 自由落点与空格平移为固定交互。Tab 在画布切换细线显示，在弹窗切换焦点。"}
        </p>
        {warning && (
          <p role="alert" className="shortcuts-warning">
            {warning}
          </p>
        )}
        <div role="status" aria-live="polite" className="shortcuts-status">
          {capture
            ? en
              ? `Press a key for ${commandLabel(capture.id, language)}. Escape cancels.`
              : `请为“${commandLabel(capture.id, language)}”按下快捷键，Escape 取消。`
            : ""}
        </div>
        {error && (
          <p role="alert" className="shortcuts-warning">
            {error}
          </p>
        )}
        <div className="shortcuts-list">
          {groups.map(([group, title]) => (
            <section key={group} aria-label={title}>
              <h3>{title}</h3>
              {commandRegistry
                .filter((command) => command.group === group)
                .map((command) => (
                  <div className="shortcut-row" key={command.id}>
                    <span>{command.label[language]}</span>
                    <div className="shortcut-bindings">
                      {[0, 1].map((index) => {
                        const chord = bindings[command.id][index];
                        const capturing =
                          capture?.id === command.id && capture.index === index;
                        return (
                          <div className="shortcut-binding" key={index}>
                            <button
                              className={
                                capturing
                                  ? "shortcut-key capturing"
                                  : "shortcut-key"
                              }
                              aria-pressed={capturing}
                              aria-label={`${command.label[language]} ${en ? "binding" : "绑定"} ${index + 1}`}
                              onClick={() => {
                                setCapture({
                                  id: command.id,
                                  index: Math.min(
                                    index,
                                    bindings[command.id].length,
                                  ),
                                });
                                setError("");
                                setConfirmReset(false);
                              }}
                            >
                              {capturing
                                ? en
                                  ? "Press key…"
                                  : "请按键…"
                                : chord
                                  ? shortcutLabel(chord, isMac, language)
                                  : en
                                    ? "Unassigned"
                                    : "未绑定"}
                            </button>
                            {chord && (
                              <button
                                className="shortcut-clear"
                                aria-label={`${en ? "Clear" : "清除"} ${command.label[language]} ${index + 1}`}
                                onClick={() => {
                                  onChange({
                                    ...bindings,
                                    [command.id]: bindings[command.id].filter(
                                      (_, i) => i !== index,
                                    ),
                                  });
                                  setCapture(null);
                                  setError("");
                                }}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </section>
          ))}
        </div>
        <footer className="shortcuts-footer">
          {confirmReset ? (
            <>
              <span>
                {en ? "Restore all default bindings?" : "恢复全部默认快捷键？"}
              </span>
              <button
                onClick={() => {
                  onChange(defaultBindings(isMac));
                  setConfirmReset(false);
                  setCapture(null);
                  setError("");
                }}
              >
                {en ? "Confirm reset" : "确认恢复"}
              </button>
              <button
                title={en ? "Cancel (Esc)" : "取消 (Esc)"}
                onClick={() => setConfirmReset(false)}
              >
                {en ? "Cancel" : "取消"}
                <kbd className="button-shortcut" aria-hidden="true">
                  Esc
                </kbd>
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setCapture(null);
                setConfirmReset(true);
                setError("");
              }}
            >
              {en ? "Restore defaults" : "恢复默认"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
