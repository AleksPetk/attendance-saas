/** Workspace session / entitlement helpers — UI hints; backend remains authoritative. */

export type PlanKey = "basic" | "plus" | "business" | string;

export type WorkspaceEntitlements = {
  plan?: { key?: PlanKey; display_name?: string };
  features?: Record<string, boolean>;
  limits?: Record<string, number | null>;
  usage?: Record<string, number | null>;
  usage_totals?: Record<string, number | null>;
  selection_required?: Record<string, boolean>;
  plan_locks?: Record<string, unknown>;
  [key: string]: unknown;
};

export type WorkspaceSession = {
  authenticated?: boolean;
  role?: "owner" | "admin" | "staff" | string;
  actor?: Record<string, unknown>;
  workspace?: {
    id?: number;
    workspace_id?: string;
    name?: string;
    plan?: string;
    entitlements?: WorkspaceEntitlements;
    [key: string]: unknown;
  };
  capabilities?: Record<string, boolean>;
  kiosk_locked?: boolean;
  kiosk_group_id?: number | null;
  [key: string]: unknown;
};

export function entitlementsFromSession(
  session: WorkspaceSession | null | undefined,
): WorkspaceEntitlements | null {
  return session?.workspace?.entitlements || null;
}

export function workspacePlanKey(session: WorkspaceSession | null | undefined): PlanKey {
  return entitlementsFromSession(session)?.plan?.key || "basic";
}

export function hasPlanFeature(
  session: WorkspaceSession | null | undefined,
  featureKey: string,
): boolean {
  const features = entitlementsFromSession(session)?.features;
  if (!features || !(featureKey in features)) return false;
  return Boolean(features[featureKey]);
}

export function workspacePlanDisplayName(session: WorkspaceSession | null | undefined): string {
  return entitlementsFromSession(session)?.plan?.display_name || "Basic";
}

/** Limit from the workspace entitlement snapshot. Null when the backend did not send a numeric cap. */
export function planLimitValue(
  session: WorkspaceSession | null | undefined,
  limitKey: string,
): number | null {
  const limits = entitlementsFromSession(session)?.limits;
  if (!limits || !(limitKey in limits)) return null;
  const value = limits[limitKey];
  return typeof value === "number" ? value : null;
}

/** True only when the shared backend snapshot says this category still needs a one-time decision. */
export function selectionRequired(
  session: WorkspaceSession | null | undefined,
  kind: string,
): boolean {
  return Boolean(entitlementsFromSession(session)?.selection_required?.[kind]);
}

/** Role can manage staff AND the current entitlement snapshot includes staff_management. */
export function canAccessStaffManagement(
  session: WorkspaceSession | null | undefined,
  roleCanManageStaff: boolean,
): boolean {
  return Boolean(roleCanManageStaff) && hasPlanFeature(session, "staff_management");
}

/** Show Staff nav as a locked affordance when the role could manage staff but the plan does not include it. */
export function shouldShowLockedStaffNav(
  session: WorkspaceSession | null | undefined,
  roleCanManageStaff: boolean,
): boolean {
  return Boolean(roleCanManageStaff) && !hasPlanFeature(session, "staff_management");
}

export function isOwner(session: WorkspaceSession | null | undefined): boolean {
  return session?.role === "owner";
}

export function isStaff(session: WorkspaceSession | null | undefined): boolean {
  return session?.role === "staff" || session?.role === "admin";
}

export function canManageWorkspace(session: WorkspaceSession | null | undefined): boolean {
  return capabilityOrDefault(session, "can_manage_workspace", session?.role === "owner" || session?.role === "admin");
}

export function capability(session: WorkspaceSession | null | undefined, key: string): boolean {
  return Boolean(session?.capabilities?.[key]);
}

function capabilityOrDefault(session: WorkspaceSession | null | undefined, key: string, fallback: boolean): boolean {
  if (session?.capabilities && key in session.capabilities) return Boolean(session.capabilities[key]);
  return fallback;
}

export function canViewGlobalMembers(session: WorkspaceSession | null | undefined): boolean {
  return capabilityOrDefault(session, "can_view_global_members", session?.role === "owner" || session?.role === "admin");
}

export function canManageGroupConfiguration(session: WorkspaceSession | null | undefined): boolean {
  return capabilityOrDefault(session, "can_manage_group_configuration", session?.role === "owner" || session?.role === "admin");
}

export function canManageStaffAccounts(session: WorkspaceSession | null | undefined): boolean {
  return capabilityOrDefault(session, "can_manage_staff_accounts", session?.role === "owner" || session?.role === "admin");
}

export function canManageOwnerAccount(session: WorkspaceSession | null | undefined): boolean {
  return capabilityOrDefault(session, "can_manage_owner_account", session?.role === "owner");
}

export function canViewBilling(session: WorkspaceSession | null | undefined): boolean {
  return capabilityOrDefault(session, "can_view_billing", session?.role === "owner");
}

export function canLaunchKiosk(session: WorkspaceSession | null | undefined): boolean {
  return capabilityOrDefault(session, "can_launch_kiosk", ["owner", "admin", "staff"].includes(session?.role || ""));
}

export function isGroupScopedStaff(session: WorkspaceSession | null | undefined): boolean {
  return capabilityOrDefault(session, "is_group_scoped_staff", session?.role === "staff");
}

export function isKioskLocked(session: WorkspaceSession | null | undefined): boolean {
  return Boolean(session?.kiosk_locked);
}

/** Ads: Basic may show ads; Plus/Business/Business-trial should not. Native monetization is separate. */
export function shouldShowBasicAdsSurface(
  session: WorkspaceSession | null | undefined,
): boolean {
  const plan = workspacePlanKey(session);
  if (plan !== "basic") return false;
  // If trial flags exist on entitlements, prefer them.
  const ents = entitlementsFromSession(session) as WorkspaceEntitlements & {
    trial?: { active?: boolean };
    business_trial_active?: boolean;
  };
  if (ents?.business_trial_active || ents?.trial?.active) return false;
  return true;
}
