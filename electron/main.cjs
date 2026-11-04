const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  shell,
} = require("electron");
const { readFile, writeFile, rename, unlink } = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

// Keep the existing recovery data when upgrading from PlanMeasure.
if (!process.argv.some((argument) => argument.startsWith("--user-data-dir"))) {
  app.setPath(
    "userData",
    path.join(
      app.getPath("appData"),
      app.isPackaged ? "PlanMeasure" : "planmeasure",
    ),
  );
}

let window;
let menuLanguage = "zh";
let shortcutState = { bindings: {}, enabled: {}, labels: {}, capturing: false };
const commandIds = new Set([
  "measure",
  "curve",
  "fill",
  "calibrate",
  "select",
  "pan",
  "prevPage",
  "nextPage",
  "fit",
  "actual",
  "zoomOut",
  "zoomIn",
  "rotateCW",
  "rotateCCW",
  "thinLines",
  "snap",
  "editNote",
  "delete",
  "undo",
  "redo",
  "open",
  "save",
  "exportPdf",
  "exportCsv",
  "shortcuts",
]);
function accelerator(chord) {
  return chord
    ?.replace(/^Mod\+/, "CmdOrCtrl+")
    .replace(/Key([A-Z])$/, "$1")
    .replace(/Digit([0-9])$/, "$1")
    .replace(/Comma$/, ",")
    .replace(/Period$/, ".")
    .replace(/Minus$/, "-")
    .replace(/Arrow(Up|Down|Left|Right)$/, "$1")
    .replace(/BracketLeft$/, "[")
    .replace(/BracketRight$/, "]")
    .replace(/Slash$/, "/")
    .replace(/Backslash$/, "\\")
    .replace(/Quote$/, "'")
    .replace(/Backquote$/, "`");
}
const filters = [{ name: "PDF / Dim It", extensions: ["pdf", "planmeasure"] }];

function createWindow() {
  const icon = path.join(__dirname, "../dist/dim-it-logo.png");
  if (process.platform === "darwin") app.dock.setIcon(icon);
  window = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: "#eef1f4",
    title: "Dim It · PDF 图纸工作台",
    icon,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("before-input-event", (_event, input) => {
    // The renderer owns workbench shortcuts. Native text and window actions keep their roles.
    const mod = process.platform === "darwin" ? input.meta : input.control;
    const nativeAction = mod && /^[acvqxwhm]$/i.test(input.key);
    window.webContents.setIgnoreMenuShortcuts(
      shortcutState.capturing || !nativeAction,
    );
  });
  window.loadFile(path.join(__dirname, "../dist/index.html"));
  updateMenu("zh");
}

function updateMenu(language = menuLanguage) {
  if (!window || window.isDestroyed()) return;
  menuLanguage = language;
  const en = language === "en";
  window.setTitle(
    en ? "Dim It · PDF Drawing Workbench" : "Dim It · PDF 图纸工作台",
  );
  const command = (id) => ({
    id,
    label: shortcutState.labels[id] || id,
    accelerator: accelerator(shortcutState.bindings[id]?.[0]),
    enabled: !shortcutState.capturing && !!shortcutState.enabled[id],
    click: () => {
      if (!window.isDestroyed()) window.webContents.send("command", id);
    },
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin"
        ? [
            {
              label: "Dim It",
              submenu: [
                { role: "about", label: en ? "About Dim It" : "关于 Dim It" },
                { type: "separator" },
                { role: "hide" },
                { role: "hideOthers" },
                { role: "unhide" },
                { type: "separator" },
                { role: "quit", label: en ? "Quit" : "退出" },
              ],
            },
          ]
        : []),
      {
        label: en ? "File" : "文件",
        submenu: [
          ...["open", "save", "exportPdf", "exportCsv"].map(command),
          { type: "separator" },
          { role: "close", label: en ? "Close window" : "关闭窗口" },
        ],
      },
      {
        label: en ? "Edit" : "编辑",
        submenu: [
          ...["undo", "redo", "editNote", "delete"].map(command),
          { type: "separator" },
          { role: "cut", label: en ? "Cut" : "剪切" },
          { role: "copy", label: en ? "Copy" : "复制" },
          { role: "paste", label: en ? "Paste" : "粘贴" },
          { role: "selectAll", label: en ? "Select all" : "全选" },
        ],
      },
      {
        label: en ? "Tools" : "工具",
        submenu: [
          "measure",
          "curve",
          "fill",
          "calibrate",
          "select",
          "pan",
          "snap",
        ].map(command),
      },
      {
        label: en ? "View" : "视图",
        submenu: [
          "prevPage",
          "nextPage",
          "fit",
          "actual",
          "zoomOut",
          "zoomIn",
          "rotateCW",
          "rotateCCW",
          "thinLines",
        ].map(command),
      },
      {
        label: en ? "Help" : "帮助",
        submenu: [
          command("shortcuts"),
          {
            label: en ? "Open local data folder" : "打开本地数据文件夹",
            click: () => shell.openPath(app.getPath("userData")),
          },
        ],
      },
    ]),
  );
}

ipcMain.on("set-language", (event, language) => {
  if (
    event.sender === window?.webContents &&
    (language === "zh" || language === "en")
  )
    updateMenu(language);
});
ipcMain.on("set-shortcuts", (event, state) => {
  if (
    event.sender !== window?.webContents ||
    !state ||
    typeof state.capturing !== "boolean"
  )
    return;
  const bindings = {},
    enabled = {},
    labels = {};
  for (const id of commandIds) {
    const keys = state.bindings?.[id],
      label = state.labels?.[id];
    if (
      !Array.isArray(keys) ||
      keys.length > 2 ||
      keys.some(
        (key) =>
          typeof key !== "string" ||
          !/^(Mod\+)?(Shift\+)?(Key[A-Z]|Digit[0-9]|F[1-9]|F1[0-2]|PageUp|PageDown|Home|End|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Delete|Plus|Minus|Comma|Period|Slash|Backslash|BracketLeft|BracketRight|Quote|Backquote|Tab)$/.test(
            key,
          ),
      ) ||
      typeof label !== "string" ||
      label.length > 120 ||
      typeof state.enabled?.[id] !== "boolean"
    )
      return;
    bindings[id] = keys;
    enabled[id] = state.enabled[id];
    labels[id] = label;
  }
  shortcutState = { bindings, enabled, labels, capturing: state.capturing };
  window.webContents.setIgnoreMenuShortcuts(true);
  updateMenu();
});
ipcMain.on("edit-text", (event, action) => {
  if (event.sender === window?.webContents && ["undo", "redo"].includes(action))
    event.sender[action]();
});

ipcMain.handle("open-file", async () => {
  const result = await dialog.showOpenDialog(window, {
    filters,
    properties: ["openFile"],
  });
  if (result.canceled) return null;
  const filePath = result.filePaths[0];
  return {
    name: path.basename(filePath),
    bytes: new Uint8Array(await readFile(filePath)),
  };
});
ipcMain.handle("save-file", async (_event, { name, bytes, extension }) => {
  if (
    !(bytes instanceof Uint8Array) ||
    !["pdf", "planmeasure", "csv"].includes(extension)
  )
    throw new Error("Invalid file data");
  const result = await dialog.showSaveDialog(window, {
    defaultPath: path.basename(name),
    filters: [{ name: extension, extensions: [extension] }],
  });
  if (result.canceled || !result.filePath) return false;
  const target = result.filePath;
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  return true;
});
app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
