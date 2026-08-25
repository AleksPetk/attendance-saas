/** Plan entitlement helpers — UI hints only; backend remains authoritative. */

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
  return `${total} ${recordLabel} · ${unlocked} of ${limit} available`;
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
  return `${usage} of ${limit}`;
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

export const USAGE_LABELS = {
  active_standard_groups: "Standard Groups",
  active_structured_groups: "Structured Groups",
  archived_groups: "Archived Groups",
  members: "Members",
  workspace_admins: "Workspace Admins",
  workspace_staff: "Workspace Staff",
  participants_per_standard_group: "Participants per Standard Group",
  classes_per_structured_group: "Classes per Structured Group",
  participants_per_class: "Participants per Class",
};

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
      label: planKey === "business" ? "Standard Groups" : "Groups",
    },
  ];
  const showStructured =
    planKey === "business" ||
    entitlements.limits.active_structured_groups > 0 ||
    lockedFor("active_structured_groups") > 0 ||
    Number(totals.active_structured_groups || 0) > 0;
  if (showStructured) {
    rows.push({ key: "active_structured_groups", label: "Structured Groups" });
  }
  rows.push(
    { key: "archived_groups", label: "Archived Groups" },
    { key: "members", label: "Members" },
  );
  const showStaff =
    Boolean(entitlements.features?.staff_management) ||
    lockedFor("workspace_admins") > 0 ||
    lockedFor("workspace_staff") > 0 ||
    Number(totals.workspace_admins || 0) > 0 ||
    Number(totals.workspace_staff || 0) > 0;
  if (showStaff) {
    rows.push(
      { key: "workspace_admins", label: "Workspace Admins" },
      { key: "workspace_staff", label: "Workspace Staff" },
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
      let display = `${total} / ${limit}`;
      let limitNote = null;
      if (hasLockState) {
        const recordWord = total === 1 ? "record" : "records";
        display =
          locked > 0
            ? `${total} ${recordWord} · ${unlocked} available · ${locked} plan locked`
            : `${total} ${recordWord} · ${unlocked} of ${limit} available`;
        limitNote = `Limit: ${limit}`;
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
