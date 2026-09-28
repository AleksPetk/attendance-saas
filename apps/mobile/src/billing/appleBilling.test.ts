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
  appleTrialFutureSelectionMode,
  futurePaidMatchesAppleProduct,
  shouldLoadAppleStoreProducts,
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

test("iOS trial future-selection mode hides Stripe promo and loads Apple products", () => {
  const trialNone = {
    purchase_source: "none",
    can_start_apple: true,
    builtin_trial: { active: true },
  };
  assert.equal(appleTrialFutureSelectionMode(trialNone), true);
  assert.equal(shouldLoadAppleStoreProducts(trialNone), true);
  assert.equal(applePurchaseEligible(trialNone), false);
  assert.equal(shouldShowStripePromoOnMobile(trialNone), false);

  assert.equal(
    shouldShowStripePromoOnMobile({ purchase_source: "none", can_start_apple: true }),
    false,
  );
  assert.equal(
    shouldShowStripePromoOnMobile({ purchase_source: "apple", can_manage_apple: true }),
    false,
  );
});

test("plan.tsx gates Stripe promo off during iOS trial future selection", () => {
  const page = read("apps/mobile/app/(app)/plan.tsx");
  assert.match(
    page,
    /showStripeCards = shouldShowStripePromoOnMobile\(billing\) && !showAppleShop && !showAppleManage && !showAppleTrialSelect/,
  );
  assert.match(page, /showAppleTrialSelect = appleIapSupported\(\) && appleTrialFutureSelectionMode\(billing\)/);
});

test("future paid plan matching drives trial selection badges", () => {
  const billing = {
    future_paid_plan: { key: "business", interval: "monthly" },
  };
  assert.equal(futurePaidMatchesAppleProduct(billing, "business", "monthly"), true);
  assert.equal(futurePaidMatchesAppleProduct(billing, "plus", "monthly"), false);
});

test("Apple Plan cards always come from catalog, not StoreKit availability", () => {
  const page = read("apps/mobile/app/(app)/plan.tsx");
  const cards = read("apps/mobile/src/billing/applePlanCards.ts");
  const iap = read("apps/mobile/src/billing/appleIap.ts");
  assert.match(cards, /buildApplePlanCards/);
  assert.match(cards, /APPLE_PRODUCT_ID_LIST/);
  assert.match(page, /buildApplePlanCards\(billing, bt\)/);
  assert.match(page, /appleStoreProductMap/);
  assert.match(page, /appleDisplayPriceForCard/);
  assert.match(page, /listPrice=""/);
  assert.match(page, /applePriceUnavailable/);
  assert.doesNotMatch(page, /const appleCards = appleProducts/);
  assert.doesNotMatch(page, /!appleCards\.length \? <Alert message=\{t\("plan\.appleProductsUnavailable"\)\} \/>/);
  // Trial selection must not require StoreKit prices.
  assert.match(page, /Trial future-plan selection is catalog-backed/);
  // StoreKit fetch: session-scoped connection + subs-then-all fallback + retries.
  assert.match(iap, /ensureAppleIapSession/);
  assert.match(iap, /appleIapSessionReady/);
  assert.match(iap, /warmAppleIapSession/);
  assert.match(iap, /purchaseUpdatedListener/);
  assert.match(iap, /type: "subs"/);
  assert.match(iap, /type: "all"/);
  assert.match(iap, /PRODUCT_FETCH_ATTEMPTS/);
  // Restore must AppStore.sync via expo-iap restorePurchases before reading entitlements.
  assert.match(iap, /expoIapRestorePurchases/);
  assert.match(iap, /getAvailablePurchases/);
  // Session stays live — do not import or call endConnection after fetches.
  assert.doesNotMatch(iap, /\bendConnection\b\s*,/);
  assert.doesNotMatch(iap, /await endConnection\s*\(/);
  assert.doesNotMatch(iap, /[^.\w]endConnection\s*\(/);
  // Apple section must not render Admin promo / discount headline.
  assert.doesNotMatch(
    page,
    /appleProductsUnavailable[\s\S]{0,200}<PlanPromoHeadline/,
  );
  // Pull-to-refresh and restore must re-request StoreKit prices (not only billing API).
  assert.match(page, /appleStoreEpoch/);
  assert.match(page, /reloadAppleStore/);
  assert.match(page, /if \(refresh && appleIapSupported\(\)\) reloadAppleStore\(\)/);
});

test("buildApplePlanCards enumerates all four App Store SKUs from catalog", async () => {
  const { buildApplePlanCards, appleDisplayPriceForCard, appleStoreProductMap } = await import("./applePlanCards");
  const cards = buildApplePlanCards(
    { catalog: { plans: { plus: { display_name: "Plus" }, business: { display_name: "Business" } } } },
    (key) => (key.endsWith("yearly") ? "Yearly" : key.endsWith("monthly") ? "Monthly" : key),
  );
  assert.equal(cards.length, 4);
  assert.deepEqual(cards.map((c) => c.productId), APPLE_PRODUCT_ID_LIST);
  assert.equal(cards[0].title, "Plus Monthly");
  assert.equal(appleDisplayPriceForCard({ productId: APPLE_PRODUCT_IDS.plusMonthly, displayPrice: "¥1,200", title: "", description: "" }, "pending"), "¥1,200");
  assert.equal(appleDisplayPriceForCard(undefined, "pending"), "pending");
  const map = appleStoreProductMap([
    { productId: APPLE_PRODUCT_IDS.businessYearly, displayPrice: "$99", title: "B", description: "" },
  ]);
  assert.equal(map.get(APPLE_PRODUCT_IDS.businessYearly)?.displayPrice, "$99");
  assert.equal(map.has(APPLE_PRODUCT_IDS.plusMonthly), false);
});

test("Apple Plan screen gates Stripe promo off and never purchases during trial", () => {
  const page = read("apps/mobile/app/(app)/plan.tsx");
  assert.match(page, /appleDisplayPriceForCard/);
  assert.match(page, /shouldShowStripePromoOnMobile/);
  assert.match(page, /appleTrialFutureSelectionMode/);
  assert.match(page, /billingFuturePlan/);
  assert.match(page, /billingFuturePlanClear/);
  assert.match(page, /appleTrialSelectHint/);
  assert.match(page, /appleManagedByCheckStation/);
  assert.match(page, /appleManagedByGoogle/);
  assert.match(page, /billingAppleVerify/);
  assert.match(page, /openAppleManageSubscriptions/);
  assert.match(page, /restoreApplePurchases/);
  assert.match(page, /loadAppleSubscriptionProducts/);
  assert.match(page, /const onSelectFuture = useCallback\(async \(productId: AppleProductId\) => \{[\s\S]*?billingFuturePlan\(\)/);
  assert.match(page, /if \(appleTrialFutureSelectionMode\(fresh\)\)/);
  assert.match(page, /purchaseAppleSubscription/);
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
