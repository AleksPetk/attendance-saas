import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  capacityBoostLabel,
  exactCapacityMultiplier,
  pricingCta,
  pricingFeatureList,
} from "./pricingPage.js";

const catalog = {
  entitlements: {
    basic: {
      features: {
        structured_groups: false,
        staff_management: false,
        report_export_csv: false,
        group_forward_emails: false,
        structured_snapshot_import: false,
        ads_required: true,
      },
      limits: {
        active_standard_groups: 2,
        members: 10,
        workspace_admins: 0,
        workspace_staff: 0,
      },
    },
    plus: {
      features: {
        structured_groups: false,
        staff_management: true,
        report_export_csv: true,
        group_forward_emails: true,
        structured_snapshot_import: false,
        ads_required: false,
      },
      limits: {
        active_standard_groups: 10,
        members: 50,
        workspace_admins: 2,
        workspace_staff: 5,
      },
    },
    business: {
      features: {
        structured_groups: true,
        staff_management: true,
        report_export_csv: true,
        group_forward_emails: true,
        structured_snapshot_import: true,
        ads_required: false,
      },
      limits: {
        active_standard_groups: 30,
        members: 300,
        workspace_admins: 5,
        workspace_staff: 25,
      },
    },
  },
};

describe("pricingFeatureList", () => {
  it("builds Basic and Plus lines from catalog limits", () => {
    assert.deepEqual(pricingFeatureList(catalog, "basic"), [
      "2 active Groups",
      "10 Members",
      "Kiosk check-in",
      "Action history",
      "Ads supported",
    ]);
    assert.deepEqual(pricingFeatureList(catalog, "plus"), [
      "Everything in Basic",
      "10 active Groups / 50 Members",
      "Workspace Staff management",
      "Attendance Report export",
      "Group Forward Emails",
      "No ads",
    ]);
  });

  it("shows Business capacity as catalog-derived multipliers and seat counts", () => {
    const features = pricingFeatureList(catalog, "business");
    assert.deepEqual(features, [
      "Everything in Plus",
      "Structured Groups",
      "3× Group capacity",
      "6× Member capacity",
      "5 Admin seats",
      "5× Staff seats",
      "Structured snapshot import",
    ]);
    assert.equal(exactCapacityMultiplier(30, 10), 3);
    assert.equal(exactCapacityMultiplier(300, 50), 6);
    assert.equal(exactCapacityMultiplier(5, 2), null);
    assert.equal(exactCapacityMultiplier(25, 5), 5);
    assert.equal(capacityBoostLabel(5, 2, "Admin seats"), "5 Admin seats");
  });

  it("does not invent vague Business copy", () => {
    const text = pricingFeatureList(catalog, "business").join(" ");
    assert.doesNotMatch(text, /Higher Group/);
    assert.doesNotMatch(text, /More Admin/);
  });
});

describe("pricingCta", () => {
  const loggedOut = {
    signedIn: false,
    canOpenSubscription: false,
    currentPlanKey: null,
  };
  const ownerBasic = {
    signedIn: true,
    canOpenSubscription: true,
    currentPlanKey: "basic",
  };
  const ownerPlus = {
    signedIn: true,
    canOpenSubscription: true,
    currentPlanKey: "plus",
  };
  const staff = {
    signedIn: true,
    canOpenSubscription: false,
    currentPlanKey: "plus",
  };

  it("uses marketing labels and register for logged-out visitors", () => {
    assert.deepEqual(pricingCta("basic", loggedOut), {
      label: "Get Started Free",
      to: "/register",
    });
    assert.deepEqual(pricingCta("plus", loggedOut), {
      label: "Choose Plus",
      to: "/register",
    });
    assert.deepEqual(pricingCta("business", loggedOut), {
      label: "Go Business",
      to: "/register",
    });
  });

  it("keeps owner billing routes without Choose in Account", () => {
    assert.deepEqual(pricingCta("basic", ownerBasic), {
      label: "Get Started Free",
      to: "/account/subscription",
    });
    assert.deepEqual(pricingCta("plus", ownerBasic), {
      label: "Choose Plus",
      to: "/account/subscription",
    });
    assert.deepEqual(pricingCta("business", ownerBasic), {
      label: "Go Business",
      to: "/account/subscription",
    });
  });

  it("shows Manage subscription on Basic only for a paid commercial plan", () => {
    assert.equal(pricingCta("basic", ownerPlus).label, "Manage subscription");
    assert.equal(pricingCta("basic", ownerPlus).to, "/account/subscription");
    assert.equal(pricingCta("basic", ownerBasic).label, "Get Started Free");
    assert.equal(pricingCta("plus", ownerPlus).label, "Choose Plus");
  });

  it("sends signed-in users without billing to account security", () => {
    assert.deepEqual(pricingCta("plus", staff), {
      label: "Choose Plus",
      to: "/account/security",
    });
    assert.equal(pricingCta("basic", staff).label, "Get Started Free");
    assert.equal(pricingCta("basic", staff).to, "/account/security");
  });
});
