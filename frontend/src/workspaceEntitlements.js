/** Plan entitlement helpers — UI hints only; backend remains authoritative. */

import i18n from "./i18n/index.js";

export function entitlementsFromSession(session) {
  return session?.workspace?.entitlements || null;
}

export function workspacePlanKey(session) {
  return entitlementsFromSession(session)?.plan?.key || "basic";
}

export function workspacePlanDisplayName(session) {
  const entitlements = entitlementsFromSession(session);
  return entitlements?.plan?.display_name || "Basic";
}

export function hasPlanFeature(session, featureKey) {
  const features = entitlementsFromSession(session)?.features;
  if (!features || !(featureKey in features)) return false;
  return Boolean(features[featureKey]);
}

export function planLimitValue(session, limitKey) {
  const limits = entitlementsFromSession(session)?.limits;
  if (!limits || !(limitKey in limits)) return null;
  const value = limits[limitKey];
  return typeof value === "number" ? value : null;
}

export function planUsageValue(session, limitKey) {
  const usage = entitlementsFromSession(session)?.usage;
  if (!usage || !(limitKey in usage)) return null;
  const value = usage[limitKey];
  return typeof value === "number" ? value : null;
}

export function usageTotalValue(session, key) {
  const totals = entitlementsFromSession(session)?.usage_totals;
  if (!totals || !(key in totals)) return planUsageValue(session, key);
  const value = totals[key];
  return typeof value === "number" ? value : planUsageValue(session, key);
}

/** Clear capacity wording: "4 active records · 0 of 2 available" */
export function groupsCapacityCaption(session, limitKey, recordLabel) {
  const total = usageTotalValue(session, limitKey);
  const unlocked = planUsageValue(session, limitKey);
  const limit = planLimitValue(session, limitKey);
  if (total == null || unlocked == null || limit == null) return "";
  return i18n.t("entitlements:capacity.recordsAvailable", {
    total,
    unlocked,
    limit,
    recordWord: total === 1 ? i18n.t("entitlements:capacity.record") : i18n.t("entitlements:capacity.records"),
  });
}

export function selectionRequired(session, kind) {
  return Boolean(entitlementsFromSession(session)?.selection_required?.[kind]);
}

export function anySelectionRequired(session) {
  const required = entitlementsFromSession(session)?.selection_required;
  return Boolean(required && Object.values(required).some(Boolean));
}

export function planLocksFromSession(session) {
  return entitlementsFromSession(session)?.plan_locks || {};
}

export function formatUsageLimit(usage, limit) {
  if (usage == null || limit == null) return "";
  return i18n.t("entitlements:usageOf", { usage, limit });
}

export function usageLimitCaption(session, limitKey, label) {
  const usage = usageTotalValue(session, limitKey);
  const limit = planLimitValue(session, limitKey);
  if (usage == null || limit == null) return "";
  return `${formatUsageLimit(usage, limit)} ${label}`;
}

export function isOverPlanLimit(session) {
  return Boolean(entitlementsFromSession(session)?.is_over_limit);
}

export function overLimitItems(session) {
  const items = entitlementsFromSession(session)?.over_limit;
  return Array.isArray(items) ? items : [];
}

/** Role can manage staff AND plan includes staff_management. */
export function canAccessStaffManagement(session, roleCanManageStaff) {
  return Boolean(roleCanManageStaff) && hasPlanFeature(session, "staff_management");
}

/** Show Staff nav as locked upgrade affordance (role ok, plan locked). */
export function shouldShowLockedStaffNav(session, roleCanManageStaff) {
  return Boolean(roleCanManageStaff) && !hasPlanFeature(session, "staff_management");
}

export function canCreateStructuredGroups(session) {
  return hasPlanFeature(session, "structured_groups");
}

export function canUseGroupForwardEmails(session) {
  return hasPlanFeature(session, "group_forward_emails");
}

export function canExportReportFormat(session, format) {
  const key =
    format === "csv"
      ? "report_export_csv"
      : format === "xlsx"
        ? "report_export_excel"
        : format === "pdf"
          ? "report_export_pdf"
          : null;
  if (!key) return false;
  return hasPlanFeature(session, key);
}

export function canExportAnyReport(session) {
  return (
    canExportReportFormat(session, "csv") ||
    canExportReportFormat(session, "xlsx") ||
    canExportReportFormat(session, "pdf")
  );
}

/** Plan-level ads flag only. Effective ads also require the platform kill switch. */
export function workspaceRequiresAds(session) {
  return hasPlanFeature(session, "ads_required");
}

export function usageLabel(limitKey) {
  return i18n.t(`entitlements:usageLabels.${limitKey}`, { defaultValue: limitKey });
}

export const USAGE_LABELS = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      return usageLabel(prop);
    },
  },
);

export function subscriptionUsageRows(entitlements) {
  if (!entitlements?.limits || !entitlements?.usage) return [];
  const planKey = entitlements.plan?.key || "basic";
  const lockedCounts = entitlements.plan_locks?.locked_counts || {};
  const structuredLocked = Number(entitlements.plan_locks?.structured_locked_count || 0);
  const totals = entitlements.usage_totals || {};

  function lockedFor(key) {
    if (key === "active_structured_groups") {
      return Number(lockedCounts[key] || 0) || structuredLocked;
    }
    return Number(lockedCounts[key] || 0);
  }

  function totalFor(key) {
    if (typeof totals[key] === "number") return totals[key];
    if (typeof entitlements.usage[key] === "number") return entitlements.usage[key];
    return null;
  }

  const rows = [
    {
      key: "active_standard_groups",
      label:
        planKey === "business"
          ? usageLabel("active_standard_groups")
          : usageLabel("groups"),
    },
  ];
  const showStructured =
    planKey === "business" ||
    entitlements.limits.active_structured_groups > 0 ||
    lockedFor("active_structured_groups") > 0 ||
    Number(totals.active_structured_groups || 0) > 0;
  if (showStructured) {
    rows.push({ key: "active_structured_groups", label: usageLabel("active_structured_groups") });
  }
  rows.push(
    { key: "archived_groups", label: usageLabel("archived_groups") },
    { key: "members", label: usageLabel("members") },
  );
  const showStaff =
    Boolean(entitlements.features?.staff_management) ||
    lockedFor("workspace_admins") > 0 ||
    lockedFor("workspace_staff") > 0 ||
    Number(totals.workspace_admins || 0) > 0 ||
    Number(totals.workspace_staff || 0) > 0;
  if (showStaff) {
    rows.push(
      { key: "workspace_admins", label: usageLabel("workspace_admins") },
      { key: "workspace_staff", label: usageLabel("workspace_staff") },
    );
  }
  return rows
    .map(({ key, label }) => {
      const total = totalFor(key);
      const unlocked =
        typeof entitlements.usage?.[key] === "number" ? entitlements.usage[key] : total;
      const locked = lockedFor(key);
      const limit = entitlements.limits[key];
      if (typeof total !== "number" || typeof limit !== "number") return null;
      const hasLockState = locked > 0 || total !== unlocked;
      let display = i18n.t("entitlements:usageOf", { usage: total, limit });
      let limitNote = null;
      if (hasLockState) {
        const recordWord =
          total === 1
            ? i18n.t("entitlements:capacity.record")
            : i18n.t("entitlements:capacity.records");
        display =
          locked > 0
            ? i18n.t("entitlements:capacity.recordsLocked", {
                total,
                recordWord,
                unlocked,
                locked,
              })
            : i18n.t("entitlements:capacity.recordsAvailable", {
                total,
                recordWord,
                unlocked,
                limit,
              });
        limitNote = i18n.t("entitlements:capacity.limit", { limit });
      }
      return {
        key,
        label,
        usage: total,
        limit,
        unlocked,
        locked,
        display,
        limitNote,
        over: total > limit,
      };
    })
    .filter(Boolean);
}
