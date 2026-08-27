/**
 * Public Pricing page helpers.
 * Limit numbers come from the billing catalog entitlements payload
 * (organizations.entitlements.catalog). Do not hardcode plan capacities here.
 */

export const LIMIT_ACTIVE_STANDARD_GROUPS = "active_standard_groups";
export const LIMIT_MEMBERS = "members";
export const LIMIT_WORKSPACE_ADMINS = "workspace_admins";
export const LIMIT_WORKSPACE_STAFF = "workspace_staff";

const PAID_PLAN_KEYS = new Set(["plus", "business"]);

export function planEntitlementLimits(catalog, planKey) {
  const limits = catalog?.entitlements?.[planKey]?.limits;
  if (!limits || typeof limits !== "object") return null;
  return limits;
}

export function planEntitlementFeatures(catalog, planKey) {
  const features = catalog?.entitlements?.[planKey]?.features;
  if (!features || typeof features !== "object") return null;
  return features;
}

export function exactCapacityMultiplier(higher, base) {
  const hi = Number(higher);
  const lo = Number(base);
  if (!Number.isFinite(hi) || !Number.isFinite(lo) || lo <= 0) return null;
  if (hi <= lo) return null;
  if (hi % lo !== 0) return null;
  return hi / lo;
}

export function capacityBoostLabel(higher, base, label) {
  const times = exactCapacityMultiplier(higher, base);
  if (times) return `${times}× ${label}`;
  if (higher != null && Number.isFinite(Number(higher))) {
    return `${Number(higher)} ${label}`;
  }
  return null;
}

function limitValue(limits, key) {
  if (!limits || !(key in limits)) return null;
  const value = Number(limits[key]);
  return Number.isFinite(value) ? value : null;
}

export function pricingFeatureList(catalog, planKey) {
  const limits = planEntitlementLimits(catalog, planKey) || {};
  const features = planEntitlementFeatures(catalog, planKey) || {};
  const plusLimits = planEntitlementLimits(catalog, "plus") || {};

  if (planKey === "basic") {
    const groups = limitValue(limits, LIMIT_ACTIVE_STANDARD_GROUPS);
    const members = limitValue(limits, LIMIT_MEMBERS);
    const items = [];
    if (groups != null) items.push(`${groups} active Groups`);
    if (members != null) items.push(`${members} Members`);
    items.push("Kiosk check-in", "Action history");
    if (features.ads_required) items.push("Ads supported");
    return items;
  }

  if (planKey === "plus") {
    const groups = limitValue(limits, LIMIT_ACTIVE_STANDARD_GROUPS);
    const members = limitValue(limits, LIMIT_MEMBERS);
    const items = ["Everything in Basic"];
    if (groups != null && members != null) {
      items.push(`${groups} active Groups / ${members} Members`);
    } else if (groups != null) {
      items.push(`${groups} active Groups`);
    } else if (members != null) {
      items.push(`${members} Members`);
    }
    if (features.staff_management) items.push("Workspace Staff management");
    if (features.report_export_csv) items.push("Attendance Report export");
    if (features.group_forward_emails) items.push("Group Forward Emails");
    if (features.ads_required === false) items.push("No ads");
    return items;
  }

  const items = ["Everything in Plus"];
  if (features.structured_groups) items.push("Structured Groups");

  const groupBoost = capacityBoostLabel(
    limitValue(limits, LIMIT_ACTIVE_STANDARD_GROUPS),
    limitValue(plusLimits, LIMIT_ACTIVE_STANDARD_GROUPS),
    "Group capacity",
  );
  const memberBoost = capacityBoostLabel(
    limitValue(limits, LIMIT_MEMBERS),
    limitValue(plusLimits, LIMIT_MEMBERS),
    "Member capacity",
  );
  const adminBoost = capacityBoostLabel(
    limitValue(limits, LIMIT_WORKSPACE_ADMINS),
    limitValue(plusLimits, LIMIT_WORKSPACE_ADMINS),
    "Admin seats",
  );
  const staffBoost = capacityBoostLabel(
    limitValue(limits, LIMIT_WORKSPACE_STAFF),
    limitValue(plusLimits, LIMIT_WORKSPACE_STAFF),
    "Staff seats",
  );
  for (const line of [groupBoost, memberBoost, adminBoost, staffBoost]) {
    if (line) items.push(line);
  }
  if (features.structured_snapshot_import) {
    items.push("Structured snapshot import");
  }
  return items;
}

export function isPaidCommercialPlan(planKey) {
  return PAID_PLAN_KEYS.has(planKey);
}

export function pricingCta(planKey, { signedIn, canOpenSubscription, currentPlanKey }) {
  const showManageOnBasic =
    planKey === "basic" &&
    Boolean(canOpenSubscription) &&
    isPaidCommercialPlan(currentPlanKey);

  let label = "Get Started Free";
  if (planKey === "plus") label = "Choose Plus";
  else if (planKey === "business") label = "Go Business";
  else if (showManageOnBasic) label = "Manage subscription";

  const to = canOpenSubscription
    ? "/account/subscription"
    : signedIn
      ? "/account/security"
      : "/register";

  return { label, to };
}
