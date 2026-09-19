/**
 * StoreKit helpers via expo-iap (iOS/iPadOS only).
 * Entitlement is never granted client-side — always verify with the backend.
 */

import { Platform } from "react-native";
import {
  deepLinkToSubscriptions,
  endConnection,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  requestPurchase,
  type ProductSubscription,
  type Purchase,
} from "expo-iap";
import { APPLE_PRODUCT_ID_LIST, type AppleProductId } from "./appleProducts";

export type AppleStoreProduct = {
  productId: AppleProductId;
  displayPrice: string;
  title: string;
  description: string;
};

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

export async function withAppleIapConnection<T>(fn: () => Promise<T>): Promise<T> {
  if (!appleIapSupported()) {
    throw new Error("Apple billing is only available on iOS.");
  }
  await initConnection();
  try {
    return await fn();
  } finally {
    try {
      await endConnection();
    } catch {
      // ignore disconnect errors
    }
  }
}

export async function loadAppleSubscriptionProducts(): Promise<AppleStoreProduct[]> {
  return withAppleIapConnection(async () => {
    const products = await fetchProducts({
      skus: [...APPLE_PRODUCT_ID_LIST],
      type: "subs",
    });
    const list = (Array.isArray(products) ? products : []) as ProductSubscription[];
    const byId = new Map(list.map((p) => [String(p.id || (p as { productId?: string }).productId || ""), p]));
    const ordered: AppleStoreProduct[] = [];
    for (const productId of APPLE_PRODUCT_ID_LIST) {
      const product = byId.get(productId);
      if (!product) continue;
      ordered.push({
        productId,
        displayPrice: String(product.displayPrice || ""),
        title: String(product.title || productId),
        description: String(product.description || ""),
      });
    }
    return ordered;
  });
}

export function purchaseJws(purchase: Purchase): string {
  const token = String(purchase.purchaseToken || "").trim();
  if (token) return token;
  const ios = purchase as Purchase & { jwsRepresentationIOS?: string; jwsRepresentation?: string };
  return String(ios.jwsRepresentationIOS || ios.jwsRepresentation || "").trim();
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

export async function restoreApplePurchases(): Promise<
  Array<{ purchase: Purchase; signedTransaction: string }>
> {
  return withAppleIapConnection(async () => {
    const purchases = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
    const out: Array<{ purchase: Purchase; signedTransaction: string }> = [];
    for (const purchase of purchases || []) {
      const signedTransaction = purchaseJws(purchase);
      if (!signedTransaction) continue;
      if (!APPLE_PRODUCT_ID_LIST.includes(purchase.productId as AppleProductId)) continue;
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

export async function openAppleManageSubscriptions(): Promise<void> {
  await deepLinkToSubscriptions({});
}
