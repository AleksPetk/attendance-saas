/**
 * Lightweight helpers retained for frontend filename/display consistency.
 * File generation is performed by the backend export endpoint.
 */

export function attendanceReportCsvFilename(report) {
  const group = (report?.group_name || "attendance-report")
    .trim()
    .replace(/[^\w\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "attendance-report";
  const from = report?.date_from || "from";
  const to = report?.date_to || "to";
  if (from && to && from !== to) {
    return `${group}-attendance-${from}-to-${to}.csv`;
  }
  return `${group}-attendance-${from || to}.csv`;
}
