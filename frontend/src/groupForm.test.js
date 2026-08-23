import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupTypeLabel, isStructuredGroup } from "./groupForm.js";

describe("group type labels", () => {
  it("labels Standard and Structured Groups clearly", () => {
    assert.equal(groupTypeLabel({ group_type: "standard" }), "Standard Group");
    assert.equal(groupTypeLabel({ group_type: "structured" }), "Structured Group");
    assert.equal(groupTypeLabel({}), "Standard Group");
    assert.equal(isStructuredGroup({ group_type: "structured" }), true);
    assert.equal(isStructuredGroup({ group_type: "standard" }), false);
  });
});
