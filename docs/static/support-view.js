import { docsUi, supportPopularCategories } from "./locale.js";

export { supportPopularCategories };

export function contactHref(mainSiteUrl) {
  const base = String(mainSiteUrl || "").replace(/\/+$/, "");
  return `${base || ""}/contact`;
}

export function statusSummary(payload, locale = "en") {
  const ui = docsUi(locale);
  const overall = payload && payload.overall;
  if (!overall || !overall.state) {
    return {
      state: "unavailable",
      label: ui.statusUnavailable,
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
