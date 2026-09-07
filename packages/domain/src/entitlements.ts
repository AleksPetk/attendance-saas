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

export function isOwner(session: WorkspaceSession | null | undefined): boolean {
  return session?.role === "owner";
}

export function isStaff(session: WorkspaceSession | null | undefined): boolean {
  return session?.role === "staff" || session?.role === "admin";
}

export function canManageWorkspace(session: WorkspaceSession | null | undefined): boolean {
  return Boolean(session?.capabilities?.manage_workspace || session?.role === "owner" || session?.role === "admin");
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
