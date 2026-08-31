function slug(value, fallback) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function timestampToken(now) {
  return now.toISOString().replace(/[-:]/g, "").replace("T", "-").replace(/\.\d{3}Z$/, "");
}

function safeDisplaySlug(value, fallback) {
  const raw = String(value || "");
  if (raw.includes("@") || /\d{7,}/.test(raw)) return fallback;
  return slug(raw, fallback);
}

export function attendanceReportDownloadFilename(report, extension, { now = new Date(), nonce } = {}) {
  const reportBy = report?.report_by || "group";
  const primary = reportBy === "member"
    ? safeDisplaySlug(report?.member_name, "member")
    : safeDisplaySlug(report?.group_name, "group");
  const secondary = reportBy === "member"
    ? safeDisplaySlug(report?.group_name, "all-groups")
    : safeDisplaySlug(report?.participant?.name, "all-participants");
  const from = report?.date_from || "from";
  const to = report?.date_to || "to";
  const unique = nonce || globalThis.crypto?.randomUUID?.().slice(0, 6) || String(Date.now()).slice(-6);
  const ext = String(extension || "csv").replace(/^\./, "");
  return `attendance_${primary}_${secondary}_${from}_to_${to}_${timestampToken(now)}-${unique}.${ext}`;
}

export function attendanceReportCsvFilename(report, options) {
  return attendanceReportDownloadFilename(report, "csv", options);
}
