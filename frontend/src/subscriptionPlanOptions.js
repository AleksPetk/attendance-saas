/**
 * Pure helpers for Account → Subscription plan organization.
 * Pricing and eligibility come from the billing API — never recalculate discounts.
 *
 * Commercial plan selection uses subscribed_plan + commercial subscription state,
 * NOT effective_plan / built-in Business trial entitlement.
 */

import {
  findOffer,
  intervalPromotion,
  promotionOffers,
} from "./promotionCatalog.js";
import i18n from "./i18n/index.js";
import { translatePlanName } from "./i18n/plans.js";

export function effectivePlanKey(billing, sessionPlanKey = null) {
  return (
    billing?.effective_plan?.key ||
    sessionPlanKey ||
    billing?.subscribed_plan?.key ||
    null
  );
}

/**
 * Commercial subscribed plan for option cards.
 * Built-in Business trial: always commercially Basic (ignore subscribed_plan /
 * future_paid_plan for upgrade/downgrade classification).
 * Cancel-at-period-end during Stripe trialing is commercially Basic (reselection).
 */
export function commercialPlanKey(billing) {
  if (billing?.builtin_trial?.active) {
    return null;
  }
  if (billing?.cancel_at_period_end && billing?.status === "trialing") {
    return null;
  }
  const key = billing?.subscribed_plan?.key;
  if (key === "plus" || key === "business") return key;
  return null;
}

/** Future paid plan chosen during the built-in trial (not commercial yet). */
export function futurePaidPlanSelection(billing) {
  if (!billing?.builtin_trial?.active) return null;
  const future = billing?.future_paid_plan;
  if (future?.key === "plus" || future?.key === "business") {
    if (future.interval === "monthly" || future.interval === "yearly") {
      return { plan: future.key, interval: future.interval };
    }
  }
  return null;
}

export function isBuiltinTrialSelectionMode(billing) {
  return Boolean(billing?.builtin_trial?.active);
}

export function effectiveBillingInterval(billing) {
  const interval = billing?.interval;
  if (interval === "monthly" || interval === "yearly") return interval;
  return null;
}

export function commercialBillingInterval(billing) {
  if (!commercialPlanKey(billing)) return null;
  return effectiveBillingInterval(billing);
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
          ? i18n.t("billing:promoDiscount.percentOff", {
              percent: intervalPromo.discount_percent,
              duration: i18n.t(
                intervalPromo.applies_to === "first_year"
                  ? "billing:promoDiscount.firstYear"
                  : "billing:promoDiscount.firstMonth",
              ),
            })
          : null,
      checkoutApplies: Boolean(intervalPromo.checkout_applies_promotion),
      offerId: intervalPromo.offer_id || null,
    };
  }

  if (offer?.promotional_formatted) {
    const unit = interval === "yearly" ? "year" : "month";
    const percent =
      offer.discount_percent ?? offer.marketing_discount_percent ?? null;
    const applies =
      offer.duration_label === "first_year" || interval === "yearly"
        ? "first_year"
        : "first_month";
    return {
      promotional: true,
      firstPeriodFormatted: offer.promotional_formatted,
      firstPeriodWithInterval: `${offer.promotional_formatted}/${unit}`,
      renewsAtFormatted: offer.renews_at_formatted || listFormatted,
      renewsAtWithInterval: offer.renews_at_formatted
        ? `${offer.renews_at_formatted}/${unit}`
        : listWithInterval,
      listWithInterval,
      discountPercent: percent,
      label:
        typeof percent === "number"
          ? i18n.t("billing:promoDiscount.percentOff", {
              percent,
              duration: i18n.t(
                applies === "first_year"
                  ? "billing:promoDiscount.firstYear"
                  : "billing:promoDiscount.firstMonth",
              ),
            })
          : offer.label || null,
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
  const fallback =
    planKey === "basic"
      ? billing?.catalog?.basic?.display_name || "Basic"
      : billing?.catalog?.plans?.[planKey]?.display_name ||
        (planKey ? planKey.charAt(0).toUpperCase() + planKey.slice(1) : "Plan");
  return translatePlanName((key, opts) => i18n.t(key, opts), planKey, fallback);
}

export function intervalNoun(interval) {
  return interval === "yearly"
    ? i18n.t("billing:interval.yearly")
    : i18n.t("billing:interval.monthly");
}

export function upgradeActionLabel({ currentPlan, targetPlan, targetInterval }) {
  if (currentPlan === targetPlan) {
    return targetInterval === "yearly"
      ? i18n.t("billing:upgrade.switchYearly")
      : i18n.t("billing:upgrade.switchMonthly");
  }
  if (targetPlan === "business" && targetInterval === "yearly" && currentPlan === "plus") {
    return i18n.t("billing:upgrade.upgradeBusinessYearly");
  }
  if (targetPlan === "plus" && targetInterval === "yearly") {
    return i18n.t("billing:upgrade.upgradePlusYearly");
  }
  if (targetPlan === "business" && targetInterval === "monthly") {
    return i18n.t("billing:upgrade.upgradeBusiness");
  }
  if (targetPlan === "business") {
    return i18n.t("billing:upgrade.upgradeBusiness");
  }
  if (targetPlan === "plus") {
    return currentPlan === "business"
      ? i18n.t("billing:upgrade.switchToPlan", {
          plan: planDisplayName(null, targetPlan),
          interval: intervalNoun(targetInterval),
        })
      : i18n.t("billing:upgrade.choosePlus", { interval: intervalNoun(targetInterval) });
  }
  return i18n.t("billing:upgrade.switchToPlan", {
    plan: planDisplayName(null, targetPlan),
    interval: intervalNoun(targetInterval),
  });
}

function sortUpgradeOptions(options) {
  return [...options].sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    return String(a.id).localeCompare(String(b.id));
  });
}

function pushCheckoutPair(options, billing, actions, pushOption) {
  for (const iv of ["monthly", "yearly"]) {
    pushOption({
      id: `checkout-plus-${iv}`,
      plan: "plus",
      interval: iv,
      kind: "checkout",
      recommended: Boolean(targetOfferPricing(billing, "plus", iv).promotional),
      enabled: Boolean(actions.can_checkout_plus),
      actionLabel: i18n.t("billing:upgrade.choosePlus", { interval: intervalNoun(iv) }),
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
      actionLabel: i18n.t("billing:upgrade.chooseBusiness", {
        interval: intervalNoun(iv),
      }),
    });
  }
}

/**
 * Build ordered Upgrade Plan cards from commercial subscribed state + actions.
 * Does not include Basic (cancel is the only path to Basic).
 * During built-in trial: always four future-paid checkout choices.
 */
export function buildUpgradePlanOptions(billing, sessionPlanKey = null) {
  void sessionPlanKey;
  const actions = billing?.actions || {};
  const plan = commercialPlanKey(billing);
  const interval = commercialBillingInterval(billing);
  const options = [];
  const futureSelection = futurePaidPlanSelection(billing);
  const trialSelection = isBuiltinTrialSelectionMode(billing);

  function pushOption(partial) {
    const pricing = targetOfferPricing(billing, partial.plan, partial.interval);
    const isSelectedFuture =
      trialSelection &&
      futureSelection &&
      futureSelection.plan === partial.plan &&
      futureSelection.interval === partial.interval;
    options.push({
      ...partial,
      pricing,
      recommended: Boolean(partial.recommended || pricing.promotional),
      selectedFuture: Boolean(isSelectedFuture),
      title: `${planDisplayName(billing, partial.plan)} ${intervalNoun(partial.interval)}`,
      actionLabel: isSelectedFuture
        ? i18n.t("billing:trialSelection.selected")
        : trialSelection
          ? i18n.t(
              partial.plan === "business"
                ? "billing:trialSelection.chooseBusiness"
                : "billing:trialSelection.choosePlus",
              { interval: intervalNoun(partial.interval) },
            )
          : partial.actionLabel ||
            upgradeActionLabel({
              currentPlan: plan,
              targetPlan: partial.plan,
              targetInterval: partial.interval,
            }),
    });
  }

  // Built-in trial or commercially Basic: four paid checkout choices.
  if (trialSelection || !plan) {
    pushCheckoutPair(options, billing, actions, pushOption);
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
        actionLabel: i18n.t("billing:upgrade.upgradeBusiness"),
      });
    }
    return sortUpgradeOptions(options);
  }

  if (plan === "plus" && interval === "yearly") {
    if (actions.can_schedule_billing_change || actions.can_change_interval) {
      pushOption({
        id: "plus-monthly-switch",
        plan: "plus",
        interval: "monthly",
        kind: "schedule",
        recommended: false,
        enabled: true,
        actionLabel: i18n.t("billing:upgrade.switchMonthly"),
      });
    }
    if (actions.can_upgrade_to_business) {
      pushOption({
        id: "business-yearly-upgrade",
        plan: "business",
        interval: "yearly",
        kind: "immediate_upgrade",
        recommended: false,
        enabled: true,
        actionLabel: i18n.t("billing:upgrade.upgradeBusiness"),
      });
    }
    // Approved matrix: Plus Yearly does not offer Business Monthly.
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
        actionLabel: i18n.t("billing:upgrade.switchBusinessYearly"),
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
        actionLabel: i18n.t("billing:upgrade.switchMonthly"),
      });
    }
    return sortUpgradeOptions(options);
  }

  return options;
}

/**
 * Downgrade cards for paid commercial plans.
 * Basic is never a card — Cancel subscription is the only path to Basic.
 */
export function buildDowngradePlanOptions(billing, sessionPlanKey = null) {
  void sessionPlanKey;
  const actions = billing?.actions || {};
  const plan = commercialPlanKey(billing);
  const interval = commercialBillingInterval(billing) || "monthly";
  const options = [];

  if (plan === "business" && actions.can_schedule_downgrade_to_plus) {
    options.push({
      id: "downgrade-plus",
      plan: "plus",
      interval,
      kind: "downgrade_plus",
      title: `${planDisplayName(billing, "plus")} ${intervalNoun(interval)}`,
      actionLabel: i18n.t("billing:downgrade.toPlus"),
      enabled: true,
      pricing: targetOfferPricing(billing, "plus", interval),
    });
  }

  return options;
}

/** Highest commercial plan only — never from built-in Business trial alone. */
export function isHighestPaidPlan(billing, sessionPlanKey = null) {
  void sessionPlanKey;
  return commercialPlanKey(billing) === "business";
}
