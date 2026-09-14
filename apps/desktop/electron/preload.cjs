const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("checkstationDesktop", {
  platform: process.platform,
  startupReady: () => ipcRenderer.send("checkstation:startupReady"),
  initSession: () => ipcRenderer.invoke("checkstation:initSession"),
  clearSession: () => ipcRenderer.invoke("checkstation:clearSession"),
  http: (req) => ipcRenderer.invoke("checkstation:http", req),
  saveFile: (req) => ipcRenderer.invoke("checkstation:saveFile", req),
});
