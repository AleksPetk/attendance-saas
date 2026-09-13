import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
// @ts-expect-error Production Workspace presentation contract.
import { buildUpgradePlanOptions, targetOfferPricing } from "../../../../frontend/src/subscriptionPlanOptions.js";
// @ts-expect-error Production Workspace entitlement contract.
import { subscriptionUsageRows } from "../../../../frontend/src/workspaceEntitlements.js";
// @ts-expect-error Canonical admin promotional content.
import { catalogPromotionalText } from "../../../../frontend/src/promotionalText.js";

test("Plan preview has only inert purchase controls and read-only requests", () => {
  const source = readFileSync(new URL("./PlanPage.tsx", import.meta.url), "utf8");
  assert.match(source, /desktop-plan-purchase" disabled/);
  assert.doesNotMatch(source, /api\.(post|put|patch|delete)|onClick=|window\.open|nativeBillingNote|PageHeader/);
  assert.match(source, /endpoints\.billing\(\)/);
  assert.match(source, /endpoints\.workspace\(\)/);
});
test("admin promotion text and exact prices are not desktop constants", () => {
  const catalog = { promotional_text: { enabled: true, text: "Admin edited headline" }, plans: { plus: { intervals: { monthly: { formatted: "$9", promotion: { active: true, first_period_formatted: "$4", renews_at_formatted: "$9", discount_percent: 55, applies_to: "first_month" } } } } } };
  assert.equal(catalogPromotionalText(catalog), "Admin edited headline");
  assert.equal(targetOfferPricing({ catalog }, "plus", "monthly").firstPeriodFormatted, "$4");
  catalog.promotional_text.enabled = false;
  assert.equal(catalogPromotionalText(catalog), "");
});
test("Basic and included trial use the same canonical eligible card set", () => {
  const snapshot = { actions: { can_checkout_plus: true, can_checkout_business: true }, status: "none", catalog: {} };
  const basic = buildUpgradePlanOptions(snapshot, "basic");
  const trial = buildUpgradePlanOptions({ ...snapshot, builtin_trial: { active: true }, effective_plan: { key: "business" } }, "business");
  assert.equal(basic.length, 4);
  assert.deepEqual(trial.map((o: any) => [o.plan, o.interval]), basic.map((o: any) => [o.plan, o.interval]));
});
test("Usage comes from server limits and totals, including locked records", () => {
  const rows = subscriptionUsageRows({ plan: { key: "business" }, features: { staff_management: true }, limits: { members: 300 }, usage: { members: 7 }, usage_totals: { members: 9 }, plan_locks: { locked_counts: { members: 2 } } });
  const members = rows.find((r: any) => r.key === "members");
  assert.equal(members.usage, 9); assert.equal(members.limit, 300); assert.equal(members.locked, 2);
});
