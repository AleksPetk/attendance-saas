/**
 * StoreKit helpers via expo-iap (iOS/iPadOS only).
 * Entitlement is never granted client-side — always verify with the backend.
 *
 * Connection model (one process-lifetime session):
 * - Register purchase listeners once, then initConnection() once.
 * - Never call endConnection from app code (OpenIAP nulls productManager and
 *   races the next fetch → empty products / not-prepared).
 * - Product load, restore, and purchase all share ensureAppleIapSession().
 * - iOS restore must AppStore.sync before reading entitlements (expo-iap restorePurchases).
 */

import { Platform } from "react-native";
import {
  deepLinkToSubscriptions,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  getStorefront,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases as expoIapRestorePurchases,
  type ProductSubscription,
  type Purchase,
} from "expo-iap";
// Native iOS management sheet — exported from the iOS module (not the cross-platform index).
import { showManageSubscriptionsIOS } from "expo-iap/build/modules/ios";
import { APPLE_PRODUCT_ID_LIST, type AppleProductId } from "./appleProducts";
import { normalizeAppleStorefrontCountryCode } from "./applePlanCards";
import { runAppleManageSubscriptions } from "./appleManageSubscriptions";

export type AppleStoreProduct = {
  productId: AppleProductId;
  displayPrice: string;
  /** ISO 4217 from StoreKit when available (e.g. "JPY", "USD") — card display only. */
  currency: string | null;
  title: string;
  description: string;
};

const PRODUCT_FETCH_ATTEMPTS = 3;
const PRODUCT_FETCH_RETRY_MS = 450;
const STOREFRONT_FETCH_ATTEMPTS = 3;
const STOREFRONT_FETCH_RETRY_MS = 250;

export function appleIapSupported(): boolean {
  return Platform.OS === "ios";
}

export function isUserCancelPurchaseError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = String((error as { code?: string }).code || "").toLowerCase();
  const message = String((error as { message?: string }).message || "").toLowerCase();
  return (
    code.includes("user-cancelled")
    || code.includes("user_cancelled")
    || code.includes("canceled")
    || code.includes("cancelled")
    || message.includes("cancelled")
    || message.includes("canceled")
  );
}

let appleIapSessionReady = false;
let appleIapSessionPromise: Promise<void> | null = null;
let appleIapListenersAttached = false;

function attachAppleIapListenersOnce(): void {
  if (appleIapListenersAttached || !appleIapSupported()) return;
  appleIapListenersAttached = true;
  // Match expo-iap useIAP: listeners must exist before initConnection so early
  // purchase-updated / purchase-error events are not dropped. Keep them for the
  // process lifetime (do not endConnection on Plan unmount).
  purchaseUpdatedListener(() => {
    // Purchase results are also returned from requestPurchase; listener keeps
    // the native bridge session warm for restore / unfinished transactions.
  });
  purchaseErrorListener(() => {
    // Errors surface through requestPurchase / restore promise rejections.
  });
}

/**
 * Ensure a single OpenIAP/StoreKit session is initialized for this process.
 * Safe to call repeatedly; does not tear down after product fetches.
 */
export async function ensureAppleIapSession(): Promise<void> {
  if (!appleIapSupported()) {
    throw new Error("Apple billing is only available on iOS.");
  }
  if (appleIapSessionReady) return;
  if (!appleIapSessionPromise) {
    appleIapSessionPromise = (async () => {
      attachAppleIapListenersOnce();
      const connected = await initConnection();
      if (!connected) {
        appleIapSessionPromise = null;
        throw new Error("Apple billing connection failed.");
      }
      appleIapSessionReady = true;
    })();
  }
  try {
    await appleIapSessionPromise;
  } catch (error) {
    appleIapSessionPromise = null;
    appleIapSessionReady = false;
    throw error;
  }
}

/** Warm the StoreKit session at app start (no teardown). */
export function warmAppleIapSession(): void {
  if (!appleIapSupported()) return;
  void ensureAppleIapSession().catch(() => {
    // Plan load / restore / purchase will retry via ensureAppleIapSession.
  });
}

/** @deprecated Prefer ensureAppleIapSession — kept name for call-site clarity. */
export async function withAppleIapConnection<T>(fn: () => Promise<T>): Promise<T> {
  await ensureAppleIapSession();
  return fn();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableAppleStoreError(error: unknown): boolean {
  if (!error || typeof error !== "object") return true;
  const code = String((error as { code?: string }).code || "").toLowerCase();
  const message = String((error as { message?: string }).message || "").toLowerCase();
  if (isUserCancelPurchaseError(error)) return false;
  return (
    !code
    || code.includes("not-prepared")
    || code.includes("not_prepared")
    || code.includes("init-connection")
    || code.includes("init_connection")
    || code.includes("service-error")
    || code.includes("network")
    || code.includes("query-product")
    || message.includes("not ready")
    || message.includes("not prepared")
    || message.includes("connection")
  );
}

export function normalizeFetchedProducts(products: unknown): AppleStoreProduct[] {
  const list = (Array.isArray(products) ? products : []) as Array<
    ProductSubscription & { productId?: string; id?: string }
  >;
  const byId = new Map<string, (typeof list)[number]>();
  for (const product of list) {
    const id = String(product.id || product.productId || "").trim();
    if (id) byId.set(id, product);
  }
  const ordered: AppleStoreProduct[] = [];
  for (const productId of APPLE_PRODUCT_ID_LIST) {
    const product = byId.get(productId);
    if (!product) continue;
    const currencyRaw = String(
      (product as { currency?: string | null }).currency
        || (product as { currencyCodeIOS?: string | null }).currencyCodeIOS
        || "",
    ).trim().toUpperCase();
    ordered.push({
      productId,
      displayPrice: String(product.displayPrice || ""),
      currency: currencyRaw || null,
      title: String(product.title || productId),
      description: String(product.description || ""),
    });
  }
  return ordered;
}

async function fetchAppleSubscriptionProductsOnce(): Promise<AppleStoreProduct[]> {
  const skus = [...APPLE_PRODUCT_ID_LIST];
  let ordered = normalizeFetchedProducts(
    await fetchProducts({ skus, type: "subs" }),
  );
  if (!ordered.length) {
    ordered = normalizeFetchedProducts(
      await fetchProducts({ skus, type: "all" }),
    );
  }
  return ordered;
}

/**
 * Load App Store subscription prices for the four CheckStation SKUs.
 * Path: expo-iap fetchProducts → OpenIAP → StoreKit.Product.products(for:).
 * Tries `subs` first, then `all`, with short retries for cold-start empty/racy results.
 */
export async function loadAppleSubscriptionProducts(): Promise<AppleStoreProduct[]> {
  return withAppleIapConnection(async () => {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= PRODUCT_FETCH_ATTEMPTS; attempt += 1) {
      try {
        const ordered = await fetchAppleSubscriptionProductsOnce();
        if (ordered.length > 0) return ordered;
        lastError = null;
      } catch (error) {
        lastError = error;
        if (!isRetryableAppleStoreError(error) || attempt >= PRODUCT_FETCH_ATTEMPTS) {
          throw error;
        }
      }
      if (attempt < PRODUCT_FETCH_ATTEMPTS) {
        await sleep(PRODUCT_FETCH_RETRY_MS * attempt);
      }
    }
    if (lastError) throw lastError;
    return [];
  });
}

export function purchaseJws(purchase: Purchase): string {
  const token = String(purchase.purchaseToken || "").trim();
  if (token) return token;
  const ios = purchase as Purchase & { jwsRepresentationIOS?: string; jwsRepresentation?: string };
  return String(ios.jwsRepresentationIOS || ios.jwsRepresentation || "").trim();
}

function purchaseProductId(purchase: Purchase): string {
  const row = purchase as Purchase & { id?: string };
  return String(purchase.productId || row.id || "").trim();
}

export async function purchaseAppleSubscription(params: {
  productId: AppleProductId;
  appAccountToken: string;
}): Promise<{ purchase: Purchase; signedTransaction: string }> {
  return withAppleIapConnection(async () => {
    const result = await requestPurchase({
      type: "subs",
      request: {
        apple: {
          sku: params.productId,
          appAccountToken: params.appAccountToken,
        },
      },
    });
    const purchase = Array.isArray(result) ? result[0] : result;
    if (!purchase) {
      throw new Error("Apple purchase did not return a transaction.");
    }
    const signedTransaction = purchaseJws(purchase as Purchase);
    if (!signedTransaction) {
      throw new Error("Apple purchase is missing a signed transaction.");
    }
    return { purchase: purchase as Purchase, signedTransaction };
  });
}

/**
 * Restore Apple subscriptions for this Apple ID.
 * Matches expo-iap restorePurchases: AppStore.sync() then getAvailablePurchases.
 */
export async function restoreApplePurchases(): Promise<
  Array<{ purchase: Purchase; signedTransaction: string }>
> {
  return withAppleIapConnection(async () => {
    // expo-iap restorePurchases = AppStore.sync() (iOS) then refresh entitlements.
    // Without sync, Restore only flashes Plan UI and currentEntitlements stay empty.
    await expoIapRestorePurchases();
    const purchases = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
    const out: Array<{ purchase: Purchase; signedTransaction: string }> = [];
    for (const purchase of purchases || []) {
      const signedTransaction = purchaseJws(purchase);
      if (!signedTransaction) continue;
      const productId = purchaseProductId(purchase);
      if (!APPLE_PRODUCT_ID_LIST.includes(productId as AppleProductId)) continue;
      out.push({ purchase, signedTransaction });
    }
    return out;
  });
}

export async function finishAppleTransaction(purchase: Purchase): Promise<void> {
  try {
    await finishTransaction({ purchase, isConsumable: false });
  } catch {
    // Backend already owns entitlement; finishing is best-effort.
  }
}

/**
 * Read the App Store storefront country code (e.g. "JP", "US").
 * Retries briefly when StoreKit returns empty / throws during cold start
 * (observed on some iPad sessions). Returns null when still unknown —
 * callers must not guess from device locale.
 */
export async function loadAppleStorefrontCountryCode(): Promise<string | null> {
  if (!appleIapSupported()) return null;
  try {
    await ensureAppleIapSession();
  } catch {
    return null;
  }
  for (let attempt = 1; attempt <= STOREFRONT_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const raw = await getStorefront();
      const normalized = normalizeAppleStorefrontCountryCode(raw);
      if (normalized) return normalized;
    } catch {
      // Retry transient StoreKit/OpenIAP failures; never invent a country.
    }
    if (attempt < STOREFRONT_FETCH_ATTEMPTS) {
      await sleep(STOREFRONT_FETCH_RETRY_MS * attempt);
    }
  }
  return null;
}

export type AppleManageSubscriptionsDeps = {
  showManageSubscriptionsIOS?: () => Promise<unknown>;
  deepLinkToSubscriptions?: (options: Record<string, never>) => Promise<void>;
};

export {
  isUnsupportedAppleManageSubscriptionsError,
} from "./appleManageSubscriptions";

/**
 * Open Apple's in-app subscription management sheet on iOS.
 * Falls back to the App Store subscriptions deep link only when the native
 * sheet API is unavailable / unsupported — not on arbitrary failures.
 */
export async function openAppleManageSubscriptions(
  deps: AppleManageSubscriptionsDeps = {},
): Promise<"native_sheet" | "deep_link"> {
  if (!appleIapSupported()) {
    throw new Error("Apple billing is only available on iOS.");
  }
  return runAppleManageSubscriptions({
    showManageSubscriptionsIOS: deps.showManageSubscriptionsIOS || showManageSubscriptionsIOS,
    deepLinkToSubscriptions: deps.deepLinkToSubscriptions || deepLinkToSubscriptions,
  });
}
