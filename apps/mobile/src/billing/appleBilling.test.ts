import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  APPLE_PRODUCT_ID_LIST,
  APPLE_PRODUCT_IDS,
  appleProductIdFor,
  appleProductMeta,
} from "../billing/appleProducts";
import {
  appleBlockedByOtherProvider,
  appleManaged,
  applePurchaseEligible,
  shouldShowStripePromoOnMobile,
  userFacingAppleBillingError,
} from "../billing/applePlanUi";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("canonical Apple product IDs are the four App Store Connect IDs", () => {
  assert.deepEqual(APPLE_PRODUCT_ID_LIST, [
    "app.checkstation.plus.monthly",
    "app.checkstation.plus.yearly",
    "app.checkstation.business.monthly",
    "app.checkstation.business.yearly",
  ]);
  assert.equal(appleProductIdFor("plus", "monthly"), APPLE_PRODUCT_IDS.plusMonthly);
  assert.equal(appleProductMeta(APPLE_PRODUCT_IDS.businessYearly)?.plan, "business");
});

test("Apple purchase eligibility respects source lock and built-in trial", () => {
  assert.equal(applePurchaseEligible({ purchase_source: "none", can_start_apple: true }), true);
  assert.equal(
    applePurchaseEligible({
      purchase_source: "none",
      can_start_apple: true,
      builtin_trial: { active: true },
    }),
    false,
  );
  assert.equal(applePurchaseEligible({ purchase_source: "stripe", can_start_apple: false }), false);
  assert.equal(applePurchaseEligible({ purchase_source: "google", can_start_apple: false }), false);
  assert.equal(appleManaged({ purchase_source: "apple", can_manage_apple: true }), true);
  assert.equal(appleBlockedByOtherProvider({ purchase_source: "stripe" }), "stripe");
  assert.equal(appleBlockedByOtherProvider({ purchase_source: "google" }), "google");
});

test("Apple Plan UI ignores Stripe promo pricing paths", () => {
  assert.equal(
    shouldShowStripePromoOnMobile({ purchase_source: "none", can_start_apple: true }),
    false,
  );
  assert.equal(
    shouldShowStripePromoOnMobile({ purchase_source: "apple", can_manage_apple: true }),
    false,
  );
  const page = read("apps/mobile/app/(app)/plan.tsx");
  assert.match(page, /displayPrice/);
  assert.match(page, /shouldShowStripePromoOnMobile/);
  assert.match(page, /appleManagedByCheckStation/);
  assert.match(page, /appleManagedByGoogle/);
  assert.match(page, /billingAppleVerify/);
  assert.match(page, /openAppleManageSubscriptions/);
  assert.match(page, /restoreApplePurchases/);
  assert.match(page, /loadAppleSubscriptionProducts/);
});

test("Apple billing error mapping stays user-safe", () => {
  assert.match(
    userFacingAppleBillingError({ code: "apple_transaction_bound_elsewhere" }, "fallback"),
    /another workspace/i,
  );
  assert.equal(userFacingAppleBillingError({ code: "apple_jws_invalid" }, "fallback").includes("JWS"), false);
});

test("mobile Plan still shows canonical billing provider labels", () => {
  const page = read("apps/mobile/app/(app)/plan.tsx");
  assert.match(page, /purchase_source_display/);
  assert.match(page, /billingProviderCheckStation/);
  assert.match(page, /billingProviderApple/);
  assert.match(page, /billingProviderGoogle/);
});
