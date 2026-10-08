import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isNormalGoogleBasePlanOffer,
  selectNormalBasePlanOffer,
} from "./googleOfferSelection";
import {
  GOOGLE_BASE_PLAN_IDS,
  GOOGLE_PLAN_OPTIONS,
  GOOGLE_PRODUCT_IDS,
  googleOptionFor,
  googleOptionMeta,
} from "./googleProducts";
import {
  googleBlockedByOtherProvider,
  googleManaged,
  googlePurchaseEligible,
  isActiveGooglePaidEntitlement,
  shouldLoadGoogleStoreProducts,
  userFacingGoogleBillingError,
} from "./googlePlanUi";
import { shouldShowStripePromoOnMobile } from "./applePlanUi";

describe("googleProducts", () => {
  it("maps the four base plans", () => {
    assert.equal(GOOGLE_PLAN_OPTIONS.length, 4);
    assert.deepEqual(googleOptionFor("plus", "monthly"), {
      key: "plusMonthly",
      productId: GOOGLE_PRODUCT_IDS.plus,
      basePlanId: GOOGLE_BASE_PLAN_IDS.monthly,
      plan: "plus",
      interval: "monthly",
    });
    assert.equal(
      googleOptionMeta(GOOGLE_PRODUCT_IDS.business, GOOGLE_BASE_PLAN_IDS.yearly)?.plan,
      "business",
    );
  });
});

describe("normal base-plan offer selection", () => {
  it("accepts empty offerId base-plan entries", () => {
    assert.equal(
      isNormalGoogleBasePlanOffer({
        basePlanIdAndroid: "monthly",
        id: "",
        offerTokenAndroid: "token-m",
        type: "one-time",
      }),
      true,
    );
  });

  it("rejects promotional offerId entries", () => {
    assert.equal(
      isNormalGoogleBasePlanOffer({
        basePlanIdAndroid: "monthly",
        id: "intro-offer",
        offerTokenAndroid: "token-promo",
        type: "introductory",
      }),
      false,
    );
  });

  it("selects normal monthly and ignores promo", () => {
    const product = {
      id: GOOGLE_PRODUCT_IDS.plus,
      title: "Plus",
      description: "",
      type: "subs" as const,
      platform: "android" as const,
      displayPrice: "$9.99",
      currency: "USD",
      nameAndroid: "Plus",
      subscriptionOfferDetailsAndroid: [],
      subscriptionOffers: [
        {
          basePlanIdAndroid: "monthly",
          id: "promo",
          offerTokenAndroid: "promo-token",
          displayPrice: "$0.99",
          currency: "USD",
          price: 0.99,
          type: "introductory" as const,
        },
        {
          basePlanIdAndroid: "monthly",
          id: "",
          offerTokenAndroid: "base-token",
          displayPrice: "$9.99",
          currency: "USD",
          price: 9.99,
          type: "one-time" as const,
        },
        {
          basePlanIdAndroid: "yearly",
          id: "",
          offerTokenAndroid: "year-token",
          displayPrice: "$99.99",
          currency: "USD",
          price: 99.99,
          type: "one-time" as const,
        },
      ],
    };
    const monthly = selectNormalBasePlanOffer(product as any, "monthly");
    assert.equal(monthly?.offerToken, "base-token");
    assert.equal(monthly?.displayPrice, "$9.99");
    const yearly = selectNormalBasePlanOffer(product as any, "yearly");
    assert.equal(yearly?.offerToken, "year-token");
  });

  it("disables purchase when only promotional offers exist", () => {
    const product = {
      id: GOOGLE_PRODUCT_IDS.plus,
      title: "Plus",
      description: "",
      type: "subs" as const,
      platform: "android" as const,
      displayPrice: "$9.99",
      currency: "USD",
      nameAndroid: "Plus",
      subscriptionOfferDetailsAndroid: [],
      subscriptionOffers: [
        {
          basePlanIdAndroid: "monthly",
          id: "promo",
          offerTokenAndroid: "promo-token",
          displayPrice: "$0.99",
          currency: "USD",
          price: 0.99,
          type: "promotional" as const,
        },
      ],
    };
    assert.equal(selectNormalBasePlanOffer(product as any, "monthly"), null);
  });
});

describe("googlePlanUi", () => {
  it("gates purchase eligibility and management", () => {
    assert.equal(googlePurchaseEligible({ purchase_source: "none", can_start_google: true }), true);
    assert.equal(googlePurchaseEligible({ purchase_source: "google", can_start_google: true }), false);
    assert.equal(googleManaged({ purchase_source: "google", can_manage_google: true }), true);
    assert.equal(googleBlockedByOtherProvider({ purchase_source: "apple" }), "apple");
    assert.equal(googleBlockedByOtherProvider({ purchase_source: "stripe" }), "stripe");
    assert.equal(
      shouldLoadGoogleStoreProducts({ purchase_source: "none", can_start_google: true }),
      true,
    );
    assert.equal(
      isActiveGooglePaidEntitlement({
        purchase_source: "google",
        status: "active",
        subscribed_plan: { key: "plus" },
        effective_plan: { key: "plus" },
      }),
      true,
    );
  });

  it("hides Stripe promo for Google-owned billing", () => {
    assert.equal(shouldShowStripePromoOnMobile({ purchase_source: "google" }), false);
    // Apple-eligible Basic also hides Stripe promo (native Apple shop owns the path).
    assert.equal(
      shouldShowStripePromoOnMobile({ purchase_source: "none", can_start_apple: true }),
      false,
    );
    // Neither native shop flag: Stripe promo may show (web-style mobile fallback).
    assert.equal(
      shouldShowStripePromoOnMobile({ purchase_source: "none", can_start_apple: false, can_start_google: false }),
      true,
    );
  });

  it("maps ownership errors", () => {
    assert.match(
      userFacingGoogleBillingError({ code: "google_purchase_bound_elsewhere" }, "x"),
      /another workspace/,
    );
  });
});
