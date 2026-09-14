const path = require("path");

function createStartupWindows({ BrowserWindow, mainOptions, loadMain, onFailure }) {
  const splash = new BrowserWindow({
    width: 360, height: 320, show: false, frame: false,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, skipTaskbar: true, backgroundColor: "#ffffff", title: "CheckStation",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  splash.center();
  const main = new BrowserWindow({ ...mainOptions, show: false, backgroundColor: "#ffffff" });
  let failed = false;
  let paintReady = false;
  let rendererReady = false;
  const closeSplash = () => { if (!splash.isDestroyed()) splash.destroy(); };
  const fail = (error) => {
    if (failed || main.isDestroyed()) return;
    failed = true;
    closeSplash();
    main.destroy();
    onFailure(error);
  };
  splash.once("ready-to-show", () => {
    if (!failed && !main.isVisible() && !splash.isDestroyed()) splash.show();
  });
  const reveal = () => {
    if (!paintReady || !rendererReady || failed || main.isDestroyed() || main.isVisible()) return;
    main.show();
    closeSplash();
  };
  main.webContents.on("ipc-message", (_event, channel) => {
    if (channel === "checkstation:startupReady") { rendererReady = true; reveal(); }
  });
  main.once("ready-to-show", () => {
    paintReady = true;
    reveal();
  });
  main.once("closed", closeSplash);
  main.webContents.once("render-process-gone", (_event, details) => fail(new Error(details.reason)));
  // No timers or minimum display duration: reveal as soon as Chromium can paint.
  splash.loadFile(path.join(__dirname, "startup.html")).catch(closeSplash);
  Promise.resolve().then(() => loadMain(main)).catch(fail);
  return main;
}

module.exports = { createStartupWindows };
