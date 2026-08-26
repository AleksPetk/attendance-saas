/**
 * Read promotion display fields from the canonical billing catalog.
 * Do not hardcode discount percentages — they come from the API.
 */

export function catalogPromotion(catalog) {
  return catalog?.promotion || null;
}

export function promotionOffers(catalog) {
  const promo = catalogPromotion(catalog);
  return Array.isArray(promo?.offers) ? promo.offers : [];
}

export function intervalPromotion(catalog, planKey, interval) {
  return catalog?.plans?.[planKey]?.intervals?.[interval]?.promotion || null;
}

export function findOffer(catalog, { plan, interval, offerType } = {}) {
  return (
    promotionOffers(catalog).find((offer) => {
      if (plan && offer.target_plan !== plan) return false;
      if (interval && offer.target_interval !== interval) return false;
      if (offerType && offer.offer_type !== offerType) return false;
      return true;
    }) || null
  );
}

export function promotionPriceLabel(catalog, planKey, interval) {
  const intervalRow = catalog?.plans?.[planKey]?.intervals?.[interval];
  if (!intervalRow) return null;
  const promo = intervalRow.promotion;
  if (promo?.active && promo.first_period_formatted) {
    return promo.first_period_formatted;
  }
  // Group 1 acquisition only uses interval helpers; other groups use offers[].
  const offer = findOffer(catalog, { plan: planKey, interval });
  if (offer?.promotional_formatted) {
    return offer.promotional_formatted;
  }
  return intervalRow.formatted || null;
}

export function promotionPriceNote(catalog, planKey, interval) {
  const promo = intervalPromotion(catalog, planKey, interval);
  if (promo?.active) {
    const applies =
      promo.applies_to === "first_year"
        ? "first year"
        : promo.applies_to === "first_month"
          ? "first month"
          : "first period";
    const percent = promo.discount_percent;
    const renews = promo.renews_at_formatted || null;
    const percentPart =
      typeof percent === "number" ? `${percent}% off ${applies}` : `Promo ${applies}`;
    if (renews) {
      return `${percentPart}, then ${renews}/${interval === "yearly" ? "year" : "month"}`;
    }
    return percentPart;
  }
  const offer = findOffer(catalog, { plan: planKey, interval });
  if (offer?.label) {
    const renews = offer.renews_at_formatted;
    if (renews) {
      return `${offer.label}, then ${renews}/${interval === "yearly" ? "year" : "month"}`;
    }
    return offer.label;
  }
  return interval === "yearly" ? "Billed yearly" : "Billed monthly";
}

export function promotionCheckoutWarning(catalog) {
  const promo = catalogPromotion(catalog);
  if (!promo?.active) return null;
  if (promo.checkout_applies_promotion) return null;
  return (
    "Promotional pricing is shown for reference only. Checkout still charges the " +
    "normal list price until provider offers are configured."
  );
}

export function isAcquisitionPromotion(catalog) {
  const promo = catalogPromotion(catalog);
  return promo?.group === "new_basic" && Boolean(promo?.active);
}

export function offerDisplayLines(offer) {
  if (!offer) return [];
  const lines = [offer.label];
  if (offer.requires_provider_preview) {
    lines.push(
      "Amount depends on provider proration preview — not a fixed catalog price.",
    );
  } else if (offer.promotional_formatted && offer.renews_at_formatted) {
    lines.push(
      `${offer.promotional_formatted} now → renews at ${offer.renews_at_formatted}`,
    );
  }
  if (!offer.checkout_applies_promotion) {
    lines.push("Provider offer not connected yet — checkout still charges list price.");
  }
  return lines;
}
