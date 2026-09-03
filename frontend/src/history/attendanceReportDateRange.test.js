import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  dateInputIssue,
  isValidIsoDate,
  validateAttendanceReportDateRange,
} from "./attendanceReportDateRange.js";

test("partial date input is retained by the editable field and not accepted for a report", () => {
  assert.equal(dateInputIssue("", true), "invalid");
  assert.equal(dateInputIssue("", false), "incomplete");
  assert.deepEqual(validateAttendanceReportDateRange("", "2025-09-01"), {
    valid: false,
    reason: "incomplete",
  });

  const source = readFileSync(new URL("./AttendanceDatePicker.jsx", import.meta.url), "utf8");
  assert.match(source, /defaultValue=\{value \|\| ""\}/);
  assert.doesNotMatch(source, /value=\{value\}/);
  assert.match(source, /onCommit\(isValidIsoDate\(nextValue\) \? nextValue : ""\)/);
  assert.match(source, /dateInputIssue\(nextValue, false\)/);
});

test("complete manually typed or calendar-selected ISO dates are accepted", () => {
  assert.equal(isValidIsoDate("2025-01-09"), true);
  assert.equal(isValidIsoDate("2024-02-29"), true);
  assert.deepEqual(validateAttendanceReportDateRange("2025-01-09", "2025-12-31"), {
    valid: true,
    reason: null,
  });
});

test("invalid calendar dates and reversed ranges are rejected", () => {
  assert.equal(isValidIsoDate("2025-02-29"), false);
  assert.equal(isValidIsoDate("2025-13-01"), false);
  assert.equal(isValidIsoDate("01/09/2025"), false);
  assert.deepEqual(validateAttendanceReportDateRange("2025-02-29", "2025-03-01"), {
    valid: false,
    reason: "invalid",
  });
  assert.deepEqual(validateAttendanceReportDateRange("2025-09-02", "2025-09-01"), {
    valid: false,
    reason: "order",
  });
});

test("Attendance Report still submits canonical date_from and date_to parameters", () => {
  const source = readFileSync(new URL("./AttendanceReportPanel.jsx", import.meta.url), "utf8");
  assert.match(source, /params\.set\("date_from", dateFrom\)/);
  assert.match(source, /params\.set\("date_to", dateTo\)/);
  assert.match(source, /AttendanceDatePicker/);
});
