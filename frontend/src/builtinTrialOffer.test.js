/**
 * Built-in trial offer derivation from billing catalog.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { builtinTrialOfferFromCatalog } from "./builtinTrialOffer.js";

describe("builtinTrialOfferFromCatalog", () => {
  it("reports offered trial days from catalog", () => {
    assert.deepEqual(
      builtinTrialOfferFromCatalog({
        builtin_trial_offered: true,
        builtin_trial_days: 7,
      }),
      { offered: true, days: 7 },
    );
  });

  it("hides trial when catalog says not offered", () => {
    assert.deepEqual(
      builtinTrialOfferFromCatalog({
        builtin_trial_offered: false,
        builtin_trial_days: 7,
      }),
      { offered: false, days: 0 },
    );
  });

  it("hides trial when days are invalid", () => {
    assert.deepEqual(
      builtinTrialOfferFromCatalog({
        builtin_trial_offered: true,
        builtin_trial_days: 0,
      }),
      { offered: false, days: 0 },
    );
  });
});
