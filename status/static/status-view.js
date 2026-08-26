export const RECENT_INCIDENT_DISPLAY_LIMIT = 5;

export const LAYER_GROUPS = [
  { id: "core", title: "Core services" },
  { id: "supporting", title: "Supporting services" },
  { id: "peripheral", title: "Public services" },
];

const GENERIC_OUTAGE_SUMMARY =
  "This CheckStation component is currently unavailable.";

const IMPAIRED_STATES = new Set([
  "degraded",
  "partial_outage",
  "major_outage",
]);

export function groupComponents(components) {
  const list = Array.isArray(components) ? components : [];
  return LAYER_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    items: list.filter((item) => item.layer === group.id),
  })).filter((group) => group.items.length > 0);
}

export function overallNarrative(current) {
  const state = current?.overall?.state || "unavailable";
  const components = current?.components || [];
  if (state === "unavailable" || !components.length) {
    return "Live status data is not available.";
  }
  if (state === "all_operational") {
    return "";
  }
  if (state === "maintenance") {
    return "Scheduled maintenance is in progress.";
  }
  const impaired = components.filter((item) => IMPAIRED_STATES.has(item.state));
  if (!impaired.length) {
    return "";
  }
  const names = impaired.map((item) => item.name || item.id);
  if (names.length === 1) {
    return `We're currently experiencing an issue with ${names[0]}.`;
  }
  if (names.length === 2) {
    return `We're currently experiencing issues with ${names[0]} and ${names[1]}.`;
  }
  const last = names[names.length - 1];
  const leading = names.slice(0, -1).join(", ");
  return `We're currently experiencing issues with ${leading}, and ${last}.`;
}

export function formatExactTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const datePart = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} at ${timePart}`;
}

export function formatRelativeTime(value, nowMs = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = nowMs - date.getTime();
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60000);
  if (minutes < 1) return future ? "in a moment" : "just now";
  const phrase = (count, unit) => {
    const noun = count === 1 ? unit : `${unit}s`;
    return future ? `in ${count} ${noun}` : `${count} ${noun} ago`;
  };
  if (minutes < 60) return phrase(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return phrase(hours, "hour");
  const days = Math.round(hours / 24);
  return phrase(days, "day");
}

export function formatLastChecked(value) {
  const exact = formatExactTime(value);
  if (!exact) return "Last checked — not yet checked";
  return `Last checked ${exact}`;
}

export function formatAutoUpdate(seconds) {
  const count = Number(seconds);
  if (!Number.isFinite(count) || count <= 0) {
    return "Auto-updates every 30 seconds";
  }
  if (count === 1) return "Auto-updates every 1 second";
  return `Auto-updates every ${count} seconds`;
}

export function formatDuration(startedAt, resolvedAt) {
  const start = new Date(startedAt);
  const end = new Date(resolvedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hourLabel = hours === 1 ? "1 hour" : `${hours} hours`;
  if (!remainder) return hourLabel;
  const minuteLabel = remainder === 1 ? "1 minute" : `${remainder} minutes`;
  return `${hourLabel} ${minuteLabel}`;
}

export function limitRecentIncidents(incidents) {
  const list = Array.isArray(incidents) ? incidents : [];
  return list.slice(0, RECENT_INCIDENT_DISPLAY_LIMIT);
}

export function incidentTitle(incident) {
  const title = String(incident?.title || "").trim();
  if (title) return title.replace(/\s+outage$/i, "");
  const id = incident?.components?.[0];
  return id || "Service";
}

export function incidentDisplaySummary(incident) {
  const summary = String(incident?.summary || "").trim();
  if (summary && summary !== GENERIC_OUTAGE_SUMMARY) return summary;
  const name = incidentTitle(incident);
  if (incident?.status === "resolved") {
    return `${name} has recovered.`;
  }
  return `We're investigating an issue affecting ${name}.`;
}

export function unavailablePayload() {
  return {
    overall: { state: "unavailable", label: "Status unavailable" },
    last_checked_at: null,
    poll_interval_seconds: 30,
    components: [],
  };
}
