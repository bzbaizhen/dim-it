import { useSyncExternalStore } from "react";
export type CommandId =
  | "measure"
  | "curve"
  | "fill"
  | "calibrate"
  | "select"
  | "pan"
  | "prevPage"
  | "nextPage"
  | "fit"
  | "actual"
  | "thinLines"
  | "zoomOut"
  | "zoomIn"
  | "rotateCW"
  | "rotateCCW"
  | "snap"
  | "editNote"
  | "delete"
  | "undo"
  | "redo"
  | "open"
  | "save"
  | "exportPdf"
  | "exportCsv"
  | "shortcuts";
export type ShortcutBindings = Record<CommandId, string[]>;
export type CommandContext = {
  hasDocument: boolean;
  busy: boolean;
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
  page: number;
  pageCount: number;
};
type Language = "zh" | "en";
type Command = {
  id: CommandId;
  group: "tools" | "view" | "edit" | "file";
  label: Record<Language, string>;
  repeatAllowed: boolean;
  enabled: (context: CommandContext) => boolean;
};
const documentReady = (c: CommandContext) => c.hasDocument && !c.busy;
const available = (c: CommandContext) => !c.busy;
const selectionReady = (c: CommandContext) =>
  documentReady(c) && c.hasSelection;
function command(
  id: CommandId,
  group: Command["group"],
  zh: string,
  en: string,
  enabled = documentReady,
  repeatAllowed = false,
): Command {
  return { id, group, label: { zh, en }, enabled, repeatAllowed };
}
export const commandRegistry: readonly Command[] = [
  command("measure", "tools", "长度测量", "Length"),
  command("curve", "tools", "曲线长度", "Curve length"),
  command("fill", "tools", "区域填色", "Region fill"),
  command("calibrate", "tools", "校准比例", "Calibrate"),
  command("select", "tools", "选择", "Select"),
  command("pan", "tools", "平移", "Pan"),
  command(
    "prevPage",
    "view",
    "上一页",
    "Previous page",
    (c) => documentReady(c) && c.page > 1,
  ),
  command(
    "nextPage",
    "view",
    "下一页",
    "Next page",
    (c) => documentReady(c) && c.page < c.pageCount,
  ),
  command("fit", "view", "适合窗口", "Fit to window"),
  command("actual", "view", "实际大小", "Actual size"),
  command("thinLines", "view", "细线显示", "Thin lines"),
  command("zoomOut", "view", "缩小", "Zoom out", documentReady, true),
  command("zoomIn", "view", "放大", "Zoom in", documentReady, true),
  command("rotateCW", "view", "顺时针旋转", "Rotate clockwise"),
  command("rotateCCW", "view", "逆时针旋转", "Rotate counterclockwise"),
  command("snap", "tools", "捕捉", "Snap"),
  command("editNote", "edit", "编辑备注", "Edit note", selectionReady),
  command(
    "delete",
    "edit",
    "删除选中标注",
    "Delete selected annotation",
    selectionReady,
  ),
  command(
    "undo",
    "edit",
    "撤销",
    "Undo",
    (c) => documentReady(c) && c.canUndo,
    true,
  ),
  command(
    "redo",
    "edit",
    "重做",
    "Redo",
    (c) => documentReady(c) && c.canRedo,
    true,
  ),
  command("open", "file", "打开 PDF / 项目", "Open PDF / project", available),
  command("save", "file", "保存项目", "Save project"),
  command("exportPdf", "file", "导出 PDF", "Export PDF"),
  command("exportCsv", "file", "导出 CSV", "Export CSV"),
  command("shortcuts", "file", "快捷键设置", "Keyboard shortcuts", available),
];
export function defaultBindings(isMac: boolean): ShortcutBindings {
  return {
    measure: ["Digit1"],
    curve: ["Digit2"],
    fill: ["Digit3"],
    calibrate: ["Digit4"],
    select: [],
    pan: [],
    prevPage: ["KeyA", "PageUp"],
    nextPage: ["KeyD", "PageDown"],
    fit: ["KeyF"],
    actual: ["KeyG"],
    thinLines: ["Tab"],
    zoomOut: ["KeyZ", "Minus"],
    zoomIn: ["KeyX", "Plus"],
    rotateCW: ["KeyR"],
    rotateCCW: ["Shift+KeyR"],
    snap: ["KeyS"],
    editNote: ["KeyE"],
    delete: ["Delete"],
    undo: ["Mod+KeyZ"],
    redo: isMac ? ["Mod+Shift+KeyZ"] : ["Mod+Shift+KeyZ", "Mod+KeyY"],
    open: ["Mod+KeyO"],
    save: ["Mod+KeyS"],
    exportPdf: ["Mod+KeyE"],
    exportCsv: ["Mod+Shift+KeyE"],
    shortcuts: ["Mod+Comma", "F1"],
  };
}
type KeyEvent = Pick<
  KeyboardEvent,
  "code" | "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "isComposing"
>;
export function chordFromEvent(event: KeyEvent, isMac: boolean): string | null {
  if (
    event.isComposing ||
    event.altKey ||
    (isMac ? event.ctrlKey : event.metaKey)
  )
    return null;
  let code = event.code;
  if (/^Numpad[0-9]$/.test(code)) {
    if (!/^[0-9]$/.test(event.key)) return null;
    code = `Digit${event.key}`;
  }
  if (code === "Equal" || code === "NumpadAdd") code = "Plus";
  if (code === "NumpadSubtract") code = "Minus";
  if (
    !/^(Key[A-Z]|Digit[0-9]|F[1-9]|F1[0-2]|PageUp|PageDown|Tab|Home|End|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Delete|Plus|Minus|Comma|Period|Slash|Backslash|BracketLeft|BracketRight|Quote|Backquote)$/.test(
      code,
    )
  )
    return null;
  return `${(isMac ? event.metaKey : event.ctrlKey) ? "Mod+" : ""}${event.shiftKey && code !== "Plus" ? "Shift+" : ""}${code}`;
}
function validChord(chord: string): boolean {
  if (chord.endsWith("Tab") && chord !== "Tab") return false;
  if (
    !/^(Mod\+)?(Shift\+)?(Key[A-Z]|Digit[0-9]|F[1-9]|F1[0-2]|PageUp|PageDown|Tab|Home|End|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Delete|Plus|Minus|Comma|Period|Slash|Backslash|BracketLeft|BracketRight|Quote|Backquote)$/.test(
      chord,
    )
  )
    return false;
  if (chord === "Shift+Plus" || chord === "Mod+Shift+Plus") return false;
  if (/^Mod\+(Shift\+)?Key[ACVQWHMX]$/.test(chord)) return false;
  return !/^(Shift\+)?F(5|11|12)$/.test(chord);
}
export function validateBinding(
  commandId: CommandId,
  chord: string,
  bindings: ShortcutBindings,
):
  | { ok: true }
  | { ok: false; reason: "reserved" | "conflict"; command?: CommandId } {
  if (!validChord(chord) || (chord === "Tab" && commandId !== "thinLines"))
    return { ok: false, reason: "reserved" };
  const conflict = commandRegistry.find(
    (command) =>
      command.id !== commandId && bindings[command.id].includes(chord),
  );
  return conflict
    ? { ok: false, reason: "conflict", command: conflict.id }
    : { ok: true };
}
export function matchCommand(
  chord: string,
  bindings: ShortcutBindings,
  context: CommandContext,
  repeat = false,
): CommandId | null {
  return (
    commandRegistry.find(
      (command) =>
        bindings[command.id].includes(chord) &&
        command.enabled(context) &&
        (!repeat || command.repeatAllowed),
    )?.id ?? null
  );
}
export function commandLabel(id: CommandId, language: Language): string {
  return commandRegistry.find((command) => command.id === id)!.label[language];
}
export function shortcutLabel(
  chord: string,
  isMac: boolean,
  _language: Language,
): string {
  return chord
    .split("+")
    .map((part) =>
      part === "Mod"
        ? isMac
          ? "⌘"
          : "Ctrl"
        : part === "Shift"
          ? isMac
            ? "⇧"
            : "Shift"
          : part === "Plus"
            ? "+"
            : part === "Minus"
              ? "−"
              : part === "Comma"
                ? ","
                : part.replace(/^Key|^Digit/, ""),
    )
    .join(isMac ? "" : "+");
}
export function parseShortcutOverrides(
  raw: string,
  isMac: boolean,
): ShortcutBindings {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Invalid shortcut preferences");
  const defaults = defaultBindings(isMac);
  for (const [id, value] of Object.entries(parsed)) {
    if (
      !Object.hasOwn(defaults, id) ||
      !Array.isArray(value) ||
      value.length > 2 ||
      value.some(
        (chord) =>
          typeof chord !== "string" ||
          !validChord(chord) ||
          (chord === "Tab" && id !== "thinLines"),
      ) ||
      new Set(value).size !== value.length
    )
      throw new Error("Invalid shortcut preferences");
    defaults[id as CommandId] = value;
  }
  const seen = new Set<string>();
  for (const chords of Object.values(defaults)) {
    for (const chord of chords) {
      if (seen.has(chord)) throw new Error("Conflicting shortcut preferences");
      seen.add(chord);
    }
  }
  return defaults;
}
export const shortcutStorageKey = "planmeasure.shortcuts.v1";
type Snapshot = {
  bindings: ShortcutBindings;
  warning: "storage" | "corrupt" | null;
};
const stores = new Map<
  boolean,
  { snapshot: Snapshot; listeners: Set<() => void> }
>();
function getStore(isMac: boolean) {
  let store = stores.get(isMac);
  if (!store) {
    const snapshot: Snapshot = {
      bindings: defaultBindings(isMac),
      warning: null,
    };
    try {
      const raw = window.localStorage.getItem(shortcutStorageKey);
      if (raw !== null) {
        try {
          snapshot.bindings = parseShortcutOverrides(raw, isMac);
        } catch {
          snapshot.warning = "corrupt";
        }
      }
    } catch {
      snapshot.warning = "storage";
    }
    store = { snapshot, listeners: new Set() };
    stores.set(isMac, store);
  }
  return store;
}
export function useShortcuts(isMac: boolean, language: Language) {
  const store = getStore(isMac);
  const snapshot = useSyncExternalStore(
    (listener) => {
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    () => store.snapshot,
  );
  function change(bindings: ShortcutBindings) {
    const validated = parseShortcutOverrides(JSON.stringify(bindings), isMac);
    let warning = store.snapshot.warning;
    const defaults = defaultBindings(isMac);
    const overrides = Object.fromEntries(
      commandRegistry
        .filter(
          ({ id }) =>
            JSON.stringify(validated[id]) !== JSON.stringify(defaults[id]),
        )
        .map(({ id }) => [id, validated[id]]),
    );
    try {
      window.localStorage.setItem(
        shortcutStorageKey,
        JSON.stringify(overrides),
      );
      warning = null;
    } catch {
      warning = "storage";
    }
    store.snapshot = { bindings: validated, warning };
    for (const listener of store.listeners) listener();
  }
  const warning =
    snapshot.warning === "corrupt"
      ? language === "zh"
        ? "快捷键偏好已损坏，已使用默认设置。原记录保留至你修改绑定或确认恢复默认。"
        : "Shortcut preferences are damaged. Defaults are active. The original record is preserved until you edit a binding or confirm a reset."
      : snapshot.warning === "storage"
        ? language === "zh"
          ? "快捷键偏好保存不可用，本次修改仍在当前会话生效。"
          : "Shortcut storage is unavailable. Changes still apply in this session."
        : null;
  return {
    bindings: snapshot.bindings,
    warning,
    change,
    hint: (id: CommandId) =>
      snapshot.bindings[id]
        .map((chord) => shortcutLabel(chord, isMac, language))
        .join(" / "),
  };
}
