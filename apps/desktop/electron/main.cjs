const { app, BrowserWindow, shell, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const { createSessionApi } = require("./sessionApi.cjs");
const { createStartupWindows } = require("./startup.cjs");

const isDev = !app.isPackaged;
const sessionApi = createSessionApi();

function createWindow() {
  const win = createStartupWindows({ BrowserWindow, mainOptions: {
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "CheckStation",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  }, loadMain: (window) => isDev
    ? window.loadURL("http://127.0.0.1:5174")
    : window.loadFile(path.join(__dirname, "../dist/index.html")),
  onFailure: () => dialog.showErrorBox("CheckStation", "CheckStation couldn’t start. Please quit and reopen the app."),
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

}

app.whenReady().then(() => {
  ipcMain.handle("checkstation:initSession", () => sessionApi.initSession());
  ipcMain.handle("checkstation:clearSession", () => sessionApi.clearSession());
  ipcMain.handle("checkstation:http", (_event, req) => sessionApi.http(req || {}));
  ipcMain.handle("checkstation:saveFile", async (_event, request) => {
    const result = await dialog.showSaveDialog({
      defaultPath: String(request?.defaultPath || "checkstation-export"),
    });
    if (result.canceled || !result.filePath) return { saved: false };
    await fs.promises.writeFile(result.filePath, Buffer.from(String(request?.base64 || ""), "base64"));
    return { saved: true, path: result.filePath };
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
