/**
 * Apple Plan cards are catalog-first: backend plan metadata + Admin template.
 * StoreKit supplies displayPrice / purchase availability — never card existence.
 * Japan storefront uses fixed card display amounts (display only; purchases stay StoreKit).
 */

import {
  APPLE_PRODUCT_ID_LIST,
  APPLE_PRODUCT_IDS,
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

/** Fixed Japan App Store card display amounts (display only; not purchase amounts). */
export const APPLE_JAPAN_CARD_DISPLAY_PRICES: Record<AppleProductId, string> = {
  [APPLE_PRODUCT_IDS.plusMonthly]: "¥980",
  [APPLE_PRODUCT_IDS.plusYearly]: "¥9,800",
  [APPLE_PRODUCT_IDS.businessMonthly]: "¥1,480",
  [APPLE_PRODUCT_IDS.businessYearly]: "¥14,800",
};

/**
 * Normalize StoreKit / OpenIAP storefront country codes.
 * Accepts "JPN", "jp", "JP", etc. Returns uppercase ISO-3166 alpha-2 when possible.
 */
export function normalizeAppleStorefrontCountryCode(
  value: unknown,
): string | null {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "JPN" || raw === "JAPAN") return "JP";
  if (raw === "USA" || raw === "UNITED STATES") return "US";
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  if (/^[A-Z]{3}$/.test(raw)) {
    if (raw.startsWith("JP")) return "JP";
    if (raw.startsWith("US")) return "US";
  }
  return raw.length >= 2 ? raw.slice(0, 2) : null;
}

export function isJapanAppleStorefront(storefrontCountryCode: unknown): boolean {
  return normalizeAppleStorefrontCountryCode(storefrontCountryCode) === "JP";
}

/**
 * Normalize StoreKit product currency (ISO 4217). Card-display Japan signal only.
 */
export function normalizeAppleProductCurrency(value: unknown): string | null {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "¥" || raw === "￥" || raw === "YEN") return "JPY";
  if (/^[A-Z]{3}$/.test(raw)) return raw;
  return null;
}

export function isJapanAppleProductCurrency(currency: unknown): boolean {
  return normalizeAppleProductCurrency(currency) === "JPY";
}

/**
 * Credible Japan signals for forced card yen amounts (display only).
 * Explicit JP storefront wins; StoreKit product currency JPY is a fallback
 * when storefront is unknown. Device locale / UI language are never used.
 */
export function shouldUseJapanAppleCardDisplayPrices(input: {
  storefrontCountryCode?: string | null;
  store?: Pick<AppleStoreProduct, "currency"> | undefined;
}): boolean {
  if (isJapanAppleStorefront(input.storefrontCountryCode)) return true;
  const storefront = normalizeAppleStorefrontCountryCode(input.storefrontCountryCode);
  // Known non-Japan storefront must keep StoreKit displayPrice (no JPY override).
  if (storefront && storefront !== "JP") return false;
  return isJapanAppleProductCurrency(input.store?.currency);
}

export function japanAppleCardDisplayPrice(
  productId: AppleProductId | string | undefined,
): string | null {
  if (!productId) return null;
  return APPLE_JAPAN_CARD_DISPLAY_PRICES[productId as AppleProductId] || null;
}

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

export type AppleCardDisplayPriceInput = {
  productId?: AppleProductId | string;
  storefrontCountryCode?: string | null;
  store?: AppleStoreProduct | undefined;
  unavailableLabel: string;
};

/**
 * Resolve the price string shown on an Apple Plan card.
 * JP storefront or (unknown storefront + StoreKit currency JPY)
 * → fixed Japan card amounts (even if StoreKit displayPrice is USD).
 * Otherwise → StoreKit displayPrice, else unavailable label.
 */
export function resolveAppleCardDisplayPrice(
  input: AppleCardDisplayPriceInput,
): string {
  const productId = input.productId || input.store?.productId;
  if (
    shouldUseJapanAppleCardDisplayPrices({
      storefrontCountryCode: input.storefrontCountryCode,
      store: input.store,
    })
  ) {
    const japan = japanAppleCardDisplayPrice(productId);
    if (japan) return japan;
  }
  const storePrice = String(input.store?.displayPrice || "").trim();
  return storePrice || input.unavailableLabel;
}

export function appleDisplayPriceForCard(
  store: AppleStoreProduct | undefined,
  unavailableLabel: string,
  options?: {
    productId?: AppleProductId | string;
    storefrontCountryCode?: string | null;
  },
): string {
  return resolveAppleCardDisplayPrice({
    store,
    unavailableLabel,
    productId: options?.productId || store?.productId,
    storefrontCountryCode: options?.storefrontCountryCode,
  });
}
