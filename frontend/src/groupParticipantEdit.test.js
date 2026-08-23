/**
 * Run: node --test src/groupParticipantEdit.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  prefersReducedMotion,
  revealParticipantEditPanel,
  shouldAutofocusEditField,
} from "./groupParticipantEdit.js";

test("motion helpers are boolean", () => {
  assert.equal(typeof prefersReducedMotion(), "boolean");
  assert.equal(typeof shouldAutofocusEditField(), "boolean");
});

test("revealParticipantEditPanel no-ops without panel", () => {
  assert.doesNotThrow(() => revealParticipantEditPanel(null, null));
});
