/**
 * Node tests for attendance report export filename helpers.
 * Run: node --test src/history/attendanceReportCsv.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { attendanceReportCsvFilename } from "./attendanceReportCsv.js";

test("filename uses context, date range, timestamp, and uniqueness token", () => {
  assert.equal(
    attendanceReportCsvFilename({
      report_by: "group",
      group_name: "SELS Kids",
      date_from: "2026-12-12",
      date_to: "2026-12-25",
    }, { now: new Date("2026-08-31T12:08:45Z"), nonce: "a1b2c3" }),
    "attendance_sels-kids_all-participants_2026-12-12_to_2026-12-25_20260831-120845-a1b2c3.csv"
  );
});

test("filename excludes contact fields", () => {
  const filename = attendanceReportCsvFilename({
    report_by: "member",
    member_name: "Jasmine",
    member_email: "private@example.com",
    date_from: "2026-08-01",
    date_to: "2026-08-31",
  }, { now: new Date("2026-08-31T12:08:45Z"), nonce: "d4e5f6" });
  assert.doesNotMatch(filename, /private|example|@/);
});
