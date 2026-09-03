import { isValidIsoDate } from "./attendanceReportDateRange.js";

export const MIN_CALENDAR_YEAR = 1;
export const MAX_CALENDAR_YEAR = 9999;
export const YEAR_PAGE_SIZE = 12;

export function parseIsoDateParts(value) {
  if (!isValidIsoDate(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return { year, month: month - 1, day };
}

export function isoDateFromParts(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInCalendarMonth(year, month) {
  if (month === 1) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [3, 5, 8, 10].includes(month) ? 30 : 31;
}

export function firstWeekdayOfMonth(year, month) {
  const value = new Date(Date.UTC(2000, month, 1));
  value.setUTCFullYear(year);
  return value.getUTCDay();
}

export function calendarMonthCells(year, month) {
  const leading = firstWeekdayOfMonth(year, month);
  const days = daysInCalendarMonth(year, month);
  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ];
}

export function shiftCalendarMonth(year, month, delta) {
  const absoluteMonth = year * 12 + month + delta;
  const nextYear = Math.floor(absoluteMonth / 12);
  const nextMonth = ((absoluteMonth % 12) + 12) % 12;
  if (nextYear < MIN_CALENDAR_YEAR) return { year: MIN_CALENDAR_YEAR, month: 0 };
  if (nextYear > MAX_CALENDAR_YEAR) return { year: MAX_CALENDAR_YEAR, month: 11 };
  return { year: nextYear, month: nextMonth };
}

export function initialYearPageStart(year) {
  const centered = Math.max(MIN_CALENDAR_YEAR, year - 5);
  return Math.min(centered, MAX_CALENDAR_YEAR - YEAR_PAGE_SIZE + 1);
}

export function shiftYearPage(start, delta) {
  return Math.min(
    Math.max(MIN_CALENDAR_YEAR, start + delta * YEAR_PAGE_SIZE),
    MAX_CALENDAR_YEAR - YEAR_PAGE_SIZE + 1,
  );
}

export function yearPageValues(start) {
  return Array.from({ length: YEAR_PAGE_SIZE }, (_, index) => start + index).filter(
    (year) => year >= MIN_CALENDAR_YEAR && year <= MAX_CALENDAR_YEAR,
  );
}

export function pickerPosition(anchorRect, viewportWidth, viewportHeight) {
  const margin = 12;
  const gap = 8;
  const width = Math.min(336, Math.max(0, viewportWidth - margin * 2));
  const estimatedHeight = Math.min(390, Math.max(0, viewportHeight - margin * 2));
  const left = Math.min(
    Math.max(margin, anchorRect.left),
    Math.max(margin, viewportWidth - width - margin),
  );
  const spaceBelow = viewportHeight - anchorRect.bottom - gap - margin;
  const spaceAbove = anchorRect.top - gap - margin;
  const openAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
  const top = openAbove
    ? Math.max(margin, anchorRect.top - estimatedHeight - gap)
    : Math.min(anchorRect.bottom + gap, Math.max(margin, viewportHeight - estimatedHeight - margin));
  return { left, top, width, maxHeight: estimatedHeight, openAbove };
}
