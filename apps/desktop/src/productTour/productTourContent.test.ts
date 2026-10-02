import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRODUCT_TOUR_SLIDE_COUNT,
  productTourSlides,
  productTourUi,
  productTourVisualLabels,
} from "./productTourContent";

test("product tour has seven benefit slides in EN and JA", () => {
  assert.equal(PRODUCT_TOUR_SLIDE_COUNT, 7);
  assert.equal(productTourSlides("en").length, 7);
  assert.equal(productTourSlides("ja").length, 7);
  assert.deepEqual(
    productTourSlides("en").map((slide) => slide.id),
    ["platforms", "simplicity", "workspace", "kiosk", "email", "plans", "security"],
  );
});

test("product tour plan slide has no prices and marks Basic free", () => {
  const enPlans = productTourSlides("en").find((slide) => slide.id === "plans")?.plans || [];
  const jaPlans = productTourSlides("ja").find((slide) => slide.id === "plans")?.plans || [];
  assert.equal(enPlans.length, 3);
  assert.equal(jaPlans.length, 3);
  assert.equal(enPlans[0]?.badge, "Free");
  assert.equal(jaPlans[0]?.badge, "完全無料");
  assert.equal(enPlans[0]?.emphasis, "lead");
  const joined = [...enPlans, ...jaPlans]
    .flatMap((plan) => [plan.body, ...plan.bullets, plan.badge || ""])
    .join(" ");
  assert.doesNotMatch(joined, /\$|¥|円|\/mo|\/month|monthly|yearly|月額|年額/i);
  assert.doesNotMatch(joined, /\b\d+\s*(active )?Groups?\b/i);
  assert.doesNotMatch(joined, /\b\d+\s*Members?\b/i);
});

test("product tour does not call kiosk layouts templates", () => {
  for (const locale of ["en", "ja"] as const) {
    const text = productTourSlides(locale)
      .flatMap((slide) => [slide.headline, slide.body, slide.banner || "", ...(slide.points || [])])
      .join(" ");
    assert.doesNotMatch(text, /template/i);
    assert.doesNotMatch(text, /テンプレート/);
  }
});

test("product tour uses approved Desktop Japanese security terminology", () => {
  const ja = productTourSlides("ja").find((slide) => slide.id === "security");
  const labels = productTourVisualLabels("ja");
  assert.match(ja?.body || "", /二段階認証/);
  assert.doesNotMatch(ja?.body || "", /二要素認証/);
  assert.match(labels.security.twoStep, /二段階認証/);
  assert.match(labels.workspace.standard, /スタンダードグループ/);
  assert.match(labels.workspace.structured, /構造化グループ/);
});

test("product tour email slide references existing sender providers", () => {
  const labels = productTourVisualLabels("en");
  assert.match(labels.email.smtp, /Custom SMTP/);
  assert.match(labels.email.gmail, /Gmail/);
  assert.match(labels.email.microsoft, /Microsoft/);
  assert.match(labels.email.yahoo, /Yahoo/);
});

test("product tour replay labels are present", () => {
  assert.match(productTourUi("en").whatIsCheckStation, /What is CheckStation/);
  assert.match(productTourUi("ja").whatIsCheckStation, /CheckStationとは/);
  assert.match(productTourUi("en").discoverCheckStation, /Discover CheckStation/);
  assert.match(productTourUi("ja").discoverCheckStation, /CheckStationを知る/);
});
