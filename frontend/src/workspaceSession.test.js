/**
 * Run: node --test src/workspaceSession.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canLaunchKiosk,
  canManageGroupConfiguration,
  canManageOwnerAccount,
  canManageStaffAccounts,
  canManageSubscription,
  canManageWorkspace,
  canManageWorkspaceAdminAccounts,
  canViewBilling,
  canViewGlobalMembers,
  isGroupScopedStaff,
  isWorkspaceAdmin,
  isWorkspaceOwner,
  workspaceRole,
  workspaceTopbarNotice,
} from "./workspaceSession.js";

const ownerSession = {
  workspace: {
    account_kind: "owner",
    role: "owner",
    capabilities: {
      can_manage_workspace: true,
      can_manage_staff_accounts: true,
      can_manage_workspace_admin_accounts: true,
      can_manage_owner_account: true,
      can_launch_kiosk: true,
      can_view_billing: true,
      can_manage_subscription: true,
      can_view_global_members: true,
      can_manage_group_configuration: true,
      is_group_scoped_staff: false,
    },
  },
};

const adminSession = {
  workspace: {
    account_kind: "workspace_staff",
    role: "admin",
    capabilities: {
      can_manage_workspace: true,
      can_manage_staff_accounts: true,
      can_manage_workspace_admin_accounts: false,
      can_manage_owner_account: false,
      can_launch_kiosk: true,
      can_view_billing: false,
    },
  },
};

const staffSession = {
  workspace: {
    account_kind: "workspace_staff",
    role: "staff",
    capabilities: {
      can_manage_workspace: false,
      can_manage_staff_accounts: false,
      can_manage_workspace_admin_accounts: false,
      can_manage_owner_account: false,
      can_launch_kiosk: true,
      can_view_billing: false,
      can_view_global_members: false,
      can_manage_group_configuration: false,
      is_group_scoped_staff: true,
    },
  },
};

test("operational navigation capabilities for admin", () => {
  assert.equal(canManageWorkspace(adminSession), true);
  assert.equal(canLaunchKiosk(adminSession), true);
  assert.equal(canManageStaffAccounts(adminSession), true);
});

test("staff creation available to admin but admin promotion is not", () => {
  assert.equal(canManageStaffAccounts(adminSession), true);
  assert.equal(canManageWorkspaceAdminAccounts(adminSession), false);
});

test("billing and owner account controls absent for admin", () => {
  assert.equal(canViewBilling(adminSession), false);
  assert.equal(canManageOwnerAccount(adminSession), false);
});

test("owner retains full owner-only capabilities", () => {
  assert.equal(canManageOwnerAccount(ownerSession), true);
  assert.equal(canManageWorkspaceAdminAccounts(ownerSession), true);
  assert.equal(canViewBilling(ownerSession), true);
  assert.equal(canManageSubscription(ownerSession), true);
});

test("CheckStation-managed owner cannot view or manage billing", () => {
  const checkstation = {
    workspace: {
      account_kind: "owner",
      role: "owner",
      capabilities: {
        can_view_billing: false,
        can_manage_subscription: false,
        account_mode: "checkstation",
      },
    },
  };
  assert.equal(canViewBilling(checkstation), false);
  assert.equal(canManageSubscription(checkstation), false);
});

test("staff remains group-scoped without global members or configuration", () => {
  assert.equal(canManageWorkspace(staffSession), false);
  assert.equal(canManageStaffAccounts(staffSession), false);
  assert.equal(canLaunchKiosk(staffSession), true);
  assert.equal(canViewGlobalMembers(staffSession), false);
  assert.equal(canManageGroupConfiguration(staffSession), false);
  assert.equal(isGroupScopedStaff(staffSession), true);
});

test("workspace roles resolve correctly", () => {
  assert.equal(workspaceRole(ownerSession), "owner");
  assert.equal(workspaceRole(adminSession), "admin");
  assert.equal(isWorkspaceOwner(ownerSession), true);
  assert.equal(isWorkspaceAdmin(adminSession), true);
});

test("topbar notice distinguishes admin from staff", () => {
  assert.equal(workspaceTopbarNotice(ownerSession), "");
  assert.match(workspaceTopbarNotice(adminSession), /Admin view/);
  assert.match(workspaceTopbarNotice(staffSession), /Staff view/);
});
