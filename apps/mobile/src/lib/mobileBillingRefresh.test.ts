import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  MOBILE_BILLING_FOREGROUND_MIN_MS,
  billingErrorCode,
  shouldRefreshBillingOnAppState,
  shouldRunBillingRefresh,
  summarizeRestoreAttempts,
} from "./mobileBillingRefresh";

const plan = readFileSync(new URL("../../app/(app)/plan.tsx", import.meta.url), "utf8");
const more = readFileSync(new URL("../../app/(app)/(tabs)/more.tsx", import.meta.url), "utf8");
const provider = readFileSync(new URL("./AppProvider.tsx", import.meta.url), "utf8");
const foregroundHook = readFileSync(new URL("./useAppForegroundRefresh.ts", import.meta.url), "utf8");

describe("mobileBillingRefresh helpers", () => {
  it("dedupes in-flight and rapid refreshes unless forced", () => {
    const gate = { inFlight: false, lastRefreshAt: 1000 as number | null };
    assert.equal(
      shouldRunBillingRefresh({ now: 1000 + MOBILE_BILLING_FOREGROUND_MIN_MS - 1, gate }),
      false,
    );
    assert.equal(
      shouldRunBillingRefresh({ now: 1000 + MOBILE_BILLING_FOREGROUND_MIN_MS, gate }),
      true,
    );
    gate.inFlight = true;
    assert.equal(shouldRunBillingRefresh({ now: 5000, gate, force: true }), false);
    gate.inFlight = false;
    assert.equal(shouldRunBillingRefresh({ now: 5000, gate, force: true }), true);
    assert.equal(shouldRunBillingRefresh({ now: 1, gate: { inFlight: false, lastRefreshAt: null } }), true);
  });

  it("refreshes only when AppState returns to active from background/inactive", () => {
    assert.equal(shouldRefreshBillingOnAppState({ previous: "background", next: "active" }), true);
    assert.equal(shouldRefreshBillingOnAppState({ previous: "inactive", next: "active" }), true);
    assert.equal(shouldRefreshBillingOnAppState({ previous: "active", next: "active" }), false);
    assert.equal(shouldRefreshBillingOnAppState({ previous: "active", next: "background" }), false);
  });

  it("summarizes restore attempts with actionable ownership errors", () => {
    assert.deepEqual(
      summarizeRestoreAttempts([{ kind: "activated" }, { kind: "error", error: { code: "purchase_source_locked" } }]),
      { outcome: "success" },
    );
    const locked = summarizeRestoreAttempts([
      { kind: "error", error: { code: "google_play_not_configured" } },
      { kind: "error", error: { code: "google_purchase_bound_elsewhere" } },
      { kind: "inactive" },
    ]);
    assert.equal(locked.outcome, "error");
    assert.equal(billingErrorCode(locked.outcome === "error" ? locked.error : null), "google_purchase_bound_elsewhere");
    assert.equal(
      billingErrorCode({ data: { code: "purchase_source_locked" } }),
      "purchase_source_locked",
    );
  });
});

describe("mobile Plan / More billing refresh wiring", () => {
  it("Plan refetches authoritative billing on focus, foreground, revision, and silent restore", () => {
    assert.match(plan, /useAppForegroundRefresh/);
    assert.match(plan, /useFocusEffect/);
    assert.match(plan, /load\("silent"\)/);
    assert.match(plan, /revision/);
    assert.match(plan, /syncWorkspace/);
    assert.match(plan, /endpoints\.billing\(\)/);
    assert.match(plan, /shouldRunBillingRefresh/);
    // Store catalog must not replace backend ownership refresh.
    assert.match(plan, /shouldLoadAppleStoreProducts\(snapshot\)/);
    assert.match(plan, /shouldLoadGoogleStoreProducts\(snapshot\)/);
    assert.doesNotMatch(plan, /reloadGoogleStore\(\);\s*\n\s*if \(!restored\.length\)/);
  });

  it("AppProvider foreground refresh bumps revision; More Refresh uses refreshWorkspace", () => {
    assert.match(provider, /useAppForegroundRefresh/);
    assert.match(provider, /refreshWorkspace/);
    assert.match(provider, /syncWorkspace/);
    assert.match(provider, /authStatusRef\.current !== "authenticated"/);
    assert.match(more, /refreshWorkspace\(\)/);
    assert.match(more, /status\.refresh/);
  });

  it("foreground hook listens to AppState active transitions", () => {
    assert.match(foregroundHook, /AppState\.addEventListener\("change"/);
    assert.match(foregroundHook, /shouldRefreshBillingOnAppState/);
  });

  it("Restore keeps recovery semantics with near-button feedback and mapped errors", () => {
    assert.match(plan, /onGoogleRestore/);
    assert.match(plan, /restoreGooglePurchases/);
    assert.match(plan, /billingGoogleVerify\(\)/);
    assert.match(plan, /summarizeRestoreAttempts/);
    assert.match(plan, /plan\.googleRestoreChecking/);
    assert.match(plan, /plan\.googleRestoreSynchronized/);
    assert.match(plan, /restoreFeedback/);
    assert.match(plan, /ActivityIndicator/);
    assert.match(plan, /disabled=\{googleBusy\}/);
    assert.match(plan, /onRestore/);
    assert.match(plan, /restoreApplePurchases/);
    assert.match(plan, /billingAppleVerify/);
    assert.match(plan, /plan\.appleRestore/);
    assert.match(plan, /userFacingGoogleBillingError/);
    assert.match(plan, /userFacingAppleBillingError/);
  });
});
