const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function isValidIsoDate(value) {
  const match = ISO_DATE_PATTERN.exec(String(value || ""));
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

export function validateAttendanceReportDateRange(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return { valid: false, reason: "incomplete" };
  if (!isValidIsoDate(dateFrom) || !isValidIsoDate(dateTo)) {
    return { valid: false, reason: "invalid" };
  }
  if (dateFrom > dateTo) return { valid: false, reason: "order" };
  return { valid: true, reason: null };
}

export function dateInputIssue(value, badInput = false) {
  if (badInput) return "invalid";
  if (!value) return "incomplete";
  return isValidIsoDate(value) ? null : "invalid";
}
