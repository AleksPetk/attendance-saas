import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  MAX_CALENDAR_YEAR,
  MIN_CALENDAR_YEAR,
  calendarMonthCells,
  initialYearPageStart,
  isoDateFromParts,
  parseIsoDateParts,
  pickerPosition,
  shiftCalendarMonth,
  shiftYearPage,
  yearPageValues,
} from "./attendanceDatePickerModel.js";

test("From and To each use the reusable custom picker", () => {
  const panel = readFileSync(new URL("./AttendanceReportPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /id="attendance-report-date-from"/);
  assert.match(panel, /id="attendance-report-date-to"/);
  assert.equal((panel.match(/<AttendanceDatePicker/g) || []).length, 2);
});

test("month arrows cross years and support distant month selection", () => {
  assert.deepEqual(shiftCalendarMonth(2026, 8, -1), { year: 2026, month: 7 });
  assert.deepEqual(shiftCalendarMonth(2026, 0, -1), { year: 2025, month: 11 });
  assert.equal(isoDateFromParts(2025, 3, 18), "2025-04-18");
  assert.deepEqual(parseIsoDateParts("2025-04-18"), { year: 2025, month: 3, day: 18 });
});

test("month grids contain valid leap-year days", () => {
  const february2024 = calendarMonthCells(2024, 1).filter(Boolean);
  const february2025 = calendarMonthCells(2025, 1).filter(Boolean);
  assert.equal(february2024.at(-1), 29);
  assert.equal(february2025.at(-1), 28);
});

test("year selection pages span the backend-supported ISO date range", () => {
  const page = initialYearPageStart(2026);
  assert.ok(yearPageValues(page).includes(2025));
  assert.ok(yearPageValues(page).includes(2026));
  assert.equal(shiftYearPage(MIN_CALENDAR_YEAR, -1), MIN_CALENDAR_YEAR);
  assert.equal(
    shiftYearPage(MAX_CALENDAR_YEAR - 11, 1),
    MAX_CALENDAR_YEAR - 11,
  );
});

test("picker positioning stays inside narrow viewports and can open above", () => {
  const narrow = pickerPosition(
    { left: 300, top: 100, bottom: 140 },
    360,
    640,
  );
  assert.equal(narrow.width, 336);
  assert.ok(narrow.left >= 12);
  assert.ok(narrow.left + narrow.width <= 348);

  const nearBottom = pickerPosition(
    { left: 20, top: 620, bottom: 660 },
    390,
    700,
  );
  assert.equal(nearBottom.openAbove, true);
  assert.ok(nearBottom.top >= 12);
});

test("picker exposes month, year, day, Escape, and outside-click controls", () => {
  const source = readFileSync(new URL("./AttendanceDatePicker.jsx", import.meta.url), "utf8");
  assert.match(source, /setViewMode\("months"\)/);
  assert.match(source, /setViewMode\("years"\)/);
  assert.match(source, /selectDay\(day\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /pointerdown/);
  assert.match(source, /createPortal\(popup, document\.body\)/);
  assert.match(source, /Intl\.DateTimeFormat\(locale/);
});
