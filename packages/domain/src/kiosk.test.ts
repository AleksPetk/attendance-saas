import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getValidActionsForState, isActionAllowed } from "./kiosk.js";
import {
  canAccessStaffManagement,
  canManageOwnerAccount,
  canManageWorkspace,
  canViewGlobalMembers,
  hasPlanFeature,
  planLimitValue,
  selectionRequired,
  shouldShowLockedStaffNav,
  workspacePlanKey,
} from "./entitlements.js";

describe("kiosk actions", () => {
  const group = {
    check_in_enabled: true,
    check_out_enabled: true,
    breaks_enabled: true,
    max_breaks: 2,
  };

  it("allows check_in when not checked in", () => {
    const actions = getValidActionsForState(group, {
      is_checked_in: false,
      is_on_break: false,
      break_count: 0,
    });
    assert.deepEqual(actions, ["check_in"]);
  });

  it("rejects duplicate check_in while checked in", () => {
    assert.equal(
      isActionAllowed(
        group,
        { is_checked_in: true, is_on_break: false, break_count: 0 },
        "check_in",
      ),
      false,
    );
    assert.equal(
      isActionAllowed(
        group,
        { is_checked_in: true, is_on_break: false, break_count: 0 },
        "check_out",
      ),
      true,
    );
  });
});

describe("entitlements", () => {
  it("reads plan key", () => {
    assert.equal(
      workspacePlanKey({
        workspace: { entitlements: { plan: { key: "plus" } } },
      }),
      "plus",
    );
    assert.equal(hasPlanFeature({ workspace: { entitlements: { features: { structured_groups: true } } } }, "structured_groups"), true);
  });

  it("reads capacity-resolution and staff availability from the session snapshot", () => {
    const basic = {
      workspace: {
        entitlements: {
          plan: { key: "basic", display_name: "Basic" },
          features: { staff_management: false, structured_groups: false },
          limits: { active_standard_groups: 2, members: 10 },
          selection_required: { active_standard_groups: true, members: false },
        },
      },
    };
    const plus = {
      workspace: {
        entitlements: {
          features: { staff_management: true },
          limits: { members: 100 },
          selection_required: { members: false },
        },
      },
    };
    assert.equal(planLimitValue(basic, "members"), 10);
    assert.equal(planLimitValue(basic, "active_structured_groups"), null);
    assert.equal(selectionRequired(basic, "active_standard_groups"), true);
    assert.equal(selectionRequired(basic, "members"), false);
    assert.equal(canAccessStaffManagement(basic, true), false);
    assert.equal(shouldShowLockedStaffNav(basic, true), true);
    assert.equal(canAccessStaffManagement(plus, true), true);
    assert.equal(shouldShowLockedStaffNav(plus, true), false);
    assert.equal(shouldShowLockedStaffNav(basic, false), false);
  });

  it("uses production capability keys and preserves role boundaries", () => {
    assert.equal(canManageWorkspace({ role: "staff", capabilities: { can_manage_workspace: false } }), false);
    assert.equal(canViewGlobalMembers({ role: "staff", capabilities: { can_view_global_members: false } }), false);
    assert.equal(canManageOwnerAccount({ role: "admin", capabilities: { can_manage_owner_account: false } }), false);
    assert.equal(canManageWorkspace({ role: "admin" }), true);
    assert.equal(canManageWorkspace({ role: "owner", capabilities: { can_manage_workspace: false } }), false);
  });
});
