/**
 * Run: node --test src/history/reportTimezone.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { browserReportTimezone } from "./reportTimezone.js";

test("browserReportTimezone returns a non-empty IANA-like string", () => {
  const value = browserReportTimezone();
  assert.equal(typeof value, "string");
  assert.ok(value.length > 0);
  assert.match(value, /^[A-Za-z0-9_+\-/]+$/);
});
