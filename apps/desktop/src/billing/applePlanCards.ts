/**
 * MAS Apple Plan cards enumerate the four App Store subscription SKUs.
 * Visible prices come from StoreKit displayPrice only (never Stripe / catalog).
 */

import {
  APPLE_PRODUCT_ID_LIST,
  appleProductMeta,
  type AppleIntervalKey,
  type ApplePlanKey,
  type AppleProductId,
} from "./appleProducts";
import { appleManaged, applePurchaseEligible, isCurrentAppleSubscriptionProduct } from "./applePlanUi";

export type ApplePlanCardModel = {
  productId: AppleProductId;
  plan: ApplePlanKey;
  interval: AppleIntervalKey;
  title: string;
};

type BillingCatalog = {
  catalog?: {
    plans?: Record<string, { display_name?: string } | undefined>;
  };
  [key: string]: unknown;
};

type BillingText = (key: string, vars?: Record<string, string | number>) => string;

export function buildApplePlanCards(
  billing: BillingCatalog | null | undefined,
  text: BillingText,
): ApplePlanCardModel[] {
  return APPLE_PRODUCT_ID_LIST.map((productId) => {
    const meta = appleProductMeta(productId)!;
    const catalogName = billing?.catalog?.plans?.[meta.plan]?.display_name;
    const planName = (catalogName && String(catalogName).trim())
      || (meta.plan === "business" ? "Business" : "Plus");
    const intervalLabel = text(`billing:interval.${meta.interval}`);
    return {
      productId,
      plan: meta.plan,
      interval: meta.interval,
      title: `${planName} ${intervalLabel}`,
    };
  });
}

/** Show the four Apple SKU cards when eligible to buy or already Apple-managed. */
export function shouldShowApplePlanCards(billing: Record<string, any> | null | undefined): boolean {
  return applePurchaseEligible(billing) || appleManaged(billing);
}

export function isApplePlanCardCurrent(
  billing: Record<string, any> | null | undefined,
  card: Pick<ApplePlanCardModel, "plan" | "interval">,
): boolean {
  return isCurrentAppleSubscriptionProduct(billing, card.plan, card.interval);
}
