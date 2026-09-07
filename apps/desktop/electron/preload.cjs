const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("checkstationDesktop", {
  platform: process.platform,
});
