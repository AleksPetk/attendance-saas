/** Canonical Google Play subscription product + base-plan IDs (Play Console). */

export const GOOGLE_PLAY_PACKAGE_NAME = "app.checkstation.mobile";

export const GOOGLE_PRODUCT_IDS = {
  plus: "checkstation.plus",
  business: "checkstation.business",
} as const;

export const GOOGLE_BASE_PLAN_IDS = {
  monthly: "monthly",
  yearly: "yearly",
} as const;

export type GoogleProductId = (typeof GOOGLE_PRODUCT_IDS)[keyof typeof GOOGLE_PRODUCT_IDS];
export type GoogleBasePlanId = (typeof GOOGLE_BASE_PLAN_IDS)[keyof typeof GOOGLE_BASE_PLAN_IDS];
export type GooglePlanKey = "plus" | "business";
export type GoogleIntervalKey = "monthly" | "yearly";

export const GOOGLE_PRODUCT_ID_LIST: GoogleProductId[] = [
  GOOGLE_PRODUCT_IDS.plus,
  GOOGLE_PRODUCT_IDS.business,
];

export type GooglePlanOptionKey =
  | "plusMonthly"
  | "plusYearly"
  | "businessMonthly"
  | "businessYearly";

export type GooglePlanOption = {
  key: GooglePlanOptionKey;
  productId: GoogleProductId;
  basePlanId: GoogleBasePlanId;
  plan: GooglePlanKey;
  interval: GoogleIntervalKey;
};

export const GOOGLE_PLAN_OPTIONS: GooglePlanOption[] = [
  {
    key: "plusMonthly",
    productId: GOOGLE_PRODUCT_IDS.plus,
    basePlanId: GOOGLE_BASE_PLAN_IDS.monthly,
    plan: "plus",
    interval: "monthly",
  },
  {
    key: "plusYearly",
    productId: GOOGLE_PRODUCT_IDS.plus,
    basePlanId: GOOGLE_BASE_PLAN_IDS.yearly,
    plan: "plus",
    interval: "yearly",
  },
  {
    key: "businessMonthly",
    productId: GOOGLE_PRODUCT_IDS.business,
    basePlanId: GOOGLE_BASE_PLAN_IDS.monthly,
    plan: "business",
    interval: "monthly",
  },
  {
    key: "businessYearly",
    productId: GOOGLE_PRODUCT_IDS.business,
    basePlanId: GOOGLE_BASE_PLAN_IDS.yearly,
    plan: "business",
    interval: "yearly",
  },
];

export function googleOptionFor(
  plan: GooglePlanKey,
  interval: GoogleIntervalKey,
): GooglePlanOption {
  const found = GOOGLE_PLAN_OPTIONS.find(
    (option) => option.plan === plan && option.interval === interval,
  );
  if (!found) throw new Error(`No Google product for ${plan}/${interval}`);
  return found;
}

export function googleOptionMeta(productId: string, basePlanId: string): GooglePlanOption | null {
  return (
    GOOGLE_PLAN_OPTIONS.find(
      (option) => option.productId === productId && option.basePlanId === basePlanId,
    ) || null
  );
}
