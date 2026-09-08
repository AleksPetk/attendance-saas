const { app, BrowserWindow, shell, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const { createSessionApi } = require("./sessionApi.cjs");

const isDev = !app.isPackaged;
const sessionApi = createSessionApi();

function createWindow() {
  const win = new BrowserWindow({
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
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    win.loadURL("http://127.0.0.1:5174");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
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
