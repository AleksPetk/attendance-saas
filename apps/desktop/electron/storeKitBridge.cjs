/**
 * MAS StoreKit 2 bridge via in-process MacApple native module.
 * Product IDs match iOS / App Store Connect. Never logs JWS.
 */

const { invokeMacBridge, isMacBridgeAvailable } = require("./macBridge.cjs");

const APPLE_PRODUCT_IDS = [
  "app.checkstation.plus.monthly",
  "app.checkstation.plus.yearly",
  "app.checkstation.business.monthly",
  "app.checkstation.business.yearly",
];

async function loadStoreKitProducts(options = {}) {
  const invoke = options.invoke || invokeMacBridge;
  if (!options.invoke && !isMacBridgeAvailable()) {
    return { kind: "signing_required", products: [] };
  }
  const result = await invoke({ cmd: "products", productIds: APPLE_PRODUCT_IDS });
  if (!result || result.ok !== true) {
    const code = String(result?.code || "error");
    if (code === "signing_required") {
      return { kind: "signing_required", products: [] };
    }
    return {
      kind: "error",
      message: String(result?.message || "Could not load App Store products."),
      products: [],
    };
  }
  const products = Array.isArray(result.products) ? result.products : [];
  return {
    kind: "success",
    products: products.map((row) => ({
      productId: String(row.productId || ""),
      displayPrice: String(row.displayPrice || ""),
      title: String(row.title || ""),
      description: String(row.description || ""),
    })).filter((row) => row.productId),
  };
}

async function purchaseStoreKitSubscription(options = {}) {
  const productId = String(options.productId || "").trim();
  const appAccountToken = String(options.appAccountToken || "").trim();
  if (!productId) {
    return { kind: "error", message: "Missing product id." };
  }
  const invoke = options.invoke || invokeMacBridge;
  if (!options.invoke && !isMacBridgeAvailable()) {
    return { kind: "signing_required" };
  }
  const result = await invoke({
    cmd: "purchase",
    productId,
    appAccountToken: appAccountToken || undefined,
  });
  if (!result || result.ok !== true) {
    const code = String(result?.code || "error");
    if (code === "cancelled") return { kind: "cancelled" };
    if (code === "signing_required") return { kind: "signing_required" };
    if (code === "pending") return { kind: "pending" };
    return {
      kind: "error",
      message: String(result?.message || "Purchase failed."),
    };
  }
  const signedTransaction = String(result.signedTransaction || "").trim();
  if (!signedTransaction) {
    return { kind: "error", message: "Apple purchase is missing a signed transaction." };
  }
  if (typeof options.bringToForeground === "function") {
    try {
      options.bringToForeground();
    } catch {
      /* best-effort */
    }
  }
  return {
    kind: "success",
    productId: String(result.productId || productId),
    signedTransaction,
  };
}

async function restoreStoreKitPurchases(options = {}) {
  const invoke = options.invoke || invokeMacBridge;
  if (!options.invoke && !isMacBridgeAvailable()) {
    return { kind: "signing_required", transactions: [] };
  }
  const result = await invoke({ cmd: "restore" });
  if (!result || result.ok !== true) {
    const code = String(result?.code || "error");
    if (code === "signing_required") {
      return { kind: "signing_required", transactions: [] };
    }
    return {
      kind: "error",
      message: String(result?.message || "Restore failed."),
      transactions: [],
    };
  }
  const transactions = (Array.isArray(result.transactions) ? result.transactions : [])
    .map((row) => ({
      productId: String(row.productId || ""),
      signedTransaction: String(row.signedTransaction || ""),
    }))
    .filter((row) => row.productId && row.signedTransaction);
  if (typeof options.bringToForeground === "function") {
    try {
      options.bringToForeground();
    } catch {
      /* best-effort */
    }
  }
  return { kind: "success", transactions };
}

async function openAppleManageSubscriptions(options = {}) {
  const invoke = options.invoke || invokeMacBridge;
  if (!options.invoke && !isMacBridgeAvailable()) {
    return { kind: "signing_required" };
  }
  const result = await invoke({ cmd: "manage" });
  if (!result || result.ok !== true) {
    const code = String(result?.code || "error");
    if (code === "signing_required") return { kind: "signing_required" };
    return {
      kind: "error",
      message: String(result?.message || "Could not open subscription management."),
    };
  }
  if (typeof options.bringToForeground === "function") {
    try {
      options.bringToForeground();
    } catch {
      /* best-effort */
    }
  }
  return { kind: "success" };
}

module.exports = {
  APPLE_PRODUCT_IDS,
  loadStoreKitProducts,
  purchaseStoreKitSubscription,
  restoreStoreKitPurchases,
  openAppleManageSubscriptions,
  isMacBridgeAvailable,
};
