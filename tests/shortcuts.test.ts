import assert from "node:assert/strict";
import test from "node:test";
import {
  chordFromEvent,
  commandRegistry,
  defaultBindings,
  matchCommand,
  parseShortcutOverrides,
  shortcutLabel,
  validateBinding,
  type CommandContext,
} from "../src/shortcuts.ts";
const context: CommandContext = {
  hasDocument: true,
  busy: false,
  hasSelection: true,
  canUndo: true,
  canRedo: true,
  page: 2,
  pageCount: 3,
};
function key(code: string, extra = {}) {
  return {
    code,
    key: code,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    isComposing: false,
    ...extra,
  };
}
test("defaults are independent, valid, conflict-free and platform aware", () => {
  for (const mac of [true, false]) {
    const bindings = defaultBindings(mac);
    assert.deepEqual(
      parseShortcutOverrides(JSON.stringify(bindings), mac),
      bindings,
    );
    assert.equal(commandRegistry.length, 25);
    assert.ok(Object.values(bindings).every((chords) => chords.length <= 2));
    assert.deepEqual(bindings.measure, ["Digit1"]);
    assert.deepEqual(bindings.select, []);
    assert.equal(bindings.redo.includes("Mod+KeyY"), !mac);
  }
  const bindings = defaultBindings(true);
  bindings.measure.length = 0;
  assert.deepEqual(defaultBindings(true).measure, ["Digit1"]);
});
test("normalizes physical codes, Mod, plus/minus and numeric keypad", () => {
  assert.equal(chordFromEvent(key("Digit1"), true), "Digit1");
  assert.equal(
    chordFromEvent(key("KeyS", { metaKey: true }), true),
    "Mod+KeyS",
  );
  assert.equal(
    chordFromEvent(key("KeyS", { ctrlKey: true }), false),
    "Mod+KeyS",
  );
  assert.equal(
    chordFromEvent(key("KeyR", { shiftKey: true }), true),
    "Shift+KeyR",
  );
  for (const code of ["Equal", "NumpadAdd"])
    assert.equal(chordFromEvent(key(code, { shiftKey: true }), true), "Plus");
  assert.equal(chordFromEvent(key("NumpadSubtract"), true), "Minus");
  assert.equal(chordFromEvent(key("Numpad1", { key: "1" }), true), "Digit1");
  assert.equal(chordFromEvent(key("Numpad1", { key: "End" }), true), null);
  for (const code of ["Escape", "Enter", "Backspace", "Space", "ShiftLeft"])
    assert.equal(chordFromEvent(key(code), true), null);
  assert.equal(chordFromEvent(key("KeyA", { altKey: true }), true), null);
  assert.equal(chordFromEvent(key("KeyA", { isComposing: true }), true), null);
  assert.equal(chordFromEvent(key("KeyA", { ctrlKey: true }), true), null);
});
test("rejects reserved and conflicting chords and allows clearing/rebinding", () => {
  const bindings = defaultBindings(true);
  assert.deepEqual(validateBinding("select", "Digit1", bindings), {
    ok: false,
    reason: "conflict",
    command: "measure",
  });
  for (const chord of [
    "Alt+KeyA",
    "Escape",
    "Mod+KeyC",
    "Mod+KeyV",
    "Mod+KeyQ",
    "F5",
    "Shift+Plus",
    "garbage",
  ])
    assert.equal(validateBinding("select", chord, bindings).ok, false);
  assert.equal(validateBinding("select", "KeyV", bindings).ok, true);
  assert.equal(validateBinding("select", "Mod+KeyK", bindings).ok, true);
  assert.equal(validateBinding("select", "Mod+Digit1", bindings).ok, true);
  assert.deepEqual(
    parseShortcutOverrides('{"measure":[],"select":["Digit1"]}', true).select,
    ["Digit1"],
  );
});
test("persisted data trust boundary rejects malformed, duplicate and excessive bindings", () => {
  for (const raw of [
    "null",
    "[]",
    "bad",
    '{"missing":[]}',
    '{"__proto__":[]}',
    '{"measure":["KeyQ","KeyW","KeyT"]}',
    '{"measure":["KeyQ","KeyQ"]}',
    '{"measure":["Digit2"]}',
    '{"measure":["Space"]}',
  ])
    assert.throws(() => parseShortcutOverrides(raw, true));
  assert.deepEqual(parseShortcutOverrides("{}", true), defaultBindings(true));
});
test("matching respects document state, bounds, selected annotation and repeat policy", () => {
  const bindings = defaultBindings(false);
  assert.equal(matchCommand("Digit1", bindings, context), "measure");
  assert.equal(matchCommand("Digit1", bindings, context, true), null);
  assert.equal(matchCommand("KeyX", bindings, context, true), "zoomIn");
  assert.equal(matchCommand("Mod+KeyZ", bindings, context, true), "undo");
  assert.equal(matchCommand("KeyA", bindings, context, true), null);
  assert.equal(matchCommand("KeyA", bindings, { ...context, page: 1 }), null);
  assert.equal(matchCommand("KeyD", bindings, { ...context, page: 3 }), null);
  assert.equal(
    matchCommand("Delete", bindings, { ...context, hasSelection: false }),
    null,
  );
  assert.equal(
    matchCommand("Mod+KeyZ", bindings, { ...context, canUndo: false }),
    null,
  );
  assert.equal(
    matchCommand("Digit1", bindings, { ...context, hasDocument: false }),
    null,
  );
  assert.equal(
    matchCommand("Mod+KeyO", bindings, { ...context, hasDocument: false }),
    "open",
  );
  assert.equal(matchCommand("F1", bindings, { ...context, busy: true }), null);
});
test("platform labels preserve readable primary and secondary chords", () => {
  assert.equal(shortcutLabel("Mod+Shift+KeyZ", true, "zh"), "⌘⇧Z");
  assert.equal(shortcutLabel("Mod+Shift+KeyZ", false, "en"), "Ctrl+Shift+Z");
  assert.equal(shortcutLabel("Plus", false, "en"), "+");
});

test("Tab is the protected thin-lines default across platforms", () => {
  for (const isMac of [true, false]) {
    const bindings = defaultBindings(isMac);
    assert.deepEqual(bindings.thinLines, ["Tab"]);
    assert.equal(chordFromEvent(key("Tab"), isMac), "Tab");
    assert.equal(validateBinding("thinLines", "Tab", bindings).ok, true);
    assert.deepEqual(validateBinding("select", "Tab", bindings), {
      ok: false,
      reason: "reserved",
    });
    assert.equal(validateBinding("thinLines", "Mod+Tab", bindings).ok, false);
    assert.equal(validateBinding("thinLines", "Shift+Tab", bindings).ok, false);
    assert.equal(matchCommand("Tab", bindings, context), "thinLines");
    assert.equal(matchCommand("Tab", bindings, context, true), null);
    assert.throws(() =>
      parseShortcutOverrides('{"thinLines":[],"select":["Tab"]}', isMac),
    );
    assert.deepEqual(
      parseShortcutOverrides('{"thinLines":["KeyT"]}', isMac).thinLines,
      ["KeyT"],
    );
  }
});
