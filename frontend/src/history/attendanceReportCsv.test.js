/**
 * Node tests for attendance report export filename helpers.
 * Run: node --test src/history/attendanceReportCsv.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { attendanceReportCsvFilename } from "./attendanceReportCsv.js";

test("filename uses group and date range", () => {
  assert.equal(
    attendanceReportCsvFilename({
      group_name: "SELS Kids",
      date_from: "2026-12-12",
      date_to: "2026-12-25",
    }),
    "sels-kids-attendance-2026-12-12-to-2026-12-25.csv"
  );
});
