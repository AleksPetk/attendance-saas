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

function localizedCapacityBoost(higher, base, translate, timesKey, countKey, englishLabel) {
  if (typeof translate === "function") {
    const times = exactCapacityMultiplier(higher, base);
    if (times) return translate(timesKey, { times });
    if (higher != null && Number.isFinite(Number(higher))) {
      return translate(countKey, { count: Number(higher) });
    }
    return null;
  }
  return capacityBoostLabel(higher, base, englishLabel);
}

/**
 * @param {object} catalog
 * @param {string} planKey
 * @param {(key: string, values?: object) => string} [translate] optional promo `t`
 */
export function pricingFeatureList(catalog, planKey, translate) {
  const limits = planEntitlementLimits(catalog, planKey) || {};
  const features = planEntitlementFeatures(catalog, planKey) || {};
  const plusLimits = planEntitlementLimits(catalog, "plus") || {};
  const tr = typeof translate === "function" ? translate : null;

  if (planKey === "basic") {
    const groups = limitValue(limits, LIMIT_ACTIVE_STANDARD_GROUPS);
    const members = limitValue(limits, LIMIT_MEMBERS);
    const items = [];
    if (groups != null) {
      items.push(
        tr
          ? tr("pricing.features.activeGroups", { count: groups })
          : `${groups} active Groups`,
      );
    }
    if (members != null) {
      items.push(
        tr ? tr("pricing.features.members", { count: members }) : `${members} Members`,
      );
    }
    items.push(
      tr ? tr("pricing.features.kioskCheckIn") : "Kiosk check-in",
      tr ? tr("pricing.features.actionHistory") : "Action history",
    );
    if (features.ads_required) {
      items.push(tr ? tr("pricing.features.adsSupported") : "Ads supported");
    }
    return items;
  }

  if (planKey === "plus") {
    const groups = limitValue(limits, LIMIT_ACTIVE_STANDARD_GROUPS);
    const members = limitValue(limits, LIMIT_MEMBERS);
    const items = [
      tr ? tr("pricing.features.everythingInBasic") : "Everything in Basic",
    ];
    if (groups != null && members != null) {
      items.push(
        tr
          ? tr("pricing.features.groupsAndMembers", { groups, members })
          : `${groups} active Groups / ${members} Members`,
      );
    } else if (groups != null) {
      items.push(
        tr
          ? tr("pricing.features.activeGroups", { count: groups })
          : `${groups} active Groups`,
      );
    } else if (members != null) {
      items.push(
        tr ? tr("pricing.features.members", { count: members }) : `${members} Members`,
      );
    }
    if (features.staff_management) {
      items.push(
        tr ? tr("pricing.features.staffManagement") : "Workspace Staff management",
      );
    }
    if (features.report_export_csv) {
      items.push(tr ? tr("pricing.features.reportExport") : "Attendance Report export");
    }
    if (features.group_forward_emails) {
      items.push(tr ? tr("pricing.features.groupForwardEmails") : "Group Forward Emails");
    }
    if (features.ads_required === false) {
      items.push(tr ? tr("pricing.features.noAds") : "No ads");
    }
    return items;
  }

  const items = [tr ? tr("pricing.features.everythingInPlus") : "Everything in Plus"];
  if (features.structured_groups) {
    items.push(tr ? tr("pricing.features.structuredGroups") : "Structured Groups");
  }

  const groupBoost = localizedCapacityBoost(
    limitValue(limits, LIMIT_ACTIVE_STANDARD_GROUPS),
    limitValue(plusLimits, LIMIT_ACTIVE_STANDARD_GROUPS),
    tr,
    "pricing.features.groupCapacityTimes",
    "pricing.features.groupCapacityCount",
    "Group capacity",
  );
  const memberBoost = localizedCapacityBoost(
    limitValue(limits, LIMIT_MEMBERS),
    limitValue(plusLimits, LIMIT_MEMBERS),
    tr,
    "pricing.features.memberCapacityTimes",
    "pricing.features.memberCapacityCount",
    "Member capacity",
  );
  const adminBoost = localizedCapacityBoost(
    limitValue(limits, LIMIT_WORKSPACE_ADMINS),
    limitValue(plusLimits, LIMIT_WORKSPACE_ADMINS),
    tr,
    "pricing.features.adminSeatsTimes",
    "pricing.features.adminSeatsCount",
    "Admin seats",
  );
  const staffBoost = localizedCapacityBoost(
    limitValue(limits, LIMIT_WORKSPACE_STAFF),
    limitValue(plusLimits, LIMIT_WORKSPACE_STAFF),
    tr,
    "pricing.features.staffSeatsTimes",
    "pricing.features.staffSeatsCount",
    "Staff seats",
  );
  for (const line of [groupBoost, memberBoost, adminBoost, staffBoost]) {
    if (line) items.push(line);
  }
  if (features.structured_snapshot_import) {
    items.push(
      tr
        ? tr("pricing.features.structuredSnapshotImport")
        : "Structured snapshot import",
    );
  }
  return items;
}

export function isPaidCommercialPlan(planKey) {
  return PAID_PLAN_KEYS.has(planKey);
}

/**
 * @param {string} planKey
 * @param {{ signedIn: boolean, canOpenSubscription: boolean, currentPlanKey: string|null }} options
 * @param {{ getStartedFree?: string, choosePlus?: string, goBusiness?: string, manageSubscription?: string }} [labels]
 */
export function pricingCta(planKey, { signedIn, canOpenSubscription, currentPlanKey }, labels = null) {
  const showManageOnBasic =
    planKey === "basic" &&
    Boolean(canOpenSubscription) &&
    isPaidCommercialPlan(currentPlanKey);

  const L = labels && typeof labels === "object" ? labels : {};
  let label = L.getStartedFree || "Get Started Free";
  if (planKey === "plus") label = L.choosePlus || "Choose Plus";
  else if (planKey === "business") label = L.goBusiness || "Go Business";
  else if (showManageOnBasic) label = L.manageSubscription || "Manage subscription";

  const to = canOpenSubscription
    ? "/account/subscription"
    : signedIn
      ? "/account/security"
      : "/register";

  return { label, to };
}
