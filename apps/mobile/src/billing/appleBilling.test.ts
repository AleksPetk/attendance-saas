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
  assert.equal(appleDisplayPriceForCard({ productId: APPLE_PRODUCT_IDS.plusMonthly, displayPrice: "¥1,200", currency: null, title: "", description: "" }, "pending"), "¥1,200");
  assert.equal(appleDisplayPriceForCard(undefined, "pending"), "pending");
  const map = appleStoreProductMap([
    { productId: APPLE_PRODUCT_IDS.businessYearly, displayPrice: "$99", currency: "USD", title: "B", description: "" },
  ]);
  assert.equal(map.get(APPLE_PRODUCT_IDS.businessYearly)?.displayPrice, "$99");
  assert.equal(map.has(APPLE_PRODUCT_IDS.plusMonthly), false);
});

test("Japan storefront forces fixed yen card display even when StoreKit returns USD", async () => {
  const {
    resolveAppleCardDisplayPrice,
    APPLE_JAPAN_CARD_DISPLAY_PRICES,
    isJapanAppleStorefront,
    normalizeAppleStorefrontCountryCode,
  } = await import("./applePlanCards");

  assert.equal(normalizeAppleStorefrontCountryCode("jp"), "JP");
  assert.equal(normalizeAppleStorefrontCountryCode("JPN"), "JP");
  assert.equal(isJapanAppleStorefront("JP"), true);
  assert.equal(isJapanAppleStorefront("US"), false);

  assert.equal(
    resolveAppleCardDisplayPrice({
      productId: APPLE_PRODUCT_IDS.plusMonthly,
      storefrontCountryCode: "JP",
      store: { productId: APPLE_PRODUCT_IDS.plusMonthly, displayPrice: "$9.99", currency: "USD", title: "", description: "" },
      unavailableLabel: "pending",
    }),
    "¥980",
  );
  assert.equal(
    resolveAppleCardDisplayPrice({
      productId: APPLE_PRODUCT_IDS.plusYearly,
      storefrontCountryCode: "JP",
      store: { productId: APPLE_PRODUCT_IDS.plusYearly, displayPrice: "$99.99", currency: "USD", title: "", description: "" },
      unavailableLabel: "pending",
    }),
    "¥9,800",
  );
  assert.equal(
    resolveAppleCardDisplayPrice({
      productId: APPLE_PRODUCT_IDS.businessMonthly,
      storefrontCountryCode: "JP",
      store: { productId: APPLE_PRODUCT_IDS.businessMonthly, displayPrice: "$14.99", currency: "USD", title: "", description: "" },
      unavailableLabel: "pending",
    }),
    "¥1,480",
  );
  assert.equal(
    resolveAppleCardDisplayPrice({
      productId: APPLE_PRODUCT_IDS.businessYearly,
      storefrontCountryCode: "JP",
      store: { productId: APPLE_PRODUCT_IDS.businessYearly, displayPrice: "$149.99", currency: "USD", title: "", description: "" },
      unavailableLabel: "pending",
    }),
    "¥14,800",
  );
  assert.deepEqual(APPLE_JAPAN_CARD_DISPLAY_PRICES, {
    [APPLE_PRODUCT_IDS.plusMonthly]: "¥980",
    [APPLE_PRODUCT_IDS.plusYearly]: "¥9,800",
    [APPLE_PRODUCT_IDS.businessMonthly]: "¥1,480",
    [APPLE_PRODUCT_IDS.businessYearly]: "¥14,800",
  });
});

test("JP storefront with JPY StoreKit displayPrice still uses fixed card yen", async () => {
  const { resolveAppleCardDisplayPrice } = await import("./applePlanCards");
  assert.equal(
    resolveAppleCardDisplayPrice({
      productId: APPLE_PRODUCT_IDS.plusMonthly,
      storefrontCountryCode: "JP",
      store: { productId: APPLE_PRODUCT_IDS.plusMonthly, displayPrice: "¥1,200", currency: "JPY", title: "", description: "" },
      unavailableLabel: "pending",
    }),
    "¥980",
  );
});

test("unknown storefront does not force Japan prices from product currency", async () => {
  const { resolveAppleCardDisplayPrice, shouldUseJapanAppleCardDisplayPrices } = await import("./applePlanCards");
  assert.equal(
    shouldUseJapanAppleCardDisplayPrices({ storefrontCountryCode: null }),
    false,
  );
  assert.equal(
    resolveAppleCardDisplayPrice({
      productId: APPLE_PRODUCT_IDS.plusMonthly,
      storefrontCountryCode: null,
      store: { productId: APPLE_PRODUCT_IDS.plusMonthly, displayPrice: "$9.99", currency: "JPY", title: "", description: "" },
      unavailableLabel: "pending",
    }),
    "$9.99",
  );
});

test("storefrontPending keeps unavailable label instead of locking USD", async () => {
  const { resolveAppleCardDisplayPrice } = await import("./applePlanCards");
  assert.equal(
    resolveAppleCardDisplayPrice({
      productId: APPLE_PRODUCT_IDS.plusMonthly,
      storefrontCountryCode: null,
      storefrontPending: true,
      store: { productId: APPLE_PRODUCT_IDS.plusMonthly, displayPrice: "$9.99", currency: "USD", title: "", description: "" },
      unavailableLabel: "pending",
    }),
    "pending",
  );
  assert.equal(
    resolveAppleCardDisplayPrice({
      productId: APPLE_PRODUCT_IDS.plusMonthly,
      storefrontCountryCode: "JP",
      storefrontPending: false,
      store: { productId: APPLE_PRODUCT_IDS.plusMonthly, displayPrice: "$9.99", currency: "USD", title: "", description: "" },
      unavailableLabel: "pending",
    }),
    "¥980",
  );
});

test("unknown storefront + StoreKit currency USD keeps StoreKit displayPrice after resolve", async () => {
  const { resolveAppleCardDisplayPrice, shouldUseJapanAppleCardDisplayPrices } = await import("./applePlanCards");
  assert.equal(
    shouldUseJapanAppleCardDisplayPrices({ storefrontCountryCode: null }),
    false,
  );
  assert.equal(
    resolveAppleCardDisplayPrice({
      productId: APPLE_PRODUCT_IDS.plusMonthly,
      storefrontCountryCode: null,
      store: { productId: APPLE_PRODUCT_IDS.plusMonthly, displayPrice: "$9.99", currency: "USD", title: "", description: "" },
      unavailableLabel: "pending",
    }),
    "$9.99",
  );
});

test("US storefront keeps StoreKit USD", async () => {
  const { resolveAppleCardDisplayPrice, shouldUseJapanAppleCardDisplayPrices } = await import("./applePlanCards");
  assert.equal(
    shouldUseJapanAppleCardDisplayPrices({ storefrontCountryCode: "US" }),
    false,
  );
  assert.equal(
    resolveAppleCardDisplayPrice({
      productId: APPLE_PRODUCT_IDS.plusMonthly,
      storefrontCountryCode: "US",
      store: { productId: APPLE_PRODUCT_IDS.plusMonthly, displayPrice: "$9.99", currency: "USD", title: "", description: "" },
      unavailableLabel: "pending",
    }),
    "$9.99",
  );
});

test("non-Japan and unknown storefronts keep StoreKit displayPrice", async () => {
  const { resolveAppleCardDisplayPrice } = await import("./applePlanCards");
  assert.equal(
    resolveAppleCardDisplayPrice({
      productId: APPLE_PRODUCT_IDS.plusMonthly,
      storefrontCountryCode: "US",
      store: { productId: APPLE_PRODUCT_IDS.plusMonthly, displayPrice: "$9.99", currency: "USD", title: "", description: "" },
      unavailableLabel: "pending",
    }),
    "$9.99",
  );
  assert.equal(
    resolveAppleCardDisplayPrice({
      productId: APPLE_PRODUCT_IDS.plusMonthly,
      storefrontCountryCode: null,
      store: { productId: APPLE_PRODUCT_IDS.plusMonthly, displayPrice: "$9.99", currency: null, title: "", description: "" },
      unavailableLabel: "pending",
    }),
    "$9.99",
  );
  assert.equal(
    resolveAppleCardDisplayPrice({
      productId: APPLE_PRODUCT_IDS.plusMonthly,
      storefrontCountryCode: "",
      store: undefined,
      unavailableLabel: "pending",
    }),
    "pending",
  );
});

test("plan.tsx loads products before storefront and gates purchase success on entitlement", () => {
  const page = read("apps/mobile/app/(app)/plan.tsx");
  assert.match(page, /loadAppleStoreCatalogForPlan/);
  assert.match(page, /loadAppleStorefrontCountryCode/);
  assert.match(page, /useFocusEffect/);
  assert.match(page, /appleStorefrontPending/);
  assert.match(page, /storefrontPending:/);
  assert.match(page, /isActiveApplePaidEntitlement/);
  assert.match(page, /plan\.appleActivationFailed/);
  assert.match(page, /storefrontCountryCode:\s*appleStorefrontCountryCode/);
  assert.match(page, /purchaseAppleSubscription\(\{\s*productId,/);
  assert.match(page, /onPurchase\(card\.productId\)/);
  assert.doesNotMatch(page, /Promise\.all\(\[\s*loadAppleSubscriptionProducts/);
});

test("loadAppleStoreCatalogForPlan is sequential products-then-storefront", () => {
  const iapSource = read("apps/mobile/src/billing/appleIap.ts");
  assert.match(iapSource, /STOREFRONT_FETCH_ATTEMPTS\s*=\s*8/);
  assert.match(iapSource, /loadAppleStoreCatalogForPlan/);
  assert.match(iapSource, /const products = await loadAppleSubscriptionProducts\(\);/);
  assert.match(iapSource, /const storefrontCountryCode = await loadAppleStorefrontCountryCode\(\);/);
  assert.match(iapSource, /currencyCodeIOS/);
});

test("isActiveApplePaidEntitlement gates success banners", async () => {
  const { isActiveApplePaidEntitlement, userFacingAppleBillingError } = await import("./applePlanUi");
  assert.equal(
    isActiveApplePaidEntitlement({
      purchase_source: "apple",
      status: "active",
      subscribed_plan: { key: "plus" },
      effective_plan: { key: "plus" },
    }),
    true,
  );
  assert.equal(
    isActiveApplePaidEntitlement({
      purchase_source: "apple",
      status: "active",
      subscribed_plan: { key: "business" },
      effective_plan: { key: "business" },
    }),
    true,
  );
  assert.equal(
    isActiveApplePaidEntitlement({
      purchase_source: "none",
      status: "canceled",
      subscribed_plan: { key: null },
      effective_plan: { key: "basic" },
    }),
    false,
  );
  assert.equal(
    isActiveApplePaidEntitlement({
      purchase_source: "apple",
      status: "canceled",
      subscribed_plan: { key: "plus" },
      effective_plan: { key: "basic" },
    }),
    false,
  );
  assert.match(
    userFacingAppleBillingError({ code: "apple_entitlement_inactive" }, "fallback"),
    /could not be activated/i,
  );
});

test("openAppleManageSubscriptions prefers native sheet and deep-links only when unsupported", async () => {
  const iapSource = read("apps/mobile/src/billing/appleIap.ts");
  assert.match(iapSource, /showManageSubscriptionsIOS/);
  assert.match(iapSource, /runAppleManageSubscriptions/);
  assert.match(iapSource, /native_sheet|deep_link/);

  const {
    isUnsupportedAppleManageSubscriptionsError,
    runAppleManageSubscriptions,
  } = await import("./appleManageSubscriptions");

  assert.equal(isUnsupportedAppleManageSubscriptionsError({ code: "unsupported" }), true);
  assert.equal(isUnsupportedAppleManageSubscriptionsError({ message: "not available" }), true);
  assert.equal(isUnsupportedAppleManageSubscriptionsError({ code: "E_UNKNOWN", message: "boom" }), false);

  let nativeCalls = 0;
  let deepLinkCalls = 0;
  const nativeResult = await runAppleManageSubscriptions({
    showManageSubscriptionsIOS: async () => {
      nativeCalls += 1;
    },
    deepLinkToSubscriptions: async () => {
      deepLinkCalls += 1;
    },
  });
  assert.equal(nativeResult, "native_sheet");
  assert.equal(nativeCalls, 1);
  assert.equal(deepLinkCalls, 0);

  nativeCalls = 0;
  deepLinkCalls = 0;
  const fallbackResult = await runAppleManageSubscriptions({
    showManageSubscriptionsIOS: async () => {
      nativeCalls += 1;
      throw Object.assign(new Error("not available"), { code: "unsupported" });
    },
    deepLinkToSubscriptions: async () => {
      deepLinkCalls += 1;
    },
  });
  assert.equal(fallbackResult, "deep_link");
  assert.equal(nativeCalls, 1);
  assert.equal(deepLinkCalls, 1);

  deepLinkCalls = 0;
  const missingNativeResult = await runAppleManageSubscriptions({
    deepLinkToSubscriptions: async () => {
      deepLinkCalls += 1;
    },
  });
  assert.equal(missingNativeResult, "deep_link");
  assert.equal(deepLinkCalls, 1);

  await assert.rejects(
    () => runAppleManageSubscriptions({
      showManageSubscriptionsIOS: async () => {
        throw Object.assign(new Error("network failed"), { code: "E_NETWORK" });
      },
      deepLinkToSubscriptions: async () => {
        deepLinkCalls += 1;
      },
    }),
    /network failed/,
  );
});

test("MAS manage still uses App Store URL; mobile restore path unchanged", () => {
  const desktopBridge = read("apps/desktop/native/MacApple/Sources/BridgeCore.swift");
  const desktopTest = read("apps/desktop/src/pages/applePlanSwitching.test.ts");
  const iap = read("apps/mobile/src/billing/appleIap.ts");
  const page = read("apps/mobile/app/(app)/plan.tsx");
  assert.match(desktopBridge, /https:\/\/apps\.apple\.com\/account\/subscriptions/);
  assert.match(desktopTest, /Manage Subscription path unchanged/);
  assert.match(iap, /expoIapRestorePurchases/);
  assert.match(page, /restoreApplePurchases/);
  assert.doesNotMatch(page, /showManageSubscriptionsIOS/);
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
  assert.match(page, /loadAppleStoreCatalogForPlan/);
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
