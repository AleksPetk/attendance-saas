import { fillTemplate, statusUi } from "./locale.js";

export const RECENT_INCIDENT_DISPLAY_LIMIT = 5;

const IMPAIRED_STATES = new Set([
  "degraded",
  "partial_outage",
  "major_outage",
]);

export function layerGroups(locale = "en") {
  const ui = statusUi(locale);
  return [
    { id: "core", title: ui.layerCore },
    { id: "supporting", title: ui.layerSupporting },
    { id: "peripheral", title: ui.layerPeripheral },
  ];
}

/** @deprecated Prefer layerGroups(locale) */
export const LAYER_GROUPS = layerGroups("en");

export function groupComponents(components, locale = "en") {
  const list = Array.isArray(components) ? components : [];
  return layerGroups(locale)
    .map((group) => ({
      id: group.id,
      title: group.title,
      items: list.filter((item) => item.layer === group.id),
    }))
    .filter((group) => group.items.length > 0);
}

export function overallNarrative(current, locale = "en") {
  const ui = statusUi(locale);
  const state = current?.overall?.state || "unavailable";
  const components = current?.components || [];
  if (state === "unavailable" || !components.length) {
    return ui.liveDataUnavailable;
  }
  if (state === "all_operational") {
    return "";
  }
  if (state === "maintenance") {
    return ui.maintenanceInProgress;
  }
  const impaired = components.filter((item) => IMPAIRED_STATES.has(item.state));
  if (!impaired.length) {
    return "";
  }
  const names = impaired.map((item) => item.name || item.id);
  if (names.length === 1) {
    return fillTemplate(ui.issueWithOne, { name: names[0] });
  }
  if (names.length === 2) {
    return fillTemplate(ui.issueWithTwo, { a: names[0], b: names[1] });
  }
  const last = names[names.length - 1];
  const leading = names.slice(0, -1).join(", ");
  return fillTemplate(ui.issueWithMany, { leading, last });
}

export function formatExactTime(value, locale = "en") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const lang = locale === "ja" ? "ja" : "en";
  const datePart = date.toLocaleDateString(lang, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString(lang, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (lang === "ja") {
    return `${datePart} ${timePart}`;
  }
  return `${datePart} at ${timePart}`;
}

export function formatRelativeTime(value, nowMs = Date.now(), locale = "en") {
  const ui = statusUi(locale);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = nowMs - date.getTime();
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60000);
  if (minutes < 1) return future ? ui.inAMoment : ui.justNow;
  if (minutes < 60) {
    if (minutes === 1) return future ? ui.inMinute : ui.minuteAgo;
    return fillTemplate(future ? ui.inMinutes : ui.minutesAgo, { count: minutes });
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    if (hours === 1) return future ? ui.inHour : ui.hourAgo;
    return fillTemplate(future ? ui.inHours : ui.hoursAgo, { count: hours });
  }
  const days = Math.round(hours / 24);
  if (days === 1) return future ? ui.inDay : ui.dayAgo;
  return fillTemplate(future ? ui.inDays : ui.daysAgo, { count: days });
}

export function formatLastChecked(value, locale = "en") {
  const ui = statusUi(locale);
  const exact = formatExactTime(value, locale);
  if (!exact) return ui.lastCheckedNever;
  return fillTemplate(ui.lastChecked, { time: exact });
}

export function formatAutoUpdate(seconds, locale = "en") {
  const ui = statusUi(locale);
  const count = Number(seconds);
  if (!Number.isFinite(count) || count <= 0) {
    return fillTemplate(ui.autoUpdate, { count: 30 });
  }
  if (count === 1) return ui.autoUpdateOne;
  return fillTemplate(ui.autoUpdate, { count });
}

export function formatDuration(startedAt, resolvedAt, locale = "en") {
  const ui = statusUi(locale);
  const start = new Date(startedAt);
  const end = new Date(resolvedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  if (minutes < 1) return ui.lessThanMinute;
  if (minutes < 60) {
    return minutes === 1 ? ui.minute : fillTemplate(ui.minutes, { count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hourLabel = hours === 1 ? ui.hour : fillTemplate(ui.hours, { count: hours });
  if (!remainder) return hourLabel;
  const minuteLabel =
    remainder === 1 ? ui.minute : fillTemplate(ui.minutes, { count: remainder });
  return `${hourLabel} ${minuteLabel}`;
}

export function limitRecentIncidents(incidents) {
  const list = Array.isArray(incidents) ? incidents : [];
  return list.slice(0, RECENT_INCIDENT_DISPLAY_LIMIT);
}

export function incidentTitle(incident, locale = "en") {
  const ui = statusUi(locale);
  const title = String(incident?.title || "").trim();
  if (title) {
    if (locale === "ja") {
      return title.replace(/の障害$/, "");
    }
    return title.replace(/\s+outage$/i, "");
  }
  const id = incident?.components?.[0];
  return id || ui.service;
}

export function incidentDisplaySummary(incident, locale = "en") {
  const ui = statusUi(locale);
  const summary = String(incident?.summary || "").trim();
  const genericEn = "This CheckStation component is currently unavailable.";
  if (summary && summary !== genericEn) return summary;
  const name = incidentTitle(incident, locale);
  if (incident?.status === "resolved") {
    return fillTemplate(ui.hasRecovered, { name });
  }
  return fillTemplate(ui.investigatingAffecting, { name });
}

export function unavailablePayload(locale = "en") {
  const ui = statusUi(locale);
  return {
    overall: { state: "unavailable", label: ui.statusUnavailable },
    last_checked_at: null,
    poll_interval_seconds: 30,
    components: [],
  };
}
