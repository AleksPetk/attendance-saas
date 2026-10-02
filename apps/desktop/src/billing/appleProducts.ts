/** Canonical Apple IAP product IDs (shared with iOS / App Store Connect). */

export const APPLE_BUNDLE_ID = "app.checkstation.client";

export const APPLE_PRODUCT_IDS = {
  plusMonthly: "app.checkstation.plus.monthly",
  plusYearly: "app.checkstation.plus.yearly",
  businessMonthly: "app.checkstation.business.monthly",
  businessYearly: "app.checkstation.business.yearly",
} as const;

export type AppleProductId = (typeof APPLE_PRODUCT_IDS)[keyof typeof APPLE_PRODUCT_IDS];

export const APPLE_PRODUCT_ID_LIST: AppleProductId[] = [
  APPLE_PRODUCT_IDS.plusMonthly,
  APPLE_PRODUCT_IDS.plusYearly,
  APPLE_PRODUCT_IDS.businessMonthly,
  APPLE_PRODUCT_IDS.businessYearly,
];

export type ApplePlanKey = "plus" | "business";
export type AppleIntervalKey = "monthly" | "yearly";

const PRODUCT_TO_PLAN: Record<
  AppleProductId,
  { plan: ApplePlanKey; interval: AppleIntervalKey }
> = {
  [APPLE_PRODUCT_IDS.plusMonthly]: { plan: "plus", interval: "monthly" },
  [APPLE_PRODUCT_IDS.plusYearly]: { plan: "plus", interval: "yearly" },
  [APPLE_PRODUCT_IDS.businessMonthly]: { plan: "business", interval: "monthly" },
  [APPLE_PRODUCT_IDS.businessYearly]: { plan: "business", interval: "yearly" },
};

export function appleProductMeta(productId: string) {
  return PRODUCT_TO_PLAN[productId as AppleProductId] || null;
}

export function appleProductIdFor(plan: ApplePlanKey, interval: AppleIntervalKey): AppleProductId {
  const entry = Object.entries(PRODUCT_TO_PLAN).find(
    ([, meta]) => meta.plan === plan && meta.interval === interval,
  );
  if (!entry) throw new Error(`No Apple product for ${plan}/${interval}`);
  return entry[0] as AppleProductId;
}
