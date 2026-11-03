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
const filters = [{ name: "PDF / Dim It", extensions: ["pdf", "planmeasure"] }];

function createWindow() {
  window = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: "#eef1f4",
    title: "Dim It · PDF 图纸工作台",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.loadFile(path.join(__dirname, "../dist/index.html"));
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin"
        ? [
            {
              label: "Dim It",
              submenu: [
                { role: "about" },
                { type: "separator" },
                { role: "quit" },
              ],
            },
          ]
        : []),
      {
        label: "文件",
        submenu: [
          {
            label: "打开 PDF / 项目",
            accelerator: "CmdOrCtrl+O",
            click: () => window.webContents.send("command", "open"),
          },
          {
            label: "保存项目",
            accelerator: "CmdOrCtrl+S",
            click: () => window.webContents.send("command", "save"),
          },
          { type: "separator" },
          { role: "close" },
        ],
      },
      {
        label: "编辑",
        submenu: [
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "帮助",
        submenu: [
          {
            label: "打开本地数据文件夹",
            click: () => shell.openPath(app.getPath("userData")),
          },
        ],
      },
    ]),
  );
}

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
