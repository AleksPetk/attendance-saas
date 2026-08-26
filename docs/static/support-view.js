export const SUPPORT_POPULAR_CATEGORIES = [
  { id: "getting_started", label: "Getting Started" },
  { id: "members_groups", label: "Members & Groups" },
  { id: "kiosk", label: "Kiosk" },
  { id: "plans", label: "Plans & Billing" },
  { id: "staff", label: "Staff & Permissions" },
  { id: "email", label: "Email & Notifications" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

export function contactHref(mainSiteUrl) {
  const base = String(mainSiteUrl || "").replace(/\/+$/, "");
  return `${base || ""}/contact`;
}

export function statusSummary(payload) {
  const overall = payload && payload.overall;
  if (!overall || !overall.state) {
    return {
      state: "unavailable",
      label: "System status unavailable",
    };
  }
  return {
    state: String(overall.state),
    label: String(overall.label || overall.state),
  };
}

export function statusTone(state) {
  if (state === "all_operational") return "operational";
  if (
    state === "some_degraded" ||
    state === "partial_outage" ||
    state === "major_outage" ||
    state === "maintenance"
  ) {
    return "attention";
  }
  return "unknown";
}

export function supportPathForQuery(query) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return "/support";
  return `/support?q=${encodeURIComponent(trimmed)}`;
}

export function statusApiUrl(statusPublicUrl) {
  const base = String(statusPublicUrl || "").replace(/\/+$/, "");
  return `${base || "http://localhost:8090"}/api/status/current/`;
}

export function featuredQuestions(entries, limit = 6) {
  const list = Array.isArray(entries) ? entries : [];
  const featured = list.filter((item) => item.featured);
  const source = featured.length ? featured : list;
  return source.slice(0, limit);
}
