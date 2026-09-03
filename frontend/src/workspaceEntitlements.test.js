/**
 * Run: node --test src/workspaceEntitlements.test.js
 */
import "./i18n/index.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  anySelectionRequired,
  canAccessStaffManagement,
  canCreateStructuredGroups,
  canExportAnyReport,
  canUseGroupForwardEmails,
  entitlementsFromSession,
  groupsCapacityCaption,
  planLocksFromSession,
  selectionRequired,
  shouldShowLockedStaffNav,
  subscriptionUsageRows,
  usageLimitCaption,
  usageTotalValue,
  workspacePlanDisplayName,
  workspaceRequiresAds,
} from "./workspaceEntitlements.js";
import {
  advertisingIsEnabled,
  resolveBannerModel,
  resolveInterstitialDecision,
  shouldShowPlacement,
} from "./advertising/state.js";
import {
  PLACEMENT_DASHBOARD_BANNER,
  PLACEMENT_KIOSK_LAUNCH,
} from "./advertising/placements.js";

const basicEntitlements = {
  plan: { key: "basic", display_name: "Basic" },
  features: {
    structured_groups: false,
    staff_management: false,
    report_export_csv: false,
    report_export_excel: false,
    report_export_pdf: false,
    group_forward_emails: false,
    ads_required: true,
  },
  limits: {
    active_standard_groups: 2,
    active_structured_groups: 0,
    archived_groups: 2,
    members: 10,
    workspace_admins: 0,
    workspace_staff: 0,
  },
  usage: {
    active_standard_groups: 1,
    active_structured_groups: 0,
    archived_groups: 0,
    members: 7,
    workspace_admins: 0,
    workspace_staff: 0,
  },
  over_limit: [],
  is_over_limit: false,
};

const basicSession = { workspace: { entitlements: basicEntitlements } };

test("entitlements helpers read plan and features", () => {
  assert.equal(workspacePlanDisplayName(basicSession), "Basic");
  assert.equal(canCreateStructuredGroups(basicSession), false);
  assert.equal(canUseGroupForwardEmails(basicSession), false);
  assert.equal(canExportAnyReport(basicSession), false);
  assert.equal(canAccessStaffManagement(basicSession, true), false);
  assert.equal(shouldShowLockedStaffNav(basicSession, true), true);
  assert.equal(usageLimitCaption(basicSession, "members", "Members"), "7 of 10 Members");
});

test("subscription usage rows for basic omit staff quotas", () => {
  const rows = subscriptionUsageRows(basicEntitlements);
  assert.deepEqual(
    rows.map((row) => row.key),
    ["active_standard_groups", "archived_groups", "members"],
  );
  assert.equal(rows[0].usage, 1);
  assert.equal(rows[0].limit, 2);
});

test("subscription usage rows show zero-capacity locked resources", () => {
  const rows = subscriptionUsageRows({
    ...basicEntitlements,
    usage: {
      ...basicEntitlements.usage,
      active_standard_groups: 2,
      workspace_admins: 0,
      workspace_staff: 0,
      active_structured_groups: 0,
    },
    usage_totals: {
      active_standard_groups: 4,
      active_structured_groups: 1,
      archived_groups: 2,
      members: 7,
      workspace_admins: 1,
      workspace_staff: 2,
    },
    plan_locks: {
      locked_counts: {
        active_standard_groups: 2,
        workspace_admins: 1,
        workspace_staff: 2,
      },
      structured_locked_count: 1,
    },
  });
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
  assert.equal(byKey.active_standard_groups.display, "4 records · 2 available · 2 plan locked");
  assert.equal(byKey.active_standard_groups.limitNote, "Limit: 2");
  assert.equal(byKey.active_structured_groups.display, "1 record · 0 available · 1 plan locked");
  assert.equal(byKey.active_structured_groups.limitNote, "Limit: 0");
  assert.equal(byKey.workspace_admins.display, "1 record · 0 available · 1 plan locked");
  assert.equal(byKey.workspace_admins.limitNote, "Limit: 0");
  assert.equal(byKey.members.display, "7 of 10");
  assert.equal(byKey.members.limitNote, null);
});

test("missing entitlements stay safe", () => {
  assert.equal(entitlementsFromSession(null), null);
  assert.equal(canAccessStaffManagement({}, true), false);
  assert.equal(subscriptionUsageRows(null).length, 0);
});

test("downgrade selection helpers expose totals and lock state", () => {
  const session = {
    workspace: {
      entitlements: {
        ...basicEntitlements,
        usage_totals: { ...basicEntitlements.usage, active_standard_groups: 6 },
        selection_required: { active_standard_groups: true, archived_groups: false },
        plan_locks: {
          locked_counts: { active_standard_groups: 4 },
        },
      },
    },
  };
  assert.equal(selectionRequired(session, "active_standard_groups"), true);
  assert.equal(selectionRequired(session, "archived_groups"), false);
  assert.equal(anySelectionRequired(session), true);
  assert.equal(usageTotalValue(session, "active_standard_groups"), 6);
  assert.equal(planLocksFromSession(session).locked_counts.active_standard_groups, 4);
  assert.equal(
    usageLimitCaption(session, "active_standard_groups", "active Groups"),
    "6 of 2 active Groups",
  );
  assert.equal(
    groupsCapacityCaption(session, "active_standard_groups", "active records"),
    "6 records · 1 of 2 available",
  );
});

test("capacity caption before resolution shows zero available", () => {
  const session = {
    workspace: {
      entitlements: {
        ...basicEntitlements,
        usage: { ...basicEntitlements.usage, active_standard_groups: 0 },
        usage_totals: { ...basicEntitlements.usage, active_standard_groups: 4 },
        selection_required: { active_standard_groups: true },
      },
    },
  };
  assert.equal(
    groupsCapacityCaption(session, "active_standard_groups", "active records"),
    "4 records · 0 of 2 available",
  );
});

test("ads_required is a plan flag, not an entitlement gate", () => {
  assert.equal(workspaceRequiresAds(basicSession), true);
  const plusSession = {
    workspace: {
      entitlements: {
        ...basicEntitlements,
        plan: { key: "plus", display_name: "Plus" },
        features: { ...basicEntitlements.features, ads_required: false },
      },
    },
  };
  assert.equal(workspaceRequiresAds(plusSession), false);
});

test("effective advertising follows workspace.advertising, not ads_required alone", () => {
  assert.equal(advertisingIsEnabled(basicSession), false);
  const active = {
    workspace: {
      entitlements: basicEntitlements,
      advertising: {
        enabled: true,
        provider: "mock",
        placements: [PLACEMENT_DASHBOARD_BANNER, PLACEMENT_KIOSK_LAUNCH],
      },
    },
  };
  assert.equal(advertisingIsEnabled(active), true);
  assert.equal(shouldShowPlacement(active, PLACEMENT_DASHBOARD_BANNER), true);
  const globallyOff = {
    workspace: {
      entitlements: basicEntitlements,
      advertising: { enabled: false, provider: "mock", placements: [] },
    },
  };
  assert.equal(advertisingIsEnabled(globallyOff), false);
  assert.equal(shouldShowPlacement(globallyOff, PLACEMENT_DASHBOARD_BANNER), false);
  assert.equal(resolveBannerModel(globallyOff, PLACEMENT_DASHBOARD_BANNER, {
    banner: () => ({ headline: "should not show" }),
  }), null);
  assert.equal(
    resolveInterstitialDecision(globallyOff, PLACEMENT_KIOSK_LAUNCH, {
      interstitial: () => ({ headline: "should not show" }),
    }).show,
    false,
  );
});
