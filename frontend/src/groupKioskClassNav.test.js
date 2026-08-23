import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classPeoplePath,
  classPinGateRequired,
  classVerifyPinPath,
  resolveClassSectionId,
} from "./groupKioskClassNav.js";

describe("Structured Class card navigation", () => {
  it("A/B: Class PIN OFF uses canonical id for people path", () => {
    const section = { id: 42, name: "Class A", requires_class_pin: false };
    assert.equal(resolveClassSectionId(section), 42);
    assert.equal(classPinGateRequired(false, section), false);
    assert.equal(classPeoplePath(7, resolveClassSectionId(section)), "/api/groups/7/kiosk/classes/42/people/");
  });

  it("D: Class PIN ON gates before people fetch", () => {
    const section = { id: 9, name: "Class B", requires_class_pin: true };
    assert.equal(classPinGateRequired(true, section), true);
    assert.equal(classPinGateRequired(false, section), true);
    assert.equal(
      classVerifyPinPath(7, resolveClassSectionId(section)),
      "/api/groups/7/kiosk/classes/9/verify-pin/",
    );
  });

  it("rejects missing Class id instead of name lookup", () => {
    assert.equal(resolveClassSectionId({ name: "Class A" }), null);
    assert.equal(resolveClassSectionId(null), null);
  });
});
