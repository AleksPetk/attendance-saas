/**
 * Google Play Billing helpers via expo-iap (Android only).
 * Entitlement is never granted client-side — always verify with the backend.
 *
 * Connection model mirrors Apple:
 * - Register listeners once, then initConnection() once.
 * - Never call endConnection from app code.
 * - Product load, restore, and purchase share ensureGoogleIapSession().
 *
 * Promotional Play offers are never selected — only normal base-plan offerTokens.
 */

import { Platform } from "react-native";
import {
  deepLinkToSubscriptions,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases as expoIapRestorePurchases,
  type ProductSubscription,
  type Purchase,
} from "expo-iap";
import {
  GOOGLE_PLAN_OPTIONS,
  GOOGLE_PLAY_PACKAGE_NAME,
  GOOGLE_PRODUCT_ID_LIST,
  type GoogleBasePlanId,
  type GoogleIntervalKey,
  type GooglePlanKey,
  type GooglePlanOption,
  type GoogleProductId,
  googleOptionFor,
} from "./googleProducts";
import {
  isNormalGoogleBasePlanOffer,
  selectNormalBasePlanOffer,
} from "./googleOfferSelection";

export { isNormalGoogleBasePlanOffer, selectNormalBasePlanOffer } from "./googleOfferSelection";

export type GoogleStoreOffer = {
  productId: GoogleProductId;
  basePlanId: GoogleBasePlanId;
  plan: GooglePlanKey;
  interval: GoogleIntervalKey;
  displayPrice: string;
  currency: string | null;
  offerToken: string;
  title: string;
};

const PRODUCT_FETCH_ATTEMPTS = 3;
const PRODUCT_FETCH_RETRY_MS = 450;

export function googleIapSupported(): boolean {
  return Platform.OS === "android";
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

let googleIapSessionReady = false;
let googleIapSessionPromise: Promise<void> | null = null;
let googleIapListenersAttached = false;

function attachGoogleIapListenersOnce(): void {
  if (googleIapListenersAttached || !googleIapSupported()) return;
  googleIapListenersAttached = true;
  purchaseUpdatedListener(() => {});
  purchaseErrorListener(() => {});
}

export async function ensureGoogleIapSession(): Promise<void> {
  if (!googleIapSupported()) {
    throw new Error("Google Play billing is only available on Android.");
  }
  if (googleIapSessionReady) return;
  if (!googleIapSessionPromise) {
    googleIapSessionPromise = (async () => {
      attachGoogleIapListenersOnce();
      const connected = await initConnection();
      if (!connected) {
        googleIapSessionPromise = null;
        throw new Error("Google Play billing connection failed.");
      }
      googleIapSessionReady = true;
    })();
  }
  try {
    await googleIapSessionPromise;
  } catch (error) {
    googleIapSessionPromise = null;
    googleIapSessionReady = false;
    throw error;
  }
}

export function warmGoogleIapSession(): void {
  if (!googleIapSupported()) return;
  void ensureGoogleIapSession().catch(() => {});
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asGoogleProduct(product: ProductSubscription): GoogleProductId | null {
  const id = String(product.id || (product as { productId?: string }).productId || "").trim();
  if (GOOGLE_PRODUCT_ID_LIST.includes(id as GoogleProductId)) return id as GoogleProductId;
  return null;
}

export async function loadGoogleStoreOffers(): Promise<GoogleStoreOffer[]> {
  await ensureGoogleIapSession();
  let products: ProductSubscription[] = [];
  for (let attempt = 0; attempt < PRODUCT_FETCH_ATTEMPTS; attempt += 1) {
    const result = await fetchProducts({
      skus: [...GOOGLE_PRODUCT_ID_LIST],
      type: "subs",
    });
    products = (Array.isArray(result) ? result : []) as ProductSubscription[];
    if (products.length > 0) break;
    if (attempt < PRODUCT_FETCH_ATTEMPTS - 1) await sleep(PRODUCT_FETCH_RETRY_MS);
  }

  const byProduct = new Map<string, ProductSubscription>();
  for (const product of products) {
    const id = asGoogleProduct(product);
    if (id) byProduct.set(id, product);
  }

  const offers: GoogleStoreOffer[] = [];
  for (const option of GOOGLE_PLAN_OPTIONS) {
    const product = byProduct.get(option.productId);
    if (!product) continue;
    const selected = selectNormalBasePlanOffer(product, option.basePlanId);
    if (!selected) continue;
    offers.push({
      productId: option.productId,
      basePlanId: option.basePlanId,
      plan: option.plan,
      interval: option.interval,
      displayPrice: selected.displayPrice,
      currency: selected.currency,
      offerToken: selected.offerToken,
      title: String(product.title || option.productId),
    });
  }
  return offers;
}

export function googleOfferForOption(
  offers: GoogleStoreOffer[],
  option: GooglePlanOption,
): GoogleStoreOffer | null {
  return (
    offers.find(
      (offer) =>
        offer.productId === option.productId && offer.basePlanId === option.basePlanId,
    ) || null
  );
}

export async function purchaseGoogleSubscription(option: {
  productId: GoogleProductId;
  basePlanId: GoogleBasePlanId;
  offerToken: string;
}): Promise<{ purchase: Purchase; purchaseToken: string }> {
  await ensureGoogleIapSession();
  const offerToken = String(option.offerToken || "").trim();
  const productId = String(option.productId || "").trim();
  if (!offerToken || !productId) {
    throw new Error("Google Play purchase option is unavailable.");
  }
  const result = await requestPurchase({
    request: {
      google: {
        skus: [productId],
        subscriptionOffers: [{ sku: productId, offerToken }],
      },
    },
    type: "subs",
  });
  const purchase = Array.isArray(result) ? result[0] : result;
  if (!purchase || typeof purchase !== "object") {
    throw new Error("Google Play did not return a purchase.");
  }
  const purchaseToken = String(
    (purchase as Purchase).purchaseToken
      || (purchase as { purchaseTokenAndroid?: string }).purchaseTokenAndroid
      || "",
  ).trim();
  if (!purchaseToken) {
    throw new Error("Google Play purchase token was missing.");
  }
  return { purchase: purchase as Purchase, purchaseToken };
}

export async function finishGoogleTransaction(purchase: Purchase): Promise<void> {
  await finishTransaction({ purchase, isConsumable: false });
}

export async function restoreGooglePurchases(): Promise<
  Array<{ purchase: Purchase; purchaseToken: string }>
> {
  await ensureGoogleIapSession();
  await expoIapRestorePurchases();
  const purchases = await getAvailablePurchases();
  const list = Array.isArray(purchases) ? purchases : [];
  const out: Array<{ purchase: Purchase; purchaseToken: string }> = [];
  for (const purchase of list) {
    const productId = String(purchase.productId || "").trim();
    if (!GOOGLE_PRODUCT_ID_LIST.includes(productId as GoogleProductId)) continue;
    const purchaseToken = String(
      purchase.purchaseToken
        || (purchase as { purchaseTokenAndroid?: string }).purchaseTokenAndroid
        || "",
    ).trim();
    if (!purchaseToken) continue;
    out.push({ purchase, purchaseToken });
  }
  return out;
}

export async function openGoogleManageSubscriptions(skuAndroid?: string): Promise<void> {
  await ensureGoogleIapSession();
  const sku = String(skuAndroid || GOOGLE_PRODUCT_ID_LIST[0]).trim();
  await deepLinkToSubscriptions({
    skuAndroid: sku,
    packageNameAndroid: GOOGLE_PLAY_PACKAGE_NAME,
  });
}

export function googleSkuForManagedBilling(billing: Record<string, any> | null | undefined): string {
  const plan = String(billing?.subscribed_plan?.key || "").toLowerCase();
  const interval = String(billing?.interval || "").toLowerCase();
  if ((plan === "plus" || plan === "business") && (interval === "monthly" || interval === "yearly")) {
    return googleOptionFor(plan, interval as GoogleIntervalKey).productId;
  }
  return GOOGLE_PRODUCT_ID_LIST[0];
}
