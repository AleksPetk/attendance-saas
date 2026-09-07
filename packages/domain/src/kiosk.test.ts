import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getValidActionsForState, isActionAllowed } from "./kiosk.js";
import { hasPlanFeature, workspacePlanKey } from "./entitlements.js";

describe("kiosk actions", () => {
  const group = {
    check_in_enabled: true,
    check_out_enabled: true,
    breaks_enabled: true,
    max_breaks: 2,
  };

  it("allows check_in when not checked in", () => {
    const actions = getValidActionsForState(group, {
      is_checked_in: false,
      is_on_break: false,
      break_count: 0,
    });
    assert.deepEqual(actions, ["check_in"]);
  });

  it("rejects duplicate check_in while checked in", () => {
    assert.equal(
      isActionAllowed(
        group,
        { is_checked_in: true, is_on_break: false, break_count: 0 },
        "check_in",
      ),
      false,
    );
    assert.equal(
      isActionAllowed(
        group,
        { is_checked_in: true, is_on_break: false, break_count: 0 },
        "check_out",
      ),
      true,
    );
  });
});

describe("entitlements", () => {
  it("reads plan key", () => {
    assert.equal(
      workspacePlanKey({
        workspace: { entitlements: { plan: { key: "plus" } } },
      }),
      "plus",
    );
    assert.equal(hasPlanFeature({ workspace: { entitlements: { features: { structured_groups: true } } } }, "structured_groups"), true);
  });
});
