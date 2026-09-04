import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogPromotion,
  formatPercentOffDuration,
  isAcquisitionPromotion,
  localizedPromotionSummary,
  offerDisplayLines,
  promotionCheckoutWarning,
  promotionOffers,
  promotionPriceLabel,
  promotionPriceNote,
} from "./promotionCatalog.js";

const acquisitionCatalog = {
  promotion: {
    audience: "public",
    group: "new_basic",
    active: true,
    mode: "normal",
    label: "New / Basic",
    summary: "50% off first month; 30% off first year",
    checkout_applies_promotion: false,
    offers: [
      {
        id: "new_basic_normal_plus_monthly",
        target_plan: "plus",
        target_interval: "monthly",
        discount_percent: 50,
        duration_label: "first_month",
        promotional_formatted: "$4.99",
        renews_at_formatted: "$9.99",
        label: "50% off first month",
        checkout_applies_promotion: false,
      },
      {
        id: "new_basic_normal_plus_yearly",
        target_plan: "plus",
        target_interval: "yearly",
        discount_percent: 30,
        duration_label: "first_year",
        promotional_formatted: "$69.99",
        renews_at_formatted: "$99.99",
        label: "30% off first year",
        checkout_applies_promotion: false,
      },
      {
        id: "new_basic_normal_business_monthly",
        target_plan: "business",
        target_interval: "monthly",
        discount_percent: 50,
        duration_label: "first_month",
        promotional_formatted: "$7.49",
        renews_at_formatted: "$14.99",
        label: "50% off first month",
        checkout_applies_promotion: false,
      },
      {
        id: "new_basic_normal_business_yearly",
        target_plan: "business",
        target_interval: "yearly",
        discount_percent: 30,
        duration_label: "first_year",
        promotional_formatted: "$104.99",
        renews_at_formatted: "$149.99",
        label: "30% off first year",
        checkout_applies_promotion: false,
      },
    ],
  },
  plans: {
    plus: {
      intervals: {
        monthly: {
          formatted: "$9.99",
          promotion: {
            active: true,
            discount_percent: 50,
            first_period_formatted: "$4.99",
            applies_to: "first_month",
            renews_at_formatted: "$9.99",
            checkout_applies_promotion: false,
          },
        },
      },
    },
  },
};

const plusMonthlyCatalog = {
  promotion: {
    audience: "plus_monthly",
    group: "plus_monthly",
    active: true,
    mode: "on",
    label: "Plus Monthly",
    summary: "retention offers",
    checkout_applies_promotion: false,
    offers: [
      {
        id: "plus_monthly_to_plus_yearly",
        target_plan: "plus",
        target_interval: "yearly",
        offer_type: "first_year_percentage",
        discount_percent: 30,
        duration_label: "first_year",
        label: "30% off first Plus Yearly payment",
        promotional_formatted: "$69.99",
        renews_at_formatted: "$99.99",
        checkout_applies_promotion: true,
      },
      {
        id: "plus_monthly_to_business_yearly",
        target_plan: "business",
        target_interval: "yearly",
        offer_type: "first_year_percentage",
        discount_percent: 30,
        duration_label: "first_year",
        label: "30% off first Business Yearly payment",
        promotional_formatted: "$104.99",
        renews_at_formatted: "$149.99",
        checkout_applies_promotion: true,
      },
    ],
  },
  plans: {
    plus: {
      intervals: {
        monthly: {
          formatted: "$9.99",
          promotion: { active: false },
        },
      },
    },
  },
};

const bigYearlyCatalog = {
  promotion: {
    audience: "public",
    group: "new_basic",
    active: true,
    mode: "big",
    offers: [
      {
        id: "new_basic_big_plus_yearly",
        target_plan: "plus",
        target_interval: "yearly",
        discount_percent: 50,
        promotional_formatted: "$49.99",
        renews_at_formatted: "$99.99",
        label: "50% off first year",
      },
      {
        id: "new_basic_big_business_yearly",
        target_plan: "business",
        target_interval: "yearly",
        discount_percent: 50,
        promotional_formatted: "$74.99",
        renews_at_formatted: "$149.99",
        label: "50% off first year",
      },
    ],
  },
  plans: {
    plus: {
      intervals: {
        yearly: {
          formatted: "$99.99",
          promotion: {
            active: true,
            discount_percent: 50,
            first_period_formatted: "$49.99",
            applies_to: "first_year",
            renews_at_formatted: "$99.99",
          },
        },
      },
    },
    business: {
      intervals: {
        yearly: {
          formatted: "$149.99",
          promotion: {
            active: true,
            discount_percent: 50,
            first_period_formatted: "$74.99",
            applies_to: "first_year",
            renews_at_formatted: "$149.99",
          },
        },
      },
    },
  },
};

describe("promotionCatalog helpers", () => {
  it("reads Group 1 acquisition amounts from API data", () => {
    assert.equal(promotionPriceLabel(acquisitionCatalog, "plus", "monthly"), "$4.99");
    assert.match(
      promotionPriceNote(acquisitionCatalog, "plus", "monthly"),
      /50% off first month/,
    );
    assert.equal(catalogPromotion(acquisitionCatalog).mode, "normal");
    assert.equal(isAcquisitionPromotion(acquisitionCatalog), true);
  });

  it("renders BIG yearly fixed coupon amounts from API (not 50% of list)", () => {
    assert.equal(promotionPriceLabel(bigYearlyCatalog, "plus", "yearly"), "$49.99");
    assert.equal(promotionPriceLabel(bigYearlyCatalog, "business", "yearly"), "$74.99");
    assert.match(
      promotionPriceNote(bigYearlyCatalog, "plus", "yearly"),
      /50% off first year, then \$99\.99\/year/,
    );
    assert.match(
      promotionPriceNote(bigYearlyCatalog, "business", "yearly"),
      /50% off first year, then \$149\.99\/year/,
    );
    // Must not invent percentage math locally ($50.00 / $75.00 after rounding).
    assert.notEqual(
      promotionPriceLabel(bigYearlyCatalog, "plus", "yearly"),
      "$50.00",
    );
    assert.notEqual(
      promotionPriceLabel(bigYearlyCatalog, "business", "yearly"),
      "$75.00",
    );
  });

  it("exposes Plus Monthly annual offers only", () => {
    assert.equal(isAcquisitionPromotion(plusMonthlyCatalog), false);
    assert.equal(promotionOffers(plusMonthlyCatalog).length, 2);
    const [plusYearly, bizYearly] = plusMonthlyCatalog.promotion.offers;
    assert.equal(plusYearly.promotional_formatted, "$69.99");
    assert.equal(bizYearly.promotional_formatted, "$104.99");
    const lines = offerDisplayLines(plusYearly);
    assert.ok(lines.some((line) => /30% off first Plus Yearly/.test(line)));
    assert.ok(lines.some((line) => /\$69\.99 now/.test(line)));
  });

  it("warns when checkout does not yet apply the promotion", () => {
    const warning = promotionCheckoutWarning(acquisitionCatalog);
    assert.ok(warning);
    assert.match(warning, /list price/i);
  });

  it("shows normal price when promotion is off", () => {
    const off = {
      promotion: {
        group: "new_basic",
        active: false,
        mode: "off",
        checkout_applies_promotion: false,
        offers: [],
      },
      plans: {
        plus: {
          intervals: {
            monthly: {
              formatted: "$9.99",
              promotion: { active: false },
            },
          },
        },
      },
    };
    assert.equal(promotionPriceLabel(off, "plus", "monthly"), "$9.99");
    assert.equal(promotionCheckoutWarning(off), null);
  });

  it("localizes English generated discount summary", () => {
    const enT = (key, opts = {}) =>
      ({
        percentOff: `${opts.percent}% off ${opts.duration}`,
        firstMonth: "first month",
        firstYear: "first year",
        firstPeriod: "first period",
        summaryJoin: "; ",
      })[key] ?? key;
    const summary = localizedPromotionSummary(acquisitionCatalog, enT);
    assert.equal(summary, "50% off first month; 30% off first year");
    assert.match(summary, /50%/);
    assert.match(summary, /30%/);
  });

  it("localizes Japanese generated discount summary", () => {
    const jaT = (key, opts = {}) =>
      ({
        percentOff: `${opts.duration}${opts.percent}%OFF`,
        firstMonth: "初月",
        firstYear: "初年度",
        firstPeriod: "初回",
        summaryJoin: "・",
      })[key] ?? key;
    const summary = localizedPromotionSummary(acquisitionCatalog, jaT);
    assert.equal(summary, "初月50%OFF・初年度30%OFF");
    assert.match(summary, /50%/);
    assert.match(summary, /30%/);
    assert.doesNotMatch(summary, /off first/i);
  });

  it("preserves percentages when formatting a single phrase", () => {
    const enT = (key, opts = {}) =>
      ({
        percentOff: `${opts.percent}% off ${opts.duration}`,
        firstMonth: "first month",
        firstYear: "first year",
      })[key] ?? key;
    const jaT = (key, opts = {}) =>
      ({
        percentOff: `${opts.duration}${opts.percent}%OFF`,
        firstMonth: "初月",
        firstYear: "初年度",
      })[key] ?? key;
    assert.equal(formatPercentOffDuration(enT, 70, "first_month"), "70% off first month");
    assert.equal(formatPercentOffDuration(jaT, 70, "first_month"), "初月70%OFF");
  });
});
