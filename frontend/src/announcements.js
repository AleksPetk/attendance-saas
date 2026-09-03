import i18n from "./i18n/index.js";

/** Workspace header bell poll while the shell stays mounted (~20s). */
export const ANNOUNCEMENT_POLL_MS = 20000;
export const ANNOUNCEMENT_ATTENTION_MS = 4200;

/** Scoped fetch options so announcement polls are not served from HTTP cache. */
export function announcementListFetchOptions() {
  return { cache: "no-store" };
}

/**
 * Whether a poll tick should start a network request.
 * Skips overlapping requests and hidden tabs (resume fetches on visibilitychange).
 */
export function shouldStartAnnouncementPoll({
  visibilityState = "visible",
  inFlight = false,
} = {}) {
  if (inFlight) return false;
  if (visibilityState === "hidden") return false;
  return true;
}

export function announcementUnreadCount(payload) {
  if (typeof payload?.unread_count === "number") return payload.unread_count;
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results.filter((item) => !item?.is_read).length;
}

export function sortAnnouncementsNewestFirst(items) {
  return [...(items || [])].sort((a, b) => {
    const aTime = Date.parse(a?.published_at || "") || 0;
    const bTime = Date.parse(b?.published_at || "") || 0;
    if (bTime !== aTime) return bTime - aTime;
    return Number(b?.id || 0) - Number(a?.id || 0);
  });
}

export function formatAnnouncementTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(value);
  }
}

export function announcementSeverityLabel(severity) {
  if (severity === "maintenance") {
    return i18n.t("announcementSeverity.maintenance", { ns: "workspace" });
  }
  if (severity === "important") {
    return i18n.t("announcementSeverity.important", { ns: "workspace" });
  }
  return i18n.t("announcementSeverity.info", { ns: "workspace" });
}

export function shouldShowAnnouncementAttention({ unreadCount, previousUnreadCount, panelOpen }) {
  if (panelOpen) return false;
  return Number(unreadCount) > 0 && Number(unreadCount) > Number(previousUnreadCount || 0);
}

export function mergeAnnouncementPayload(previous, next) {
  if (!next) return previous || { unread_count: 0, results: [] };
  return {
    unread_count: announcementUnreadCount(next),
    results: sortAnnouncementsNewestFirst(next.results || []),
  };
}

export function markAnnouncementResultsRead(payload, ids = null) {
  const idSet = ids == null ? null : new Set(ids.map(Number));
  const results = (payload?.results || []).map((item) => {
    if (idSet && !idSet.has(Number(item.id))) return item;
    if (item.is_read) return item;
    return {
      ...item,
      is_read: true,
      read_at: item.read_at || new Date().toISOString(),
    };
  });
  return {
    unread_count: results.filter((item) => !item.is_read).length,
    results,
  };
}
