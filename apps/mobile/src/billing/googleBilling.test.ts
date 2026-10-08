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

/** openiap-google 1.3.28 shape for a normal paid base plan. */
function openiapBaseOffer(
  basePlanId: "monthly" | "yearly",
  overrides: Record<string, unknown> = {},
) {
  return {
    basePlanIdAndroid: basePlanId,
    id: basePlanId, // id = offerId ?: basePlanId
    offerTokenAndroid: `token-${basePlanId}`,
    displayPrice: basePlanId === "yearly" ? "¥9,800" : "¥980",
    currency: "JPY",
    type: "introductory", // openiap marks paid base plans as Introductory
    ...overrides,
  };
}

function plusProduct(offers: Array<Record<string, unknown>>) {
  return {
    id: GOOGLE_PRODUCT_IDS.plus,
    title: "Plus",
    subscriptionOffers: offers,
    subscriptionOfferDetailsAndroid: [],
  };
}

function businessProduct(offers: Array<Record<string, unknown>>) {
  return {
    id: GOOGLE_PRODUCT_IDS.business,
    title: "Business",
    subscriptionOffers: offers,
    subscriptionOfferDetailsAndroid: [],
  };
}

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

describe("normal base-plan offer selection (openiap 1.3.28 shape)", () => {
  it("accepts normal monthly with id===basePlanId and type introductory", () => {
    assert.equal(isNormalGoogleBasePlanOffer(openiapBaseOffer("monthly")), true);
  });

  it("accepts normal yearly with id===basePlanId and type introductory", () => {
    assert.equal(isNormalGoogleBasePlanOffer(openiapBaseOffer("yearly")), true);
  });

  it("accepts empty id with matching basePlanId", () => {
    assert.equal(
      isNormalGoogleBasePlanOffer({
        basePlanIdAndroid: "monthly",
        id: "",
        offerTokenAndroid: "token-m",
        displayPrice: "¥980",
        type: "introductory",
      }),
      true,
    );
  });

  it("rejects promotional id distinct from basePlanId", () => {
    assert.equal(
      isNormalGoogleBasePlanOffer({
        basePlanIdAndroid: "monthly",
        id: "promo-offer-id",
        offerTokenAndroid: "token-promo",
        displayPrice: "¥0",
        type: "promotional",
      }),
      false,
    );
  });

  it("rejects true playOfferId when present", () => {
    assert.equal(
      isNormalGoogleBasePlanOffer({
        basePlanIdAndroid: "monthly",
        id: "monthly",
        playOfferId: "intro-7day",
        offerTokenAndroid: "token-promo",
        displayPrice: "¥0",
      }),
      false,
    );
  });

  it("accepts playOfferId null/empty as normal base plan", () => {
    assert.equal(
      isNormalGoogleBasePlanOffer({
        basePlanIdAndroid: "monthly",
        id: "monthly",
        playOfferId: null,
        offerTokenAndroid: "token-m",
        displayPrice: "¥980",
        type: "promotional", // type alone must not reject when playOfferId is empty
      }),
      true,
    );
  });

  it("type introductory alone must not cause rejection", () => {
    assert.equal(
      isNormalGoogleBasePlanOffer({
        ...openiapBaseOffer("monthly"),
        type: "introductory",
      }),
      true,
    );
  });

  it("type promotional alone must not reject when id equals basePlanId", () => {
    // openiap may mis-label; identity (id === basePlanId) is authoritative for base plans.
    assert.equal(
      isNormalGoogleBasePlanOffer({
        ...openiapBaseOffer("monthly"),
        type: "promotional",
      }),
      true,
    );
  });

  it("rejects missing offerTokenAndroid", () => {
    assert.equal(
      isNormalGoogleBasePlanOffer({
        ...openiapBaseOffer("monthly"),
        offerTokenAndroid: "",
      }),
      false,
    );
  });

  it("rejects missing basePlanId", () => {
    assert.equal(
      isNormalGoogleBasePlanOffer({
        basePlanIdAndroid: "",
        id: "",
        offerTokenAndroid: "token",
        displayPrice: "¥980",
      }),
      false,
    );
  });

  it("rejects mismatched requested base plan", () => {
    const product = plusProduct([openiapBaseOffer("monthly")]);
    assert.equal(selectNormalBasePlanOffer(product, "yearly"), null);
  });

  it("rejects missing displayPrice at selection", () => {
    const product = plusProduct([
      openiapBaseOffer("monthly", { displayPrice: "" }),
    ]);
    assert.equal(selectNormalBasePlanOffer(product, "monthly"), null);
  });

  it("rejects unsupported basePlanId", () => {
    const product = plusProduct([
      openiapBaseOffer("monthly", { basePlanIdAndroid: "weekly", id: "weekly" }),
    ]);
    assert.equal(selectNormalBasePlanOffer(product as any, "monthly"), null);
  });

  it("selects Plus monthly", () => {
    const product = plusProduct([
      openiapBaseOffer("monthly", { displayPrice: "¥980", offerTokenAndroid: "plus-m" }),
      openiapBaseOffer("yearly", { displayPrice: "¥9,800", offerTokenAndroid: "plus-y" }),
    ]);
    const selected = selectNormalBasePlanOffer(product, "monthly");
    assert.equal(selected?.offerToken, "plus-m");
    assert.equal(selected?.displayPrice, "¥980");
  });

  it("selects Plus yearly", () => {
    const product = plusProduct([
      openiapBaseOffer("monthly", { offerTokenAndroid: "plus-m" }),
      openiapBaseOffer("yearly", { displayPrice: "¥9,800", offerTokenAndroid: "plus-y" }),
    ]);
    const selected = selectNormalBasePlanOffer(product, "yearly");
    assert.equal(selected?.offerToken, "plus-y");
    assert.equal(selected?.displayPrice, "¥9,800");
  });

  it("selects Business monthly", () => {
    const product = businessProduct([
      openiapBaseOffer("monthly", { displayPrice: "¥1,480", offerTokenAndroid: "biz-m" }),
      openiapBaseOffer("yearly", { displayPrice: "¥14,800", offerTokenAndroid: "biz-y" }),
    ]);
    const selected = selectNormalBasePlanOffer(product, "monthly");
    assert.equal(selected?.offerToken, "biz-m");
    assert.equal(selected?.displayPrice, "¥1,480");
  });

  it("selects Business yearly", () => {
    const product = businessProduct([
      openiapBaseOffer("monthly", { offerTokenAndroid: "biz-m" }),
      openiapBaseOffer("yearly", { displayPrice: "¥14,800", offerTokenAndroid: "biz-y" }),
    ]);
    const selected = selectNormalBasePlanOffer(product, "yearly");
    assert.equal(selected?.offerToken, "biz-y");
    assert.equal(selected?.displayPrice, "¥14,800");
  });

  it("selects normal base plan and ignores promo beside it", () => {
    const product = plusProduct([
      {
        basePlanIdAndroid: "monthly",
        id: "promo-intro",
        offerTokenAndroid: "promo-token",
        displayPrice: "¥0",
        currency: "JPY",
        type: "introductory",
      },
      openiapBaseOffer("monthly", { displayPrice: "¥980", offerTokenAndroid: "base-token" }),
      openiapBaseOffer("yearly", { displayPrice: "¥9,800", offerTokenAndroid: "year-token" }),
    ]);
    const monthly = selectNormalBasePlanOffer(product, "monthly");
    assert.equal(monthly?.offerToken, "base-token");
    assert.equal(monthly?.displayPrice, "¥980");
    const yearly = selectNormalBasePlanOffer(product, "yearly");
    assert.equal(yearly?.offerToken, "year-token");
  });

  it("disables purchase when only promotional offers exist", () => {
    const product = plusProduct([
      {
        basePlanIdAndroid: "monthly",
        id: "promo",
        offerTokenAndroid: "promo-token",
        displayPrice: "¥0",
        currency: "JPY",
        type: "promotional",
      },
    ]);
    assert.equal(selectNormalBasePlanOffer(product, "monthly"), null);
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
    assert.equal(
      shouldShowStripePromoOnMobile({ purchase_source: "none", can_start_apple: true }),
      false,
    );
    assert.equal(
      shouldShowStripePromoOnMobile({
        purchase_source: "none",
        can_start_apple: false,
        can_start_google: false,
      }),
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
