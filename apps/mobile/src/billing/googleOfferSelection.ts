/**
 * Pure Google Play base-plan offer selection (no React Native / expo-iap runtime).
 * Promotional Play offers (non-empty offerId / intro / promo types) are never selected.
 */

import type { GoogleBasePlanId } from "./googleProducts";

export type GoogleOfferLike = {
  basePlanIdAndroid?: string | null;
  id?: string | null;
  offerTokenAndroid?: string | null;
  displayPrice?: string | null;
  currency?: string | null;
  type?: string | null;
};

export type GoogleProductLike = {
  id?: string;
  productId?: string;
  title?: string;
  displayPrice?: string;
  currency?: string;
  subscriptionOffers?: GoogleOfferLike[] | null;
  subscriptionOfferDetailsAndroid?: Array<{
    basePlanId?: string;
    offerId?: string | null;
    offerToken?: string;
    pricingPhases?: {
      pricingPhaseList?: Array<{ formattedPrice?: string; priceCurrencyCode?: string }>;
    };
  }> | null;
};

/** True when this offer is the normal base-plan purchase (no promotional offerId). */
export function isNormalGoogleBasePlanOffer(offer: GoogleOfferLike): boolean {
  const basePlanId = String(offer.basePlanIdAndroid || "").trim();
  if (!basePlanId) return false;
  const offerId = String(offer.id || "").trim();
  if (offerId) return false;
  const offerType = String(offer.type || "").trim().toLowerCase();
  if (offerType === "introductory" || offerType === "promotional") return false;
  return Boolean(String(offer.offerTokenAndroid || "").trim());
}

export function offersFromGoogleProduct(product: GoogleProductLike): GoogleOfferLike[] {
  const list = product.subscriptionOffers;
  if (Array.isArray(list) && list.length) return list;
  const legacy = product.subscriptionOfferDetailsAndroid;
  if (!Array.isArray(legacy)) return [];
  return legacy.map((entry) => {
    const phase = entry.pricingPhases?.pricingPhaseList?.[0];
    return {
      basePlanIdAndroid: entry.basePlanId || null,
      id: entry.offerId || "",
      offerTokenAndroid: entry.offerToken || null,
      displayPrice: phase?.formattedPrice || "",
      currency: phase?.priceCurrencyCode || null,
      type: "one-time",
    };
  });
}

/**
 * Select the normal monthly/yearly base-plan offer for a product.
 * Ignores promotional offer entries even if Play returns them.
 */
export function selectNormalBasePlanOffer(
  product: GoogleProductLike,
  basePlanId: GoogleBasePlanId,
): { offerToken: string; displayPrice: string; currency: string | null } | null {
  const offers = offersFromGoogleProduct(product);
  const match = offers.find(
    (offer) =>
      String(offer.basePlanIdAndroid || "").trim() === basePlanId
      && isNormalGoogleBasePlanOffer(offer),
  );
  if (!match) return null;
  const offerToken = String(match.offerTokenAndroid || "").trim();
  const displayPrice = String(match.displayPrice || "").trim();
  if (!offerToken || !displayPrice) return null;
  const currency = match.currency ? String(match.currency) : null;
  return { offerToken, displayPrice, currency };
}
