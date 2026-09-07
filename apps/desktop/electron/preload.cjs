const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("checkstationDesktop", {
  platform: process.platform,
  initSession: () => ipcRenderer.invoke("checkstation:initSession"),
  clearSession: () => ipcRenderer.invoke("checkstation:clearSession"),
  http: (req) => ipcRenderer.invoke("checkstation:http", req),
});
