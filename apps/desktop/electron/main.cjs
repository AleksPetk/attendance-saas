const { app, BrowserWindow, shell, ipcMain, dialog, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

/**
 * Load untracked desktop .env into process.env for the main process
 * (Vite already loads it for the renderer). Does not override existing env.
 * Used for GOOGLE_DESKTOP_OAUTH_CLIENT_ID / GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET
 * and VITE_API_BASE_URL. Never logs secret values.
 *
 * Search order:
 * 1. apps/desktop/.env (dev / unpackaged)
 * 2. process.resourcesPath/.env (packaged extraResource for local Finder builds)
 */
function loadDesktopDotEnv() {
  const candidates = [
    path.join(__dirname, "../.env"),
  ];
  if (typeof process.resourcesPath === "string" && process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, ".env"));
  }
  let raw = null;
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    try {
      raw = fs.readFileSync(envPath, "utf8");
      break;
    } catch {
      /* try next */
    }
  }
  if (!raw) return;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    process.env[key] = value;
  }
}

loadDesktopDotEnv();

const { createSessionApi } = require("./sessionApi.cjs");
const { createStartupWindows } = require("./startup.cjs");
const {
  requestGoogleIdentityToken,
  isGoogleDesktopOAuthConfigured,
} = require("./googleOAuth.cjs");
const { requestAppleWebOAuth } = require("./appleOAuth.cjs");
const { requestAppleNativeIdentity } = require("./appleNativeAuth.cjs");
const {
  prepareDesktopBillingReturn,
  openBillingUrlAndWait,
} = require("./stripeBrowser.cjs");
const {
  loadStoreKitProducts,
  purchaseStoreKitSubscription,
  restoreStoreKitPurchases,
  openAppleManageSubscriptions,
} = require("./storeKitBridge.cjs");
const { getDesktopDistributionInfo } = require("./desktopDistribution.cjs");
const crypto = require("crypto");

const isDev = !app.isPackaged;
const sessionApi = createSessionApi();
const desktopDistributionInfo = getDesktopDistributionInfo();

/** Existing main BrowserWindow — never create a second window for OAuth return. */
let mainWindow = null;

/** Pending Stripe/billing loopback servers keyed by prepare id. */
const pendingBillingReturns = new Map();

/**
 * Restore/show/focus the existing main window (same helper Google OAuth uses).
 * Loopback return pages often reclaim focus while they load/close, so we also
 * re-steal shortly after — Apple/Stripe return immediately, unlike Google's
 * delayed token-exchange focus.
 */
function bringCheckStationToForeground() {
  const focusOnce = () => {
    const win = mainWindow && !mainWindow.isDestroyed()
      ? mainWindow
      : BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (!win) return;
    if (typeof win.isMinimized === "function" && win.isMinimized()) {
      win.restore();
    }
    win.show();
    win.focus();
    if (typeof win.moveTop === "function") {
      win.moveTop();
    }
    // macOS: steal focus from the system browser after OAuth/billing completes.
    if (process.platform === "darwin" && typeof app.focus === "function") {
      try {
        app.focus({ steal: true });
      } catch {
        app.focus();
      }
    }
  };
  focusOnce();
  setTimeout(focusOnce, 80);
  setTimeout(focusOnce, 320);
}

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

  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

}

app.whenReady().then(() => {
  // MAS: reinforce dock/process icon from bundled icns so native Apple SIWA
  // sheet branding matches the host app (Electron does not always propagate
  // CFBundleIconFile into NSApp.applicationIconImage).
  if (
    process.platform === "darwin"
    && desktopDistributionInfo.distribution === "mas"
    && app.isPackaged
  ) {
    try {
      const { nativeImage } = require("electron");
      const iconPath = path.join(process.resourcesPath, "icon.icns");
      const image = nativeImage.createFromPath(iconPath);
      if (!image.isEmpty() && app.dock && typeof app.dock.setIcon === "function") {
        app.dock.setIcon(image);
      }
    } catch {
      /* best-effort branding only */
    }
  }

  const { readProductTourPrefs, writeProductTourPrefs } = require("./productTourPrefs.cjs");
  const { createKioskExitCredentialStore } = require("./kioskExitCredentialStore.cjs");
  const kioskExitCredentialStore = createKioskExitCredentialStore({
    rootDir: app.getPath("userData"),
    safeStorage,
  });

  ipcMain.handle("checkstation:initSession", () => sessionApi.initSession());
  ipcMain.handle("checkstation:clearSession", () => sessionApi.clearSession());
  ipcMain.handle("checkstation:clearMediaCache", (_event, request) => {
    sessionApi.clearMediaCache(request?.workspaceKey || null);
    return { ok: true };
  });
  ipcMain.handle("checkstation:http", (_event, req) => sessionApi.http(req || {}));
  ipcMain.handle("checkstation:kioskExitCredentialSave", (_event, request) =>
    kioskExitCredentialStore.save(request || {}),
  );
  ipcMain.handle("checkstation:kioskExitCredentialLoad", (_event, request) =>
    kioskExitCredentialStore.load(request || {}),
  );
  ipcMain.handle("checkstation:kioskExitCredentialClear", (_event, request) =>
    kioskExitCredentialStore.clear(request || {}),
  );
  ipcMain.handle("checkstation:kioskExitCredentialList", () => kioskExitCredentialStore.listValid());
  ipcMain.handle("checkstation:getProductTourPrefs", () => readProductTourPrefs());
  ipcMain.handle("checkstation:setProductTourPrefs", (_event, next) => writeProductTourPrefs(next || {}));
  ipcMain.handle("checkstation:googleOAuthConfigured", () => isGoogleDesktopOAuthConfigured());
  ipcMain.handle("checkstation:desktopDistribution", () => desktopDistributionInfo);
  ipcMain.handle("checkstation:googleOAuthSignIn", async () => {
    // Returns outcome only — never persist or log the identity token here.
    // On success only, restore/focus the existing main window (macOS steal focus).
    return requestGoogleIdentityToken({
      bringToForeground: bringCheckStationToForeground,
    });
  });
  ipcMain.handle("checkstation:appleOAuthSignIn", async (_event, request) => {
    // DIRECT only: system-browser Apple web OAuth + loopback handoff.
    // Never log the handoff token.
    if (desktopDistributionInfo.distribution !== "direct") {
      return { kind: "unavailable" };
    }
    return requestAppleWebOAuth({
      intent: request?.intent === "register" ? "register" : "login",
      legalAcknowledgement: Boolean(request?.legalAcknowledgement),
      bringToForeground: bringCheckStationToForeground,
    });
  });
  ipcMain.handle("checkstation:appleNativeSignIn", async () => {
    // MAS only: ASAuthorization → identity token for /auth/apple/native/.
    if (desktopDistributionInfo.appleAuthMode !== "native") {
      return { kind: "unavailable" };
    }
    return requestAppleNativeIdentity({
      bringToForeground: bringCheckStationToForeground,
    });
  });
  ipcMain.handle("checkstation:storeKitProducts", async () => {
    if (desktopDistributionInfo.billingMode !== "apple_iap") {
      return { kind: "unavailable", products: [] };
    }
    return loadStoreKitProducts();
  });
  ipcMain.handle("checkstation:storeKitPurchase", async (_event, request) => {
    if (desktopDistributionInfo.billingMode !== "apple_iap") {
      return { kind: "unavailable" };
    }
    return purchaseStoreKitSubscription({
      productId: request?.productId,
      appAccountToken: request?.appAccountToken,
      bringToForeground: bringCheckStationToForeground,
    });
  });
  ipcMain.handle("checkstation:storeKitRestore", async () => {
    if (desktopDistributionInfo.billingMode !== "apple_iap") {
      return { kind: "unavailable", transactions: [] };
    }
    return restoreStoreKitPurchases({
      bringToForeground: bringCheckStationToForeground,
    });
  });
  ipcMain.handle("checkstation:storeKitManage", async () => {
    if (desktopDistributionInfo.billingMode !== "apple_iap") {
      return { kind: "unavailable" };
    }
    return openAppleManageSubscriptions({
      bringToForeground: bringCheckStationToForeground,
    });
  });
  ipcMain.handle("checkstation:prepareBillingReturn", async () => {
    if (desktopDistributionInfo.billingMode !== "stripe_web") {
      return { kind: "unavailable" };
    }
    const prepared = await prepareDesktopBillingReturn();
    const id = crypto.randomBytes(16).toString("hex");
    pendingBillingReturns.set(id, {
      server: prepared.server,
      createdAt: Date.now(),
    });
    return { kind: "ready", id, desktopReturnUrl: prepared.desktopReturnUrl };
  });
  ipcMain.handle("checkstation:openBillingReturn", async (_event, request) => {
    if (desktopDistributionInfo.billingMode !== "stripe_web") {
      return { kind: "unavailable" };
    }
    const id = String(request?.id || "");
    const pending = pendingBillingReturns.get(id);
    pendingBillingReturns.delete(id);
    if (!pending?.server) {
      return { kind: "error", message: "Billing return was not prepared." };
    }
    return openBillingUrlAndWait({
      server: pending.server,
      url: String(request?.url || ""),
      title: String(request?.title || "Billing complete"),
      body: String(request?.body || "Returning to CheckStation…"),
      bringToForeground: bringCheckStationToForeground,
    });
  });
  ipcMain.handle("checkstation:cancelBillingReturn", (_event, request) => {
    const id = String(request?.id || "");
    const pending = pendingBillingReturns.get(id);
    pendingBillingReturns.delete(id);
    if (pending?.server) {
      try {
        pending.server.close();
      } catch {
        /* ignore */
      }
    }
    return { ok: true };
  });
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
