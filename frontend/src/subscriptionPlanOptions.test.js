/**
 * Run: node --test src/subscriptionPlanOptions.test.js
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDowngradePlanOptions,
  buildUpgradePlanOptions,
  commercialPlanKey,
  isEffectiveCurrentPlanOption,
  isHighestPaidPlan,
  targetOfferPricing,
} from "./subscriptionPlanOptions.js";

const catalog = {
  basic: { display_name: "Basic", formatted: "Free" },
  plans: {
    plus: {
      display_name: "Plus",
      intervals: {
        monthly: { formatted: "$9.99" },
        yearly: { formatted: "$99.99" },
      },
    },
    business: {
      display_name: "Business",
      intervals: {
        monthly: { formatted: "$14.99" },
        yearly: { formatted: "$149.99" },
      },
    },
  },
  promotion: {
    group: "plus_monthly",
    active: true,
    offers: [
      {
        id: "plus_monthly_to_plus_yearly",
        target_plan: "plus",
        target_interval: "yearly",
        discount_percent: 30,
        promotional_formatted: "$69.99",
        renews_at_formatted: "$99.99",
        label: "30% off first Plus Yearly payment",
        checkout_applies_promotion: true,
      },
      {
        id: "plus_monthly_to_business_yearly",
        target_plan: "business",
        target_interval: "yearly",
        discount_percent: 30,
        promotional_formatted: "$104.99",
        renews_at_formatted: "$149.99",
        label: "30% off first Business Yearly payment",
        checkout_applies_promotion: true,
      },
    ],
  },
};

const checkoutActions = {
  can_checkout_plus: true,
  can_checkout_business: true,
  can_upgrade_to_business: false,
  can_schedule_billing_change: false,
  can_change_interval: false,
  can_cancel: false,
  can_schedule_downgrade_to_plus: false,
};

function plusMonthlyBilling(overrides = {}) {
  return {
    effective_plan: { key: "plus", display_name: "Plus" },
    subscribed_plan: { key: "plus", display_name: "Plus" },
    interval: "monthly",
    status: "active",
    cancel_at_period_end: false,
    catalog,
    actions: {
      can_upgrade_to_business: true,
      can_schedule_billing_change: true,
      can_change_interval: true,
      can_cancel: true,
      can_schedule_downgrade_to_plus: false,
      can_checkout_plus: false,
      can_checkout_business: false,
    },
    ...overrides,
  };
}

function optionIds(options) {
  return options.map((o) => `${o.plan}:${o.interval}:${o.kind}`);
}

function assertNoBasicCard(options) {
  assert.equal(options.some((o) => o.plan === "basic"), false);
}

describe("isEffectiveCurrentPlanOption", () => {
  it("marks only Plus Monthly current when interval is monthly", () => {
    const billing = plusMonthlyBilling();
    assert.equal(isEffectiveCurrentPlanOption(billing, "plus", "monthly"), true);
    assert.equal(isEffectiveCurrentPlanOption(billing, "plus", "yearly"), false);
    assert.equal(isEffectiveCurrentPlanOption(billing, "business", "monthly"), false);
    assert.equal(isEffectiveCurrentPlanOption(billing, "business", "yearly"), false);
  });

  it("does not treat scheduled Business Yearly as current", () => {
    const billing = plusMonthlyBilling({
      pending_plan: "business",
      pending_interval: "yearly",
      scheduled_change: { active: true, kind: "combined" },
    });
    assert.equal(isEffectiveCurrentPlanOption(billing, "plus", "monthly"), true);
    assert.equal(isEffectiveCurrentPlanOption(billing, "business", "yearly"), false);
  });
});

describe("commercial plan selection matrix", () => {
  it("1. Basic → four paid checkout options", () => {
    const billing = {
      effective_plan: { key: "basic" },
      subscribed_plan: { key: null },
      status: "none",
      interval: null,
      catalog,
      actions: checkoutActions,
    };
    const options = buildUpgradePlanOptions(billing);
    assert.deepEqual(optionIds(options).sort(), [
      "business:monthly:checkout",
      "business:yearly:checkout",
      "plus:monthly:checkout",
      "plus:yearly:checkout",
    ].sort());
    assert.equal(buildDowngradePlanOptions(billing).length, 0);
    assert.equal(isHighestPaidPlan(billing), false);
  });

  it("2. Basic + built-in Business trial → same four paid options", () => {
    const billing = {
      effective_plan: { key: "business" },
      subscribed_plan: { key: null },
      status: "none",
      interval: null,
      builtin_trial: { active: true },
      catalog,
      actions: checkoutActions,
    };
    const options = buildUpgradePlanOptions(billing);
    assert.equal(options.length, 4);
    assert.equal(options.every((o) => o.kind === "checkout"), true);
    assert.equal(commercialPlanKey(billing), null);
    assert.equal(isHighestPaidPlan(billing), false);
  });

  it("3. Plus Monthly → Plus Yearly + Business Monthly/Yearly; cancel; no Basic card", () => {
    const billing = plusMonthlyBilling();
    const options = buildUpgradePlanOptions(billing);
    const ids = options.map((o) => o.id);
    assert.ok(ids.includes("plus_monthly_to_plus_yearly"));
    assert.ok(ids.includes("plus_monthly_to_business_yearly"));
    assert.ok(ids.includes("business-monthly-upgrade"));
    assert.equal(options.some((o) => o.plan === "plus" && o.interval === "monthly"), false);
    assertNoBasicCard([...options, ...buildDowngradePlanOptions(billing)]);
    assert.equal(billing.actions.can_cancel, true);
  });

  it("4. Plus Yearly → Plus Monthly + Business Monthly/Yearly; no Basic card", () => {
    const billing = {
      effective_plan: { key: "plus" },
      subscribed_plan: { key: "plus" },
      interval: "yearly",
      status: "active",
      catalog: { ...catalog, promotion: { offers: [] } },
      actions: {
        can_upgrade_to_business: true,
        can_schedule_billing_change: true,
        can_change_interval: true,
        can_cancel: true,
        can_schedule_downgrade_to_plus: false,
        can_checkout_plus: false,
        can_checkout_business: false,
      },
    };
    const options = buildUpgradePlanOptions(billing);
    assert.ok(options.some((o) => o.plan === "plus" && o.interval === "monthly"));
    assert.ok(options.some((o) => o.plan === "business" && o.interval === "yearly"));
    assert.ok(options.some((o) => o.plan === "business" && o.interval === "monthly"));
    assert.equal(options.some((o) => o.plan === "plus" && o.interval === "yearly"), false);
    assertNoBasicCard([...options, ...buildDowngradePlanOptions(billing)]);
  });

  it("5. Business Monthly → Business Yearly + Plus downgrade; no Basic card", () => {
    const billing = {
      effective_plan: { key: "business" },
      subscribed_plan: { key: "business" },
      interval: "monthly",
      status: "active",
      purchase_source: "stripe",
      catalog: {
        ...catalog,
        promotion: {
          group: "business_monthly",
          active: true,
          offers: [
            {
              id: "business_monthly_to_business_yearly",
              target_plan: "business",
              target_interval: "yearly",
              promotional_formatted: "$104.99",
              renews_at_formatted: "$149.99",
              label: "30% off first Business Yearly payment",
              discount_percent: 30,
              checkout_applies_promotion: true,
            },
          ],
        },
      },
      actions: {
        can_schedule_billing_change: true,
        can_change_interval: true,
        can_upgrade_to_business: false,
        can_cancel: true,
        can_schedule_downgrade_to_plus: true,
      },
    };
    const upgrades = buildUpgradePlanOptions(billing);
    assert.equal(upgrades.length, 1);
    assert.equal(upgrades[0].plan, "business");
    assert.equal(upgrades[0].interval, "yearly");
    const downs = buildDowngradePlanOptions(billing);
    assert.ok(downs.some((o) => o.plan === "plus"));
    assert.equal(downs.some((o) => o.plan === "basic"), false);
    assert.equal(isHighestPaidPlan(billing), true);
  });

  it("6. Business Yearly → Business Monthly + Plus downgrade; no Basic card", () => {
    const billing = {
      effective_plan: { key: "business" },
      subscribed_plan: { key: "business" },
      interval: "yearly",
      status: "active",
      catalog: { ...catalog, promotion: { offers: [] } },
      actions: {
        can_schedule_billing_change: true,
        can_change_interval: true,
        can_cancel: true,
        can_schedule_downgrade_to_plus: true,
        can_upgrade_to_business: false,
      },
    };
    const upgrades = buildUpgradePlanOptions(billing);
    assert.equal(upgrades.length, 1);
    assert.equal(upgrades[0].interval, "monthly");
    const downs = buildDowngradePlanOptions(billing);
    assert.ok(downs.some((o) => o.plan === "plus" && o.kind === "downgrade_plus"));
    assert.equal(downs.some((o) => o.plan === "basic"), false);
  });

  it("7. Trial + Plus Monthly still shows four future-paid checkout choices", () => {
    const billing = {
      effective_plan: { key: "business" },
      subscribed_plan: { key: null },
      future_paid_plan: { key: "plus", interval: "monthly" },
      interval: null,
      status: "trialing",
      builtin_trial: { active: true },
      catalog,
      actions: checkoutActions,
    };
    const options = buildUpgradePlanOptions(billing);
    assert.equal(options.length, 4);
    assert.equal(options.every((o) => o.kind === "checkout"), true);
    assert.equal(commercialPlanKey(billing), null);
    assert.equal(isHighestPaidPlan(billing), false);
    const selected = options.find((o) => o.plan === "plus" && o.interval === "monthly");
    assert.equal(selected?.selectedFuture, true);
  });

  it("8. Trial + Plus Yearly future selection still shows four choices", () => {
    const billing = {
      effective_plan: { key: "business" },
      subscribed_plan: { key: null },
      future_paid_plan: { key: "plus", interval: "yearly" },
      interval: null,
      status: "trialing",
      builtin_trial: { active: true },
      catalog: { ...catalog, promotion: { offers: [] } },
      actions: checkoutActions,
    };
    const options = buildUpgradePlanOptions(billing);
    assert.equal(options.length, 4);
    assert.equal(options.every((o) => o.kind === "checkout"), true);
    assert.equal(isHighestPaidPlan(billing), false);
  });

  it("9. Trial + Business Monthly future selection still shows four choices", () => {
    const billing = {
      effective_plan: { key: "business" },
      subscribed_plan: { key: null },
      future_paid_plan: { key: "business", interval: "monthly" },
      interval: null,
      status: "trialing",
      builtin_trial: { active: true },
      catalog: { ...catalog, promotion: { offers: [] } },
      actions: checkoutActions,
    };
    assert.equal(buildUpgradePlanOptions(billing).length, 4);
    assert.equal(buildDowngradePlanOptions(billing).length, 0);
    assert.equal(isHighestPaidPlan(billing), false);
  });

  it("10. Trial + Business Yearly future selection still shows four choices", () => {
    const billing = {
      effective_plan: { key: "business" },
      subscribed_plan: { key: null },
      future_paid_plan: { key: "business", interval: "yearly" },
      interval: null,
      status: "trialing",
      builtin_trial: { active: true },
      catalog: { ...catalog, promotion: { offers: [] } },
      actions: checkoutActions,
    };
    assert.equal(buildUpgradePlanOptions(billing).length, 4);
    assert.equal(buildDowngradePlanOptions(billing).length, 0);
  });

  it("11–12. Trial + no future plan → four paid choices again", () => {
    const billing = {
      effective_plan: { key: "business" },
      subscribed_plan: { key: null },
      future_paid_plan: null,
      interval: null,
      status: "none",
      cancel_at_period_end: false,
      builtin_trial: { active: true },
      catalog,
      actions: checkoutActions,
    };
    const options = buildUpgradePlanOptions(billing);
    assert.equal(options.length, 4);
    assert.equal(options.every((o) => o.kind === "checkout"), true);
    assert.equal(commercialPlanKey(billing), null);
    assert.equal(isHighestPaidPlan(billing), false);
    assert.equal(buildDowngradePlanOptions(billing).length, 0);
  });
});

describe("buildUpgradePlanOptions Plus Monthly", () => {
  it("shows promo yearly offers and Business Monthly upgrade without Basic", () => {
    const options = buildUpgradePlanOptions(plusMonthlyBilling());
    const ids = options.map((o) => o.id);
    assert.ok(ids.includes("plus_monthly_to_plus_yearly"));
    assert.ok(ids.includes("plus_monthly_to_business_yearly"));
    assert.ok(ids.includes("business-monthly-upgrade"));
    assert.equal(
      options.find((o) => o.id === "plus_monthly_to_plus_yearly").pricing.firstPeriodFormatted,
      "$69.99",
    );
    assert.equal(
      options.find((o) => o.id === "plus_monthly_to_business_yearly").pricing
        .firstPeriodFormatted,
      "$104.99",
    );
    assert.equal(options.some((o) => o.plan === "basic"), false);
    assert.equal(
      options.some((o) => o.plan === "plus" && o.interval === "monthly"),
      false,
    );
  });
});

describe("targetOfferPricing", () => {
  it("reads exact backend promo amounts without percentage math", () => {
    const pricing = targetOfferPricing(plusMonthlyBilling(), "business", "yearly");
    assert.equal(pricing.firstPeriodFormatted, "$104.99");
    assert.notEqual(pricing.firstPeriodFormatted, "$74.95");
    assert.equal(pricing.renewsAtFormatted, "$149.99");
  });

  it("renders JPY catalog values without deriving currency from UI language", () => {
    const billing = {
      catalog: {
        market: "jp",
        currency: "jpy",
        plans: {
          plus: {
            intervals: {
              yearly: {
                amount_minor: 9800,
                formatted: "¥9,800",
                promotion: {
                  active: true,
                  first_period_amount_minor: 6900,
                  first_period_formatted: "¥6,900",
                  renews_at_formatted: "¥9,800",
                  applies_to: "first_year",
                  discount_percent: 30,
                  checkout_applies_promotion: true,
                },
              },
            },
          },
        },
        promotion: { offers: [] },
      },
    };
    const pricing = targetOfferPricing(billing, "plus", "yearly");
    assert.equal(pricing.firstPeriodFormatted, "¥6,900");
    assert.equal(pricing.renewsAtFormatted, "¥9,800");
  });
});
