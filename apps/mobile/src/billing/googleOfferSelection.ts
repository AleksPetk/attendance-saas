/**
 * Pure Google Play base-plan offer selection (no React Native / expo-iap runtime).
 *
 * Promotional Play offers are never selected — only normal monthly/yearly base plans.
 *
 * expo-iap 3.4.13 / openiap-google 1.3.28 maps normal paid base plans as:
 *   id = offerId ?: basePlanId   → id equals "monthly" / "yearly"
 *   type = Introductory          → even for paid (non-zero) base plans
 * So we MUST NOT treat non-empty id or type===introductory as promotional.
 */

import type { GoogleBasePlanId } from "./googleProducts";

export type GoogleOfferLike = {
  basePlanIdAndroid?: string | null;
  /** OpenIAP SubscriptionOffer.id (= Play offerId, or basePlanId when offerId is null). */
  id?: string | null;
  /**
   * True Play Console offerId when available (legacy subscriptionOfferDetailsAndroid).
   * Null/empty = normal base plan. Non-empty = promotional offer.
   */
  playOfferId?: string | null;
  offerTokenAndroid?: string | null;
  displayPrice?: string | null;
  currency?: string | null;
  /** Unreliable for Android promo detection in openiap 1.3.28 — ignored for filtering. */
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

/**
 * True when this offer is the normal auto-renewing base-plan purchase option.
 *
 * Normal:
 * - playOfferId absent/null/empty (when provided), OR
 * - id absent/null/empty, OR
 * - id === basePlanIdAndroid (openiap fallback when Play offerId is null)
 *
 * Promotional (reject):
 * - playOfferId non-empty, OR
 * - id present AND id !== basePlanIdAndroid
 *
 * Do NOT use offer.type — openiap marks paid base plans as "introductory".
 */
export function isNormalGoogleBasePlanOffer(offer: GoogleOfferLike): boolean {
  const basePlanId = String(offer.basePlanIdAndroid || "").trim();
  if (!basePlanId) return false;

  if ("playOfferId" in offer) {
    const trueOfferId = String(offer.playOfferId ?? "").trim();
    if (trueOfferId) return false;
  } else {
    const normalizedId = String(offer.id || "").trim();
    if (normalizedId && normalizedId !== basePlanId) return false;
  }

  return Boolean(String(offer.offerTokenAndroid || "").trim());
}

export function offersFromGoogleProduct(product: GoogleProductLike): GoogleOfferLike[] {
  const list = product.subscriptionOffers;
  if (Array.isArray(list) && list.length) return list;
  const legacy = product.subscriptionOfferDetailsAndroid;
  if (!Array.isArray(legacy)) return [];
  return legacy.map((entry) => {
    const phase = entry.pricingPhases?.pricingPhaseList?.[0];
    const playOfferId = entry.offerId ?? null;
    return {
      basePlanIdAndroid: entry.basePlanId || null,
      // Preserve openiap-compatible id fallback for callers that only read `id`.
      id: playOfferId || entry.basePlanId || "",
      playOfferId,
      offerTokenAndroid: entry.offerToken || null,
      displayPrice: phase?.formattedPrice || "",
      currency: phase?.priceCurrencyCode || null,
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
