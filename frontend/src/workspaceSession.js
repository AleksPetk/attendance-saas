/** Customer workspace role/capability helpers for the SPA (UI hints only). */

import i18n from "./i18n/index.js";

export function workspaceFromSession(session) {
  return session?.workspace || null;
}

export function workspaceRole(session) {
  const workspace = workspaceFromSession(session);
  if (!workspace) return null;
  if (workspace.account_kind === "owner") return "owner";
  return workspace.role || null;
}

export function isWorkspaceOwner(session) {
  return workspaceFromSession(session)?.account_kind === "owner";
}

export function isWorkspaceAdmin(session) {
  return workspaceRole(session) === "admin";
}

export function isWorkspaceStaffRole(session) {
  return workspaceRole(session) === "staff";
}

export function workspaceCapabilities(session) {
  return workspaceFromSession(session)?.capabilities || {};
}

export function canManageWorkspace(session) {
  const caps = workspaceCapabilities(session);
  if ("can_manage_workspace" in caps) return Boolean(caps.can_manage_workspace);
  return isWorkspaceOwner(session) || isWorkspaceAdmin(session);
}

export function canManageStaffAccounts(session) {
  const caps = workspaceCapabilities(session);
  if ("can_manage_staff_accounts" in caps) return Boolean(caps.can_manage_staff_accounts);
  return isWorkspaceOwner(session) || isWorkspaceAdmin(session);
}

export function canManageWorkspaceAdminAccounts(session) {
  const caps = workspaceCapabilities(session);
  if ("can_manage_workspace_admin_accounts" in caps) {
    return Boolean(caps.can_manage_workspace_admin_accounts);
  }
  return isWorkspaceOwner(session);
}

export function canManageOwnerAccount(session) {
  const caps = workspaceCapabilities(session);
  if ("can_manage_owner_account" in caps) return Boolean(caps.can_manage_owner_account);
  return isWorkspaceOwner(session);
}

export function canLaunchKiosk(session) {
  const caps = workspaceCapabilities(session);
  if ("can_launch_kiosk" in caps) return Boolean(caps.can_launch_kiosk);
  return isWorkspaceOwner(session) || isWorkspaceAdmin(session) || isWorkspaceStaffRole(session);
}

export function canViewBilling(session) {
  const caps = workspaceCapabilities(session);
  if ("can_view_billing" in caps) return Boolean(caps.can_view_billing);
  return isWorkspaceOwner(session);
}

export function canManageSubscription(session) {
  const caps = workspaceCapabilities(session);
  if ("can_manage_subscription" in caps) {
    return Boolean(caps.can_manage_subscription);
  }
  return canViewBilling(session);
}

export function canViewGlobalMembers(session) {
  const caps = workspaceCapabilities(session);
  if ("can_view_global_members" in caps) return Boolean(caps.can_view_global_members);
  return !isWorkspaceStaffRole(session);
}

export function canManageGroupConfiguration(session) {
  const caps = workspaceCapabilities(session);
  if ("can_manage_group_configuration" in caps) {
    return Boolean(caps.can_manage_group_configuration);
  }
  return canManageWorkspace(session);
}

export function isGroupScopedStaff(session) {
  const caps = workspaceCapabilities(session);
  if ("is_group_scoped_staff" in caps) return Boolean(caps.is_group_scoped_staff);
  return isWorkspaceStaffRole(session);
}

export function workspaceRoleLabel(session) {
  const role = workspaceRole(session);
  if (role === "owner") return i18n.t("workspace:roles.owner");
  if (role === "admin") return i18n.t("workspace:roles.admin");
  if (role === "staff") return i18n.t("workspace:roles.staff");
  return workspaceFromSession(session)?.account_kind?.replace(/_/g, " ") || i18n.t("workspace:roles.workspace");
}

export function workspaceTopbarNotice(session) {
  if (isWorkspaceOwner(session)) return "";
  if (isWorkspaceAdmin(session)) {
    return i18n.t("workspace:topbar.adminNotice");
  }
  if (isGroupScopedStaff(session)) {
    return i18n.t("workspace:topbar.staffScopedNotice");
  }
  return i18n.t("workspace:topbar.staffLimitedNotice");
}
