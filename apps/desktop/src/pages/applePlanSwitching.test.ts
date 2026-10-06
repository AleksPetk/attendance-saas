import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APPLE_PRODUCT_ID_LIST,
  appleProductIdFor,
} from "../billing/appleProducts";
import {
  buildApplePlanCards,
  isApplePlanCardCurrent,
  shouldShowApplePlanCards,
} from "../billing/applePlanCards";
import {
  appleBlockedByOtherProvider,
  appleManaged,
  applePurchaseEligible,
  appleStorePurchaseAllowed,
  isCurrentAppleSubscriptionProduct,
} from "../billing/applePlanUi";
import { storeKitDisplayPriceOnly } from "../billing/storeKitDisplayPrice";

const here = dirname(fileURLToPath(import.meta.url));
const planPage = readFileSync(join(here, "PlanPage.tsx"), "utf8");

const storeProducts = [
  { productId: "app.checkstation.plus.monthly", displayPrice: "¥980", title: "Plus Monthly", description: "" },
  { productId: "app.checkstation.plus.yearly", displayPrice: "¥9,800", title: "Plus Yearly", description: "" },
  { productId: "app.checkstation.business.monthly", displayPrice: "¥2,980", title: "Business Monthly", description: "" },
  { productId: "app.checkstation.business.yearly", displayPrice: "¥29,800", title: "Business Yearly", description: "" },
];

function storePriceFor(plan: string, interval: string): string {
  const productId = appleProductIdFor(plan as "plus" | "business", interval as "monthly" | "yearly");
  const row = storeProducts.find((p) => p.productId === productId);
  return storeKitDisplayPriceOnly(row || {});
}

test("buildApplePlanCards always enumerates all four App Store SKUs", () => {
  const cards = buildApplePlanCards({}, (key) => {
    if (key === "billing:interval.monthly") return "Monthly";
    if (key === "billing:interval.yearly") return "Yearly";
    return key;
  });
  assert.equal(cards.length, 4);
  assert.deepEqual(
    cards.map((c) => c.productId),
    APPLE_PRODUCT_ID_LIST,
  );
  assert.deepEqual(
    cards.map((c) => [c.plan, c.interval]),
    [
      ["plus", "monthly"],
      ["plus", "yearly"],
      ["business", "monthly"],
      ["business", "yearly"],
    ],
  );
});

test("Apple-managed Plus Monthly: all 4 cards; Plus Monthly is current; others changeable", () => {
  const billing = {
    purchase_source: "apple",
    can_manage_apple: true,
    subscribed_plan: { key: "plus" },
    interval: "monthly",
  };
  assert.equal(shouldShowApplePlanCards(billing), true);
  assert.equal(appleManaged(billing), true);
  assert.equal(appleStorePurchaseAllowed(billing), true);

  const cards = buildApplePlanCards(billing, (k) => k);
  assert.equal(cards.length, 4);

  const current = cards.filter((c) => isApplePlanCardCurrent(billing, c));
  assert.equal(current.length, 1);
  assert.equal(current[0].productId, "app.checkstation.plus.monthly");
  assert.equal(isCurrentAppleSubscriptionProduct(billing, "plus", "monthly"), true);

  const changeable = cards.filter((c) => !isApplePlanCardCurrent(billing, c));
  assert.equal(changeable.length, 3);
  assert.deepEqual(
    changeable.map((c) => c.productId),
    [
      "app.checkstation.plus.yearly",
      "app.checkstation.business.monthly",
      "app.checkstation.business.yearly",
    ],
  );
});

test("Apple-managed Business Yearly: correct current; other 3 changeable", () => {
  const billing = {
    purchase_source: "apple",
    can_manage_apple: true,
    subscribed_plan: { key: "business" },
    interval: "yearly",
  };
  const cards = buildApplePlanCards(billing, (k) => k);
  assert.equal(isApplePlanCardCurrent(billing, cards[3]), true);
  assert.equal(cards[3].productId, "app.checkstation.business.yearly");
  assert.equal(cards.filter((c) => !isApplePlanCardCurrent(billing, c)).length, 3);
});

test("Apple purchase-eligible (purchase_source none): all 4 visible with subscribe actions", () => {
  const billing = {
    purchase_source: "none",
    can_start_apple: true,
    managed_by_platform: false,
  };
  assert.equal(applePurchaseEligible(billing), true);
  assert.equal(shouldShowApplePlanCards(billing), true);
  assert.equal(appleManaged(billing), false);
  assert.equal(appleStorePurchaseAllowed(billing), true);
  assert.equal(buildApplePlanCards(billing, (k) => k).length, 4);
  // No card is "current" Apple product until subscribed.
  assert.equal(
    buildApplePlanCards(billing, (k) => k).every((c) => !isApplePlanCardCurrent(billing, c)),
    true,
  );
});

test("Stripe-managed must NOT enter Apple plan-switch flow", () => {
  const billing = { purchase_source: "stripe", can_start_apple: true };
  assert.equal(shouldShowApplePlanCards(billing), false);
  assert.equal(appleStorePurchaseAllowed(billing), false);
  assert.equal(appleBlockedByOtherProvider(billing), "stripe");
});

test("Google-managed must NOT enter Apple plan-switch flow", () => {
  const billing = { purchase_source: "google", can_start_apple: true };
  assert.equal(shouldShowApplePlanCards(billing), false);
  assert.equal(appleStorePurchaseAllowed(billing), false);
  assert.equal(appleBlockedByOtherProvider(billing), "google");
});

test("Apple option prices come from StoreKit displayPrice only", () => {
  assert.equal(storePriceFor("plus", "monthly"), "¥980");
  assert.equal(storePriceFor("business", "yearly"), "¥29,800");
  assert.equal(storeKitDisplayPriceOnly({ price: 9.99 }), "");
  assert.equal(storeKitDisplayPriceOnly({ displayPrice: "  $9.99  " }), "$9.99");
});

test("Current Apple plan prefers StoreKit price when available", () => {
  const billing = {
    purchase_source: "apple",
    can_manage_apple: true,
    subscribed_plan: { key: "plus" },
    interval: "monthly",
  };
  assert.equal(storePriceFor("plus", "monthly"), "¥980");
  assert.match(planPage, /currentAppleStorePrice/);
  assert.match(planPage, /appleIsManaged && currentAppleStorePrice/);
  assert.match(planPage, /catalogListPriceWithInterval/);
});

test("Purchase handler allows eligible OR appleManaged; rejects unsupported sources", () => {
  assert.equal(appleStorePurchaseAllowed({
    purchase_source: "none",
    can_start_apple: true,
    managed_by_platform: false,
  }), true);
  assert.equal(appleStorePurchaseAllowed({
    purchase_source: "apple",
    can_manage_apple: true,
  }), true);
  assert.equal(appleStorePurchaseAllowed({ purchase_source: "stripe" }), false);
  assert.equal(appleStorePurchaseAllowed({ purchase_source: "google" }), false);
  assert.equal(appleStorePurchaseAllowed({ purchase_source: "none", can_start_apple: false }), false);

  assert.match(planPage, /appleStorePurchaseAllowed\(billing\)/);
  assert.match(planPage, /appleBlockedByOtherProvider\(billing\)/);
  assert.match(planPage, /isCurrentAppleSubscriptionProduct\(billing, option\.plan, option\.interval\)/);
  assert.doesNotMatch(planPage, /if \(!applePurchaseEligible\(billing\)\) return;/);
});

test("PlanPage MAS Apple grid uses buildApplePlanCards / APPLE SKUs, not Stripe upgrade matrix", () => {
  assert.match(planPage, /buildApplePlanCards/);
  assert.match(planPage, /shouldShowApplePlanCards/);
  assert.match(planPage, /plan\.appleChange/);
  assert.match(planPage, /plan\.appleBuy/);
  assert.match(planPage, /billing:currentPlan\.badge/);
  // Current product: no purchase button
  assert.match(planPage, /appleIapEnabled && current \? null/);
  // Must not drive Apple options from Stripe upgrade builder when IAP active
  assert.match(planPage, /const visibleUpgrades = appleIapEnabled/);
  assert.match(planPage, /directAppleManaged \? \[\] : upgrades/);
});

test("Manage Subscription path unchanged (App Store account URL via bridge)", () => {
  assert.match(planPage, /openAppleManageSubscriptions/);
  assert.match(planPage, /plan\.appleManage/);
  assert.match(planPage, /setBusy\("apple-manage"\)/);
  const bridgeCore = readFileSync(
    join(here, "../../native/MacApple/Sources/BridgeCore.swift"),
    "utf8",
  );
  assert.match(bridgeCore, /https:\/\/apps\.apple\.com\/account\/subscriptions/);
});

test("Restore Purchases path unchanged", () => {
  assert.match(planPage, /restoreStoreKitPurchases/);
  assert.match(planPage, /plan\.appleRestore/);
  assert.match(planPage, /setBusy\("apple-restore"\)/);
});

test("DIRECT Apple-managed notice: visible for Apple-owned Plus/Business, absent for Stripe/Basic", () => {
  assert.match(planPage, /directAppleManaged = stripeEnabled && billing\.purchase_source === "apple"/);
  assert.match(planPage, /plan\.appleManagedBillingNote/);
  assert.match(planPage, /\{directAppleManaged \? \(/);
  // Stripe checkout/promo and portal are not the management path for Apple-owned
  assert.match(planPage, /showStripePromo = stripeEnabled && !shouldShowStripePromoOnMas\(billing\) && !directAppleManaged/);
  assert.match(planPage, /!directAppleManaged && billing\.actions\?\.can_open_portal/);
  // DIRECT never shows StoreKit Manage/Restore outside MAS appleIapEnabled branch
  assert.match(planPage, /appleIapEnabled && \(appleShop \|\| appleIsManaged\)/);
  assert.doesNotMatch(
    planPage,
    /directAppleManaged[\s\S]{0,200}openAppleManageSubscriptions/,
  );
});
