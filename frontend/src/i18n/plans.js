/** Translate plan keys for UI display. Does not affect billing or entitlements. */

const PLAN_KEYS = new Set(["basic", "plus", "business"]);

export function translatePlanName(t, planKey, fallback = "") {
  const key = String(planKey || "basic").toLowerCase();
  if (!PLAN_KEYS.has(key)) return fallback || key;
  return t(`entitlements:plans.${key}`, { defaultValue: fallback || key });
}
