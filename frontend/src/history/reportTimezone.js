/**
 * Browser/user local IANA timezone for Attendance Report calendar presets.
 * Backend remains the authority for resolving today/week/month bounds.
 */
export function browserReportTimezone() {
  try {
    const name = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof name === "string" && name.trim()) {
      return name.trim();
    }
  } catch {
    // Fall through — backend uses project timezone when omitted.
  }
  return "";
}
