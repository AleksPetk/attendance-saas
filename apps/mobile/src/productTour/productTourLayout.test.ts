import assert from "node:assert/strict";
import test from "node:test";
import {
  productTourSafeInsetsForLayout,
  resolveProductTourLayout,
} from "./productTourLayout";

test("resolveProductTourLayout classifies modern iPhone landscape as phone-landscape", () => {
  assert.equal(resolveProductTourLayout(852, 393), "phone-landscape");
  assert.equal(resolveProductTourLayout(844, 390), "phone-landscape");
  assert.equal(resolveProductTourLayout(667, 375), "phone-landscape");
  assert.equal(resolveProductTourLayout(736, 414), "phone-landscape");
});

test("resolveProductTourLayout keeps phone portrait separate", () => {
  assert.equal(resolveProductTourLayout(393, 852), "phone-portrait");
  assert.equal(resolveProductTourLayout(390, 844), "phone-portrait");
  assert.equal(resolveProductTourLayout(375, 667), "phone-portrait");
});

test("resolveProductTourLayout keeps iPad orientations on tablet paths", () => {
  assert.equal(resolveProductTourLayout(768, 1024), "tablet-portrait");
  assert.equal(resolveProductTourLayout(1024, 768), "tablet-landscape");
  assert.equal(resolveProductTourLayout(820, 1180), "tablet-portrait");
  assert.equal(resolveProductTourLayout(1180, 820), "tablet-landscape");
});

test("resolveProductTourLayout does not treat wide phone landscape as tablet", () => {
  assert.equal(resolveProductTourLayout(926, 428), "phone-landscape");
  assert.equal(resolveProductTourLayout(932, 430), "phone-landscape");
});

test("phone landscape remaps stale portrait insets away from top/bottom bands", () => {
  const stale = { top: 59, right: 0, bottom: 34, left: 0 };
  assert.deepEqual(productTourSafeInsetsForLayout("phone-landscape", stale), {
    top: 0,
    right: 59,
    bottom: 21,
    left: 59,
  });
  assert.strictEqual(productTourSafeInsetsForLayout("phone-portrait", stale), stale);
  assert.strictEqual(productTourSafeInsetsForLayout("tablet-landscape", stale), stale);
  assert.strictEqual(productTourSafeInsetsForLayout("tablet-portrait", stale), stale);
});

test("phone landscape trusts live left/right notch insets", () => {
  const notchLeft = { top: 0, right: 21, bottom: 21, left: 59 };
  const notchRight = { top: 0, right: 59, bottom: 21, left: 21 };
  assert.deepEqual(productTourSafeInsetsForLayout("phone-landscape", notchLeft), {
    top: 0,
    right: 21,
    bottom: 21,
    left: 59,
  });
  assert.deepEqual(productTourSafeInsetsForLayout("phone-landscape", notchRight), {
    top: 0,
    right: 59,
    bottom: 21,
    left: 21,
  });
});
