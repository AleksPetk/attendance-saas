/**
 * Apple Plan cards are catalog-first: backend plan metadata + Admin template.
 * StoreKit only supplies displayPrice / purchase availability — never card existence.
 */

import {
  APPLE_PRODUCT_ID_LIST,
  appleProductMeta,
  type AppleIntervalKey,
  type ApplePlanKey,
  type AppleProductId,
} from "./appleProducts";
import type { AppleStoreProduct } from "./appleIap";

export type ApplePlanCardModel = {
  productId: AppleProductId;
  plan: ApplePlanKey;
  interval: AppleIntervalKey;
  title: string;
};

type BillingCatalog = {
  catalog?: {
    plans?: Record<string, { display_name?: string } | undefined>;
  };
};

type BillingText = (key: string, vars?: Record<string, string | number>) => string;

export function buildApplePlanCards(
  billing: BillingCatalog | null | undefined,
  text: BillingText,
): ApplePlanCardModel[] {
  return APPLE_PRODUCT_ID_LIST.map((productId) => {
    const meta = appleProductMeta(productId)!;
    const catalogName = billing?.catalog?.plans?.[meta.plan]?.display_name;
    const planName = (catalogName && String(catalogName).trim())
      || (meta.plan === "business" ? "Business" : "Plus");
    const intervalLabel = text(`billing:interval.${meta.interval}`);
    return {
      productId,
      plan: meta.plan,
      interval: meta.interval,
      title: `${planName} ${intervalLabel}`,
    };
  });
}

export function appleStoreProductMap(
  products: AppleStoreProduct[],
): Map<AppleProductId, AppleStoreProduct> {
  const map = new Map<AppleProductId, AppleStoreProduct>();
  for (const product of products) {
    if (APPLE_PRODUCT_ID_LIST.includes(product.productId)) {
      map.set(product.productId, product);
    }
  }
  return map;
}

export function appleDisplayPriceForCard(
  store: AppleStoreProduct | undefined,
  unavailableLabel: string,
): string {
  const price = String(store?.displayPrice || "").trim();
  return price || unavailableLabel;
}
