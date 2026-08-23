/**
 * Node tests for History time formatting.
 * Run: node --test src/history/formatDateTime.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { formatTime24 } from "./formatDateTime.js";

test("midnight uses 00:00", () => {
  assert.equal(formatTime24(new Date(2026, 7, 22, 0, 0)), "00:00");
});

test("noon uses 12:00", () => {
  assert.equal(formatTime24(new Date(2026, 7, 22, 12, 0)), "12:00");
});

test("evening uses 24-hour clock", () => {
  assert.equal(formatTime24(new Date(2026, 7, 22, 21, 30)), "21:30");
});

test("morning keeps leading zero", () => {
  assert.equal(formatTime24(new Date(2026, 7, 22, 9, 5)), "09:05");
});

test("afternoon converts from 12-hour equivalents", () => {
  assert.equal(formatTime24(new Date(2026, 7, 22, 16, 58)), "16:58");
  assert.equal(formatTime24(new Date(2026, 7, 22, 21, 28)), "21:28");
});

test("invalid input returns empty string", () => {
  assert.equal(formatTime24("not-a-date"), "");
});
