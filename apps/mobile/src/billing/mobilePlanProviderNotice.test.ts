import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { shouldShowMobileCrossProviderBillingNotice } from "./mobilePlanProviderNotice";

const plan = readFileSync(new URL("../../app/(app)/plan.tsx", import.meta.url), "utf8");

describe("shouldShowMobileCrossProviderBillingNotice", () => {
  it("hides notice for same-platform native billing", () => {
    assert.equal(
      shouldShowMobileCrossProviderBillingNotice({ purchase_source: "google" }, "android"),
      false,
    );
    assert.equal(
      shouldShowMobileCrossProviderBillingNotice({ purchase_source: "apple" }, "ios"),
      false,
    );
  });

  it("shows notice for cross-platform and Stripe billing", () => {
    assert.equal(
      shouldShowMobileCrossProviderBillingNotice({ purchase_source: "apple" }, "android"),
      true,
    );
    assert.equal(
      shouldShowMobileCrossProviderBillingNotice({ purchase_source: "google" }, "ios"),
      true,
    );
    assert.equal(
      shouldShowMobileCrossProviderBillingNotice({ purchase_source: "stripe" }, "android"),
      true,
    );
    assert.equal(
      shouldShowMobileCrossProviderBillingNotice({ purchase_source: "stripe" }, "ios"),
      true,
    );
  });

  it("shows no notice for Basic / no provider", () => {
    assert.equal(shouldShowMobileCrossProviderBillingNotice({ purchase_source: "none" }, "ios"), false);
    assert.equal(shouldShowMobileCrossProviderBillingNotice(null, "android"), false);
  });
});

describe("mobile Plan provider UI wiring", () => {
  it("gates cross-provider banners and removes obsolete footer memo", () => {
    assert.match(plan, /shouldShowMobileCrossProviderBillingNotice/);
    assert.match(plan, /showCrossProviderBillingNotice && blockedProvider/);
    assert.match(plan, /showGoogleManage && showCrossProviderBillingNotice/);
    assert.match(plan, /billingProviderGoogle/);
    assert.match(plan, /billingProviderApple/);
    assert.doesNotMatch(plan, /plan\.nativeBillingNote/);
  });
});
