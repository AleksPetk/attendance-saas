import enBilling from "../../../../frontend/src/i18n/locales/en/billing.json";
import jaBilling from "../../../../frontend/src/i18n/locales/ja/billing.json";
import enEntitlements from "../../../../frontend/src/i18n/locales/en/entitlements.json";
import jaEntitlements from "../../../../frontend/src/i18n/locales/ja/entitlements.json";

type Dict = Record<string, unknown>;
type Billing = Record<string, any>;
type BillingText = (key: string, vars?: Record<string, string | number>) => string;

export type PlanOption = {
  id: string;
  plan: string;
  interval: string;
  title: string;
  actionLabel: string;
  recommended: boolean;
  selectedFuture?: boolean;
  enabled?: boolean;
  pricing: Record<string, any>;
};

const catalogs = {
  en: { billing: enBilling as Dict, entitlements: enEntitlements as Dict },
  ja: { billing: jaBilling as Dict, entitlements: jaEntitlements as Dict },
};

export function billingTranslator(locale: "en" | "ja"): BillingText {
  const tables = catalogs[locale] || catalogs.en;
  return (key, vars) => interpolate(lookup(tables, key), vars);
}

function lookup(tables: { billing: Dict; entitlements: Dict }, key: string) {
  const [ns, ...rest] = key.split(":");
  const table = ns === "entitlements" ? tables.entitlements : tables.billing;
  const path = ns === "billing" || ns === "entitlements" ? rest.join(".").split(".") : key.split(".");
  let cursor: unknown = table;
  for (const part of path) {
    if (!cursor || typeof cursor !== "object") return key;
    cursor = (cursor as Dict)[part];
  }
  return typeof cursor === "string" ? cursor : key;
}

function interpolate(template: string, vars?: Record<string, string | number>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => String(vars?.[name] ?? ""));
}

export function catalogPromotionalText(catalog: Billing | null | undefined) {
  const setting = catalog?.promotional_text;
  if (!setting?.enabled) return "";
  const text = typeof setting.text === "string" ? setting.text : "";
  return text.trim() ? text : "";
}

export function effectivePlanKey(billing: Billing, sessionPlanKey?: string | null) {
  return billing?.effective_plan?.key || sessionPlanKey || billing?.subscribed_plan?.key || null;
}

export function isBuiltinTrialSelectionMode(billing: Billing) {
  return Boolean(billing?.builtin_trial?.active);
}

function commercialPlanKey(billing: Billing) {
  if (billing?.builtin_trial?.active) return null;
  if (billing?.cancel_at_period_end && billing?.status === "trialing") return null;
  const key = billing?.subscribed_plan?.key;
  if (key === "plus" || key === "business") return key;
  return null;
}

function futurePaidPlanSelection(billing: Billing) {
  if (!billing?.builtin_trial?.active) return null;
  const future = billing?.future_paid_plan;
  if ((future?.key === "plus" || future?.key === "business") && (future.interval === "monthly" || future.interval === "yearly")) {
    return { plan: future.key, interval: future.interval };
  }
  return null;
}

function billingInterval(billing: Billing) {
  return billing?.interval === "monthly" || billing?.interval === "yearly" ? billing.interval : null;
}

export function isEffectiveCurrentPlanOption(billing: Billing, planKey: string, interval: string | null, sessionPlanKey?: string | null) {
  const effective = effectivePlanKey(billing, sessionPlanKey);
  if (!effective || !planKey || effective !== planKey) return false;
  if (planKey === "basic") return true;
  const actual = billingInterval(billing);
  return Boolean(actual && interval && actual === interval);
}

export function catalogListPriceWithInterval(billing: Billing, planKey: string, interval: string) {
  const amount = billing?.catalog?.plans?.[planKey]?.intervals?.[interval]?.formatted || null;
  if (!amount) return null;
  return `${amount}/${interval === "yearly" ? "year" : "month"}`;
}

function catalogListPrice(billing: Billing, planKey: string, interval: string) {
  return billing?.catalog?.plans?.[planKey]?.intervals?.[interval]?.formatted || null;
}

function findOffer(catalog: Billing, plan: string, interval: string) {
  const offers = Array.isArray(catalog?.promotion?.offers) ? catalog.promotion.offers : [];
  return offers.find((offer: Billing) => offer.target_plan === plan && offer.target_interval === interval) || null;
}

function targetOfferPricing(billing: Billing, planKey: string, interval: string, text: BillingText) {
  const catalog = billing?.catalog;
  const listFormatted = catalogListPrice(billing, planKey, interval);
  const listWithInterval = catalogListPriceWithInterval(billing, planKey, interval);
  const intervalPromo = catalog?.plans?.[planKey]?.intervals?.[interval]?.promotion || null;
  const offer = findOffer(catalog, planKey, interval);
  if (intervalPromo?.active && intervalPromo.first_period_formatted) {
    const unit = interval === "yearly" ? "year" : "month";
    return {
      promotional: true,
      firstPeriodFormatted: intervalPromo.first_period_formatted,
      listWithInterval,
      renewsAtWithInterval: intervalPromo.renews_at_formatted ? `${intervalPromo.renews_at_formatted}/${unit}` : listWithInterval,
      label: typeof intervalPromo.discount_percent === "number"
        ? text("billing:promoDiscount.percentOff", { percent: intervalPromo.discount_percent, duration: text(intervalPromo.applies_to === "first_year" ? "billing:promoDiscount.firstYear" : "billing:promoDiscount.firstMonth") })
        : null,
    };
  }
  if (offer?.promotional_formatted) {
    const unit = interval === "yearly" ? "year" : "month";
    const percent = offer.discount_percent ?? offer.marketing_discount_percent ?? null;
    return {
      promotional: true,
      firstPeriodFormatted: offer.promotional_formatted,
      listWithInterval,
      renewsAtWithInterval: offer.renews_at_formatted ? `${offer.renews_at_formatted}/${unit}` : listWithInterval,
      label: typeof percent === "number"
        ? text("billing:promoDiscount.percentOff", { percent, duration: text(interval === "yearly" ? "billing:promoDiscount.firstYear" : "billing:promoDiscount.firstMonth") })
        : offer.label || null,
    };
  }
  return { promotional: false, firstPeriodFormatted: listFormatted, listWithInterval, renewsAtWithInterval: listWithInterval, label: null };
}

function planDisplayName(billing: Billing, planKey: string, text: BillingText) {
  const fallback = planKey === "basic"
    ? billing?.catalog?.basic?.display_name || "Basic"
    : billing?.catalog?.plans?.[planKey]?.display_name || (planKey ? planKey.charAt(0).toUpperCase() + planKey.slice(1) : "Plan");
  const translated = text(`entitlements:plans.${planKey}`);
  return translated.startsWith("entitlements:") ? fallback : translated;
}

function intervalNoun(interval: string, text: BillingText) {
  return text(interval === "yearly" ? "billing:interval.yearly" : "billing:interval.monthly");
}

function sortUpgradeOptions(options: PlanOption[]) {
  return [...options].sort((left, right) => {
    if (left.recommended !== right.recommended) return left.recommended ? -1 : 1;
    return String(left.id).localeCompare(String(right.id));
  });
}

export function buildUpgradePlanOptions(billing: Billing, sessionPlanKey: string | null, text: BillingText): PlanOption[] {
  const actions = billing?.actions || {};
  const plan = commercialPlanKey(billing);
  const interval = plan ? billingInterval(billing) : null;
  const options: PlanOption[] = [];
  const future = futurePaidPlanSelection(billing);
  const trial = isBuiltinTrialSelectionMode(billing);
  function pushOption(partial: Partial<PlanOption> & { plan: string; interval: string; id: string }) {
    const pricing = targetOfferPricing(billing, partial.plan, partial.interval, text);
    const selectedFuture = Boolean(trial && future && future.plan === partial.plan && future.interval === partial.interval);
    options.push({
      recommended: Boolean(partial.recommended || pricing.promotional),
      enabled: partial.enabled,
      id: partial.id,
      plan: partial.plan,
      interval: partial.interval,
      pricing,
      selectedFuture,
      title: `${planDisplayName(billing, partial.plan, text)} ${intervalNoun(partial.interval, text)}`,
      actionLabel: selectedFuture
        ? text("billing:trialSelection.selected")
        : trial
          ? text(partial.plan === "business" ? "billing:trialSelection.chooseBusiness" : "billing:trialSelection.choosePlus", { interval: intervalNoun(partial.interval, text) })
          : partial.actionLabel || text("billing:upgrade.switchToPlan", { plan: planDisplayName(billing, partial.plan, text), interval: intervalNoun(partial.interval, text) }),
    } as PlanOption);
  }
  if (trial || !plan) {
    for (const next of ["monthly", "yearly"]) {
      pushOption({ id: `checkout-plus-${next}`, plan: "plus", interval: next, recommended: Boolean(targetOfferPricing(billing, "plus", next, text).promotional), enabled: Boolean(actions.can_checkout_plus), actionLabel: text("billing:upgrade.choosePlus", { interval: intervalNoun(next, text) }) });
      pushOption({ id: `checkout-business-${next}`, plan: "business", interval: next, recommended: Boolean(targetOfferPricing(billing, "business", next, text).promotional), enabled: Boolean(actions.can_checkout_business), actionLabel: text("billing:upgrade.chooseBusiness", { interval: intervalNoun(next, text) }) });
    }
    return sortUpgradeOptions(options);
  }
  if (plan === "plus" && interval === "monthly") {
    if (actions.can_schedule_billing_change || actions.can_change_interval) pushOption({ id: "plus-yearly", plan: "plus", interval: "yearly", enabled: true });
    if (actions.can_schedule_billing_change) pushOption({ id: "business-yearly", plan: "business", interval: "yearly", enabled: true });
    if (actions.can_upgrade_to_business) pushOption({ id: "business-monthly-upgrade", plan: "business", interval: "monthly", enabled: true, actionLabel: text("billing:upgrade.upgradeBusiness") });
    return sortUpgradeOptions(options);
  }
  if (plan === "plus" && interval === "yearly") {
    if (actions.can_schedule_billing_change || actions.can_change_interval) pushOption({ id: "plus-monthly-switch", plan: "plus", interval: "monthly", enabled: true, actionLabel: text("billing:upgrade.switchMonthly") });
    if (actions.can_upgrade_to_business) pushOption({ id: "business-yearly-upgrade", plan: "business", interval: "yearly", enabled: true, actionLabel: text("billing:upgrade.upgradeBusiness") });
    return sortUpgradeOptions(options);
  }
  if (plan === "business" && interval === "monthly" && (actions.can_schedule_billing_change || actions.can_change_interval)) {
    pushOption({ id: "business-yearly-switch", plan: "business", interval: "yearly", enabled: true, recommended: Boolean(targetOfferPricing(billing, "business", "yearly", text).promotional), actionLabel: text("billing:upgrade.switchBusinessYearly") });
    return sortUpgradeOptions(options);
  }
  if (plan === "business" && interval === "yearly" && (actions.can_schedule_billing_change || actions.can_change_interval)) {
    pushOption({ id: "business-monthly-switch", plan: "business", interval: "monthly", enabled: true, actionLabel: text("billing:upgrade.switchMonthly") });
    return sortUpgradeOptions(options);
  }
  return options;
}

export function buildDowngradePlanOptions(billing: Billing, text: BillingText): PlanOption[] {
  const actions = billing?.actions || {};
  const plan = commercialPlanKey(billing);
  const interval = billingInterval(billing) || "monthly";
  if (plan !== "business" || !actions.can_schedule_downgrade_to_plus) return [];
  return [{
    id: "downgrade-plus",
    plan: "plus",
    interval,
    title: `${planDisplayName(billing, "plus", text)} ${intervalNoun(interval, text)}`,
    actionLabel: text("billing:downgrade.toPlus"),
    recommended: false,
    enabled: true,
    pricing: targetOfferPricing(billing, "plus", interval, text),
  }];
}

export function statusLabelForBilling(billing: Billing, text: BillingText) {
  if (!billing) return text("billing:status.loading");
  if (billing.payment_issue?.active) return text("billing:status.paymentGrace");
  if (billing.cancel_at_period_end) return text("billing:status.cancellationScheduled");
  if (billing.scheduled_change?.active) return text("billing:status.changeScheduled");
  if (billing.pending_plan === "plus" && billing.subscribed_plan?.key === "business") return text("billing:status.downgradeScheduled");
  if (billing.builtin_trial?.active) return text("billing:status.builtinTrial");
  if (billing.status === "trialing") return text("billing:status.trialing");
  if (billing.status === "active") return text("billing:status.active");
  if (billing.status === "canceled") return text("billing:status.ended");
  return text("billing:status.noPaidSubscription");
}

export function usageRows(entitlements: Billing | null | undefined, text: BillingText) {
  if (!entitlements?.limits || !entitlements?.usage) return [];
  const planKey = entitlements.plan?.key || "basic";
  const lockedCounts = entitlements.plan_locks?.locked_counts || {};
  const structuredLocked = Number(entitlements.plan_locks?.structured_locked_count || 0);
  const totals = entitlements.usage_totals || {};
  const lockedFor = (key: string) => key === "active_structured_groups" ? Number(lockedCounts[key] || 0) || structuredLocked : Number(lockedCounts[key] || 0);
  const totalFor = (key: string) => typeof totals[key] === "number" ? totals[key] : typeof entitlements.usage[key] === "number" ? entitlements.usage[key] : null;
  const keys = ["active_standard_groups"];
  if (planKey === "business" || entitlements.limits.active_structured_groups > 0 || lockedFor("active_structured_groups") > 0 || Number(totals.active_structured_groups || 0) > 0) keys.push("active_structured_groups");
  keys.push("archived_groups", "members");
  if (entitlements.features?.staff_management || lockedFor("workspace_admins") > 0 || lockedFor("workspace_staff") > 0) keys.push("workspace_admins", "workspace_staff");
  return keys.map((key) => {
    const total = totalFor(key);
    const limit = entitlements.limits[key];
    if (typeof total !== "number" || typeof limit !== "number") return null;
    const unlocked = typeof entitlements.usage?.[key] === "number" ? entitlements.usage[key] : total;
    const locked = lockedFor(key);
    const labelKey = key === "active_standard_groups" && planKey !== "business" ? "groups" : key;
    const label = text(`entitlements:usageLabels.${labelKey}`);
    const display = locked > 0
      ? text("entitlements:capacity.recordsLocked", { total, recordWord: text(total === 1 ? "entitlements:capacity.record" : "entitlements:capacity.records"), unlocked, locked })
      : text("entitlements:usageOf", { usage: total, limit });
    return { key, label, usage: total, limit, display, limitNote: locked > 0 ? text("entitlements:capacity.limit", { limit }) : "" };
  }).filter(Boolean) as Array<{ key: string; label: string; usage: number; limit: number; display: string; limitNote: string }>;
}

export function promotionSummary(catalog: Billing | null | undefined, text: BillingText) {
  const promo = catalog?.promotion;
  if (!promo?.active) return promo?.summary || "";
  const offers = Array.isArray(promo.offers) ? promo.offers : [];
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const offer of offers) {
    const percent = offer.discount_percent ?? offer.marketing_discount_percent;
    if (typeof percent !== "number") continue;
    const applies = offer.duration_label === "first_year" || offer.target_interval === "yearly" ? "first_year" : "first_month";
    const key = `${applies}:${percent}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(text("billing:promoDiscount.percentOff", { percent, duration: text(applies === "first_year" ? "billing:promoDiscount.firstYear" : "billing:promoDiscount.firstMonth") }));
  }
  return parts.length ? parts.join(text("billing:promoDiscount.summaryJoin")) : promo.summary || "";
}
