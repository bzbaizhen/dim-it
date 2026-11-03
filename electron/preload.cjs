const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  setLanguage: (language) => ipcRenderer.send("set-language", language),
  openFile: () => ipcRenderer.invoke("open-file"),
  saveFile: (data) => ipcRenderer.invoke("save-file", data),
  onCommand: (callback) => {
    const handler = (_event, command) => callback(command);
    ipcRenderer.on("command", handler);
    return () => ipcRenderer.removeListener("command", handler);
  },
});
