const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("checkstationDesktop", {
  platform: process.platform,
  startupReady: () => ipcRenderer.send("checkstation:startupReady"),
  initSession: () => ipcRenderer.invoke("checkstation:initSession"),
  clearSession: () => ipcRenderer.invoke("checkstation:clearSession"),
  clearMediaCache: (request) => ipcRenderer.invoke("checkstation:clearMediaCache", request || {}),
  kioskExitCredentialSave: (request) => ipcRenderer.invoke("checkstation:kioskExitCredentialSave", request || {}),
  kioskExitCredentialLoad: (request) => ipcRenderer.invoke("checkstation:kioskExitCredentialLoad", request || {}),
  kioskExitCredentialClear: (request) => ipcRenderer.invoke("checkstation:kioskExitCredentialClear", request || {}),
  kioskExitCredentialList: () => ipcRenderer.invoke("checkstation:kioskExitCredentialList"),
  http: (req) => ipcRenderer.invoke("checkstation:http", req),
  saveFile: (req) => ipcRenderer.invoke("checkstation:saveFile", req),
  getProductTourPrefs: () => ipcRenderer.invoke("checkstation:getProductTourPrefs"),
  setProductTourPrefs: (prefs) => ipcRenderer.invoke("checkstation:setProductTourPrefs", prefs),
  /** Active macOS distribution variant (direct | mas) and related mode flags. */
  getDesktopDistribution: () => ipcRenderer.invoke("checkstation:desktopDistribution"),
  isGoogleOAuthConfigured: () => ipcRenderer.invoke("checkstation:googleOAuthConfigured"),
  /** Opens system-browser Google OAuth; returns ID token outcome (do not log token). */
  requestGoogleIdentityToken: () => ipcRenderer.invoke("checkstation:googleOAuthSignIn"),
  /**
   * DIRECT only: system-browser Apple web OAuth → loopback handoff.
   * Do not log the handoff token.
   */
  requestAppleWebOAuth: (request) => ipcRenderer.invoke("checkstation:appleOAuthSignIn", request || {}),
  /**
   * MAS only: native ASAuthorization → identity token for /auth/apple/native/.
   * Do not log the identity token.
   */
  requestAppleNativeSignIn: () => ipcRenderer.invoke("checkstation:appleNativeSignIn"),
  /** MAS StoreKit 2: products / purchase / restore / manage. */
  loadStoreKitProducts: () => ipcRenderer.invoke("checkstation:storeKitProducts"),
  purchaseStoreKitSubscription: (request) =>
    ipcRenderer.invoke("checkstation:storeKitPurchase", request || {}),
  restoreStoreKitPurchases: () => ipcRenderer.invoke("checkstation:storeKitRestore"),
  openAppleManageSubscriptions: () => ipcRenderer.invoke("checkstation:storeKitManage"),
  /** DIRECT Stripe: prepare localhost return URL before creating Checkout/portal. */
  prepareBillingReturn: () => ipcRenderer.invoke("checkstation:prepareBillingReturn"),
  /** DIRECT Stripe: open Checkout/portal URL and wait for loopback return. */
  openBillingReturn: (request) => ipcRenderer.invoke("checkstation:openBillingReturn", request || {}),
  cancelBillingReturn: (request) => ipcRenderer.invoke("checkstation:cancelBillingReturn", request || {}),
});
