/**
 * Read promotion display fields from the canonical billing catalog.
 * Do not hardcode discount percentages — they come from the API.
 * System-generated discount copy is localized via the caller-supplied `t`.
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

function durationAppliesKey(appliesTo) {
  if (appliesTo === "first_year") return "firstYear";
  if (appliesTo === "first_month") return "firstMonth";
  return "firstPeriod";
}

function offerAppliesTo(offer) {
  if (offer?.duration_label === "first_year" || offer?.duration_label === "first_month") {
    return offer.duration_label;
  }
  if (offer?.target_interval === "yearly") return "first_year";
  if (offer?.target_interval === "monthly") return "first_month";
  return "first_period";
}

/**
 * Format one system-generated percent-off duration phrase.
 * `t` must resolve keys: percentOff, firstMonth, firstYear, firstPeriod.
 */
export function formatPercentOffDuration(t, percent, appliesTo) {
  if (typeof percent !== "number" || !t) return null;
  const duration = t(durationAppliesKey(appliesTo));
  return t("percentOff", { percent, duration });
}

/**
 * Localized acquisition / group discount summary from structured offers.
 * Falls back to API English summary only when offers lack percentages.
 */
export function localizedPromotionSummary(catalog, t) {
  const promo = catalogPromotion(catalog);
  if (!promo) return "";
  if (!t) return promo.summary || "";
  if (!promo.active) {
    return promo.summary || "";
  }
  const offers = promotionOffers(catalog);
  const parts = [];
  const seen = new Set();
  for (const offer of offers) {
    const percent = offer.discount_percent ?? offer.marketing_discount_percent;
    if (typeof percent !== "number") continue;
    const applies = offerAppliesTo(offer);
    // Prefer unique duration buckets for New/Basic (month + year), not every plan.
    const key = `${applies}:${percent}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const phrase = formatPercentOffDuration(t, percent, applies);
    if (phrase) parts.push(phrase);
  }
  if (parts.length > 0) {
    return parts.join(t("summaryJoin"));
  }
  return promo.summary || "";
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

/**
 * Localized first-period promo note for a plan interval.
 * When `t` is omitted, returns English (tests / non-UI callers).
 */
export function promotionPriceNote(catalog, planKey, interval, t = null) {
  const translate =
    t ||
    ((key, opts) => {
      if (key === "percentOff") return `${opts.percent}% off ${opts.duration}`;
      if (key === "firstYear") return "first year";
      if (key === "firstMonth") return "first month";
      if (key === "firstPeriod") return "first period";
      if (key === "thenRenews") {
        return `${opts.phrase}, then ${opts.price}/${opts.unit}`;
      }
      if (key === "billedYearly") return "Billed yearly";
      if (key === "billedMonthly") return "Billed monthly";
      if (key === "year") return "year";
      if (key === "month") return "month";
      return key;
    });

  const promo = intervalPromotion(catalog, planKey, interval);
  if (promo?.active) {
    const applies =
      promo.applies_to === "first_year"
        ? "first_year"
        : promo.applies_to === "first_month"
          ? "first_month"
          : "first_period";
    const percent = promo.discount_percent;
    const phrase =
      typeof percent === "number"
        ? formatPercentOffDuration(translate, percent, applies)
        : null;
    const renews = promo.renews_at_formatted || null;
    const unit = interval === "yearly" ? translate("year") : translate("month");
    if (phrase && renews) {
      return translate("thenRenews", { phrase, price: renews, unit });
    }
    if (phrase) return phrase;
  }
  const offer = findOffer(catalog, { plan: planKey, interval });
  if (offer) {
    const percent = offer.discount_percent ?? offer.marketing_discount_percent;
    const phrase =
      typeof percent === "number"
        ? formatPercentOffDuration(translate, percent, offerAppliesTo(offer))
        : offer.label || null;
    const renews = offer.renews_at_formatted;
    const unit = interval === "yearly" ? translate("year") : translate("month");
    if (phrase && renews) {
      return translate("thenRenews", { phrase, price: renews, unit });
    }
    if (phrase) return phrase;
  }
  return interval === "yearly"
    ? translate("billedYearly")
    : translate("billedMonthly");
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

export function offerDisplayLines(offer, t = null) {
  if (!offer) return [];
  const percent = offer.discount_percent ?? offer.marketing_discount_percent;
  const label =
    t && typeof percent === "number"
      ? formatPercentOffDuration(t, percent, offerAppliesTo(offer))
      : offer.label;
  const lines = [label].filter(Boolean);
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
