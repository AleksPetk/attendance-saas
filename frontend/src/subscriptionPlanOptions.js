/**
 * Pure helpers for Account → Subscription plan organization.
 * Pricing and eligibility come from the billing API — never recalculate discounts.
 */

import {
  findOffer,
  intervalPromotion,
  promotionOffers,
} from "./promotionCatalog.js";

export function effectivePlanKey(billing, sessionPlanKey = null) {
  return (
    billing?.effective_plan?.key ||
    sessionPlanKey ||
    billing?.subscribed_plan?.key ||
    null
  );
}

export function effectiveBillingInterval(billing) {
  const interval = billing?.interval;
  if (interval === "monthly" || interval === "yearly") return interval;
  return null;
}

/**
 * True only when card plan+interval matches the workspace's effective plan
 * and currently active billing interval. Never uses browsing selectors or
 * pending/scheduled targets.
 */
export function isEffectiveCurrentPlanOption(
  billing,
  planKey,
  interval = null,
  sessionPlanKey = null,
) {
  const effective = effectivePlanKey(billing, sessionPlanKey);
  if (!effective || !planKey) return false;
  if (effective !== planKey) return false;
  if (planKey === "basic") return true;
  const actualInterval = effectiveBillingInterval(billing);
  if (!actualInterval || !interval) return false;
  return actualInterval === interval;
}

export function catalogListPrice(billing, planKey, interval) {
  return billing?.catalog?.plans?.[planKey]?.intervals?.[interval]?.formatted || null;
}

export function catalogListPriceWithInterval(billing, planKey, interval) {
  const amount = catalogListPrice(billing, planKey, interval);
  if (!amount) return null;
  return `${amount}/${interval === "yearly" ? "year" : "month"}`;
}

/** First-period + renewal display from catalog interval promo or offers[]. */
export function targetOfferPricing(billing, planKey, interval) {
  const catalog = billing?.catalog;
  const listFormatted = catalogListPrice(billing, planKey, interval);
  const listWithInterval = catalogListPriceWithInterval(billing, planKey, interval);
  const intervalPromo = intervalPromotion(catalog, planKey, interval);
  const offer = findOffer(catalog, { plan: planKey, interval });

  if (intervalPromo?.active && intervalPromo.first_period_formatted) {
    const unit = interval === "yearly" ? "year" : "month";
    return {
      promotional: true,
      firstPeriodFormatted: intervalPromo.first_period_formatted,
      firstPeriodWithInterval: `${intervalPromo.first_period_formatted}/${unit}`,
      renewsAtFormatted: intervalPromo.renews_at_formatted || listFormatted,
      renewsAtWithInterval: intervalPromo.renews_at_formatted
        ? `${intervalPromo.renews_at_formatted}/${unit}`
        : listWithInterval,
      listWithInterval,
      discountPercent: intervalPromo.discount_percent ?? null,
      label:
        typeof intervalPromo.discount_percent === "number"
          ? `${intervalPromo.discount_percent}% off ${
              intervalPromo.applies_to === "first_year" ? "first year" : "first month"
            }`
          : null,
      checkoutApplies: Boolean(intervalPromo.checkout_applies_promotion),
      offerId: intervalPromo.offer_id || null,
    };
  }

  if (offer?.promotional_formatted) {
    const unit = interval === "yearly" ? "year" : "month";
    return {
      promotional: true,
      firstPeriodFormatted: offer.promotional_formatted,
      firstPeriodWithInterval: `${offer.promotional_formatted}/${unit}`,
      renewsAtFormatted: offer.renews_at_formatted || listFormatted,
      renewsAtWithInterval: offer.renews_at_formatted
        ? `${offer.renews_at_formatted}/${unit}`
        : listWithInterval,
      listWithInterval,
      discountPercent:
        offer.discount_percent ?? offer.marketing_discount_percent ?? null,
      label: offer.label || null,
      checkoutApplies: Boolean(offer.checkout_applies_promotion),
      offerId: offer.id || null,
    };
  }

  return {
    promotional: false,
    firstPeriodFormatted: listFormatted,
    firstPeriodWithInterval: listWithInterval,
    renewsAtFormatted: listFormatted,
    renewsAtWithInterval: listWithInterval,
    listWithInterval,
    discountPercent: null,
    label: null,
    checkoutApplies: false,
    offerId: null,
  };
}

export function planDisplayName(billing, planKey) {
  if (planKey === "basic") {
    return billing?.catalog?.basic?.display_name || "Basic";
  }
  return (
    billing?.catalog?.plans?.[planKey]?.display_name ||
    (planKey ? planKey.charAt(0).toUpperCase() + planKey.slice(1) : "Plan")
  );
}

export function intervalNoun(interval) {
  return interval === "yearly" ? "Yearly" : "Monthly";
}

export function upgradeActionLabel({ currentPlan, targetPlan, targetInterval }) {
  if (currentPlan === targetPlan) {
    return targetInterval === "yearly"
      ? "Switch to Yearly Billing"
      : "Switch to Monthly Billing";
  }
  if (targetPlan === "business" && targetInterval === "yearly" && currentPlan === "plus") {
    return "Upgrade to Business Yearly";
  }
  if (targetPlan === "plus" && targetInterval === "yearly") {
    return "Upgrade to Plus Yearly";
  }
  if (targetPlan === "business" && targetInterval === "monthly") {
    return "Upgrade to Business";
  }
  if (targetPlan === "business") {
    return "Upgrade to Business";
  }
  if (targetPlan === "plus") {
    return currentPlan === "business"
      ? `Switch to Plus ${intervalNoun(targetInterval)}`
      : `Choose Plus ${intervalNoun(targetInterval)}`;
  }
  return `Switch to ${planDisplayName(null, targetPlan)} ${intervalNoun(targetInterval)}`;
}

function sortUpgradeOptions(options) {
  return [...options].sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Build ordered Upgrade Plan cards from billing actions + catalog offers.
 * Does not include downgrades or Basic for paid workspaces.
 */
export function buildUpgradePlanOptions(billing, sessionPlanKey = null) {
  const actions = billing?.actions || {};
  const plan = effectivePlanKey(billing, sessionPlanKey);
  const interval = effectiveBillingInterval(billing);
  const options = [];

  function pushOption(partial) {
    const pricing = targetOfferPricing(billing, partial.plan, partial.interval);
    options.push({
      ...partial,
      pricing,
      recommended: Boolean(partial.recommended || pricing.promotional),
      title: `${planDisplayName(billing, partial.plan)} ${intervalNoun(partial.interval)}`,
      actionLabel:
        partial.actionLabel ||
        upgradeActionLabel({
          currentPlan: plan,
          targetPlan: partial.plan,
          targetInterval: partial.interval,
        }),
    });
  }

  const unpaid =
    plan === "basic" ||
    (!interval &&
      (actions.can_checkout_plus ||
        actions.can_checkout_business ||
        actions.can_start_trial));

  if (unpaid) {
    for (const iv of ["monthly", "yearly"]) {
      pushOption({
        id: `checkout-plus-${iv}`,
        plan: "plus",
        interval: iv,
        kind: "checkout",
        recommended: Boolean(targetOfferPricing(billing, "plus", iv).promotional),
        enabled: Boolean(actions.can_checkout_plus),
        actionLabel: `Choose Plus ${intervalNoun(iv)}`,
      });
    }
    for (const iv of ["monthly", "yearly"]) {
      pushOption({
        id: `checkout-business-${iv}`,
        plan: "business",
        interval: iv,
        kind: "checkout",
        recommended: Boolean(targetOfferPricing(billing, "business", iv).promotional),
        enabled: Boolean(actions.can_checkout_business),
        showTrial: Boolean(actions.can_start_trial),
        actionLabel: `Choose Business ${intervalNoun(iv)}`,
      });
    }
    return sortUpgradeOptions(options);
  }

  if (plan === "plus" && interval === "monthly") {
    const offers = promotionOffers(billing?.catalog);
    for (const offer of offers) {
      if (offer.target_interval !== "yearly") continue;
      if (!["plus", "business"].includes(offer.target_plan)) continue;
      pushOption({
        id: offer.id,
        plan: offer.target_plan,
        interval: "yearly",
        kind: "schedule",
        recommended: true,
        enabled: Boolean(actions.can_schedule_billing_change),
      });
    }
    if (!options.some((o) => o.plan === "plus" && o.interval === "yearly")) {
      if (actions.can_schedule_billing_change || actions.can_change_interval) {
        pushOption({
          id: "plus-yearly",
          plan: "plus",
          interval: "yearly",
          kind: "schedule",
          recommended: false,
          enabled: Boolean(
            actions.can_schedule_billing_change || actions.can_change_interval,
          ),
        });
      }
    }
    if (!options.some((o) => o.plan === "business" && o.interval === "yearly")) {
      if (actions.can_schedule_billing_change) {
        pushOption({
          id: "business-yearly",
          plan: "business",
          interval: "yearly",
          kind: "schedule",
          recommended: false,
          enabled: Boolean(actions.can_schedule_billing_change),
        });
      }
    }
    if (actions.can_upgrade_to_business) {
      pushOption({
        id: "business-monthly-upgrade",
        plan: "business",
        interval: "monthly",
        kind: "immediate_upgrade",
        recommended: false,
        enabled: true,
        actionLabel: "Upgrade to Business",
      });
    }
    return sortUpgradeOptions(options);
  }

  if (plan === "plus" && interval === "yearly") {
    if (actions.can_upgrade_to_business) {
      pushOption({
        id: "business-yearly-upgrade",
        plan: "business",
        interval: "yearly",
        kind: "immediate_upgrade",
        recommended: false,
        enabled: true,
        actionLabel: "Upgrade to Business",
      });
    }
    if (actions.can_schedule_billing_change) {
      pushOption({
        id: "business-monthly-schedule",
        plan: "business",
        interval: "monthly",
        kind: "schedule",
        recommended: false,
        enabled: true,
        actionLabel: "Upgrade to Business Monthly",
      });
    }
    return sortUpgradeOptions(options);
  }

  if (plan === "business" && interval === "monthly") {
    if (actions.can_schedule_billing_change || actions.can_change_interval) {
      pushOption({
        id: "business-yearly-switch",
        plan: "business",
        interval: "yearly",
        kind: "schedule",
        recommended: Boolean(
          targetOfferPricing(billing, "business", "yearly").promotional,
        ),
        enabled: true,
        actionLabel: "Switch to Business Yearly",
      });
    }
    return sortUpgradeOptions(options);
  }

  if (plan === "business" && interval === "yearly") {
    if (actions.can_schedule_billing_change || actions.can_change_interval) {
      pushOption({
        id: "business-monthly-switch",
        plan: "business",
        interval: "monthly",
        kind: "schedule",
        recommended: false,
        enabled: true,
        actionLabel: "Switch to Monthly Billing",
      });
    }
    return sortUpgradeOptions(options);
  }

  return options;
}

export function buildDowngradePlanOptions(billing, sessionPlanKey = null) {
  const actions = billing?.actions || {};
  const plan = effectivePlanKey(billing, sessionPlanKey);
  const interval = effectiveBillingInterval(billing) || "monthly";
  const options = [];

  if (plan === "business") {
    if (actions.can_schedule_downgrade_to_plus) {
      options.push({
        id: "downgrade-plus",
        plan: "plus",
        interval,
        kind: "downgrade_plus",
        title: `Plus ${intervalNoun(interval)}`,
        actionLabel: "Downgrade to Plus",
        enabled: true,
        pricing: targetOfferPricing(billing, "plus", interval),
      });
    }
    if (actions.can_cancel) {
      options.push({
        id: "downgrade-basic",
        plan: "basic",
        interval: null,
        kind: "cancel_to_basic",
        title: planDisplayName(billing, "basic"),
        actionLabel: "Move to Basic",
        enabled: true,
        pricing: {
          promotional: false,
          firstPeriodWithInterval: "Free",
          listWithInterval: "Free",
        },
      });
    }
  }

  if (plan === "plus" && actions.can_cancel) {
    options.push({
      id: "downgrade-basic",
      plan: "basic",
      interval: null,
      kind: "cancel_to_basic",
      title: planDisplayName(billing, "basic"),
      actionLabel: "Move to Basic",
      enabled: true,
      pricing: {
        promotional: false,
        firstPeriodWithInterval: "Free",
        listWithInterval: "Free",
      },
    });
  }

  return options;
}

export function isHighestPaidPlan(billing, sessionPlanKey = null) {
  return effectivePlanKey(billing, sessionPlanKey) === "business";
}
