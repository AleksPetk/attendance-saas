/**
 * Preload stub for Electron unit tests on CI/Linux.
 *
 * `npm ci` installs the electron package metadata but often skips the platform
 * binary download (install-scripts / allowScripts). Requiring real `electron`
 * then throws. These tests exercise our IPC/auth helpers, not Electron itself.
 *
 * Loaded via: node --require ./electron/testElectronStub.cjs --test …
 */

const Module = require("node:module");
const path = require("node:path");
const os = require("node:os");

const stub = {
  app: {
    isPackaged: false,
    getPath: (name) => path.join(os.tmpdir(), "checkstation-electron-test", String(name || "userData")),
    focus: () => {},
    quit: () => {},
    on: () => {},
    whenReady: () => Promise.resolve(),
  },
  shell: {
    openExternal: async () => {},
  },
  ipcMain: {
    handle: () => {},
    on: () => {},
    removeHandler: () => {},
  },
  BrowserWindow: function BrowserWindow() {
    return {
      loadURL: async () => {},
      on: () => {},
      webContents: { on: () => {}, send: () => {} },
    };
  },
  dialog: {
    showMessageBox: async () => ({ response: 0 }),
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s) => Buffer.from(String(s)),
    decryptString: (b) => Buffer.from(b).toString("utf8"),
  },
  nativeImage: {
    createFromPath: () => ({ isEmpty: () => true }),
  },
  contextBridge: {
    exposeInMainWorld: () => {},
  },
  ipcRenderer: {
    invoke: async () => {},
    on: () => {},
  },
};

const electronEntry = (() => {
  try {
    return require.resolve("electron");
  } catch {
    return path.join(__dirname, "../../node_modules/electron/index.js");
  }
})();

Module._cache[electronEntry] = {
  id: electronEntry,
  filename: electronEntry,
  loaded: true,
  exports: stub,
};

// Intercept loads when the real electron binary is missing. Honor any
// per-test Module._cache override (e.g. productTourPrefs temp userData).
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "electron") {
    try {
      const resolved = Module._resolveFilename(request, parent, isMain);
      if (Module._cache[resolved]) {
        return Module._cache[resolved].exports;
      }
    } catch {
      /* package missing or broken — fall through to stub */
    }
    return stub;
  }
  return originalLoad.apply(this, arguments);
};
