import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "./api.js";
import {
  ANNOUNCEMENT_ATTENTION_MS,
  ANNOUNCEMENT_POLL_MS,
  announcementSeverityLabel,
  announcementUnreadCount,
  formatAnnouncementTime,
  markAnnouncementResultsRead,
  mergeAnnouncementPayload,
  shouldShowAnnouncementAttention,
  shouldStartAnnouncementPoll,
} from "./announcements.js";
import { canManageOwnerAccount } from "./workspaceSession.js";

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z"
      />
    </svg>
  );
}

export default function WorkspaceAnnouncementBell({ session, onNavigate }) {
  const canOpenStatus = canManageOwnerAccount(session);
  const panelId = useId();
  const rootRef = useRef(null);
  const [payload, setPayload] = useState({ unread_count: 0, results: [] });
  const [open, setOpen] = useState(false);
  const [attention, setAttention] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const openRef = useRef(false);
  const payloadRef = useRef(payload);
  const previousUnread = useRef(0);
  const markReadInFlight = useRef(false);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  const applyPayload = useCallback((next) => {
    setPayload((current) => {
      const merged = mergeAnnouncementPayload(current, next);
      const unread = announcementUnreadCount(merged);
      if (
        shouldShowAnnouncementAttention({
          unreadCount: unread,
          previousUnreadCount: previousUnread.current,
          panelOpen: openRef.current,
        })
      ) {
        setAttention(true);
      }
      previousUnread.current = unread;
      return merged;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let pollInFlight = false;
    let timerId = null;

    async function load() {
      if (
        !shouldStartAnnouncementPoll({
          visibilityState:
            typeof document !== "undefined" ? document.visibilityState : "visible",
          inFlight: pollInFlight,
        })
      ) {
        return;
      }
      pollInFlight = true;
      try {
        const result = await api.listAnnouncements();
        if (cancelled) return;
        setLoadError(false);
        applyPayload(result.data);
      } catch {
        // Keep last good payload in the header; surface a soft hint only.
        if (!cancelled) setLoadError(true);
      } finally {
        pollInFlight = false;
      }
    }

    function clearPollTimer() {
      if (timerId == null) return;
      window.clearInterval(timerId);
      timerId = null;
    }

    function startPollTimer() {
      if (timerId != null) return;
      timerId = window.setInterval(load, ANNOUNCEMENT_POLL_MS);
    }

    function onVisibilityChange() {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") {
        clearPollTimer();
        return;
      }
      load();
      startPollTimer();
    }

    // Immediate mount fetch, then keep polling while WorkspaceLayout stays mounted.
    load();
    startPollTimer();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearPollTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [applyPayload]);

  useEffect(() => {
    if (!attention) return undefined;
    const timer = window.setTimeout(() => setAttention(false), ANNOUNCEMENT_ATTENTION_MS);
    return () => window.clearTimeout(timer);
  }, [attention]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const markVisibleRead = useCallback(async () => {
    if (markReadInFlight.current) return;

    const current = payloadRef.current;
    const hasUnread = (current.results || []).some((item) => !item.is_read);
    if (!hasUnread) return;

    // Optimistic UI from a known snapshot — do not gate the API on setState updater timing.
    previousUnread.current = 0;
    setAttention(false);
    setPayload(markAnnouncementResultsRead(current));
    markReadInFlight.current = true;
    try {
      await api.markAnnouncementsRead();
      const result = await api.listAnnouncements();
      applyPayload(result.data);
    } catch {
      try {
        const result = await api.listAnnouncements();
        applyPayload(result.data);
      } catch {
        setLoadError(true);
        setPayload(current);
        previousUnread.current = announcementUnreadCount(current);
      }
    } finally {
      markReadInFlight.current = false;
    }
  }, [applyPayload]);

  const toggleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setAttention(false);
    markVisibleRead();
  };

  const unreadCount = announcementUnreadCount(payload);
  const results = payload.results || [];

  return (
    <div
      className="workspace-announcement-root"
      ref={rootRef}
      data-tutorial-target="workspace-notifications"
    >
      <button
        type="button"
        className={[
          "workspace-announcement-bell",
          unreadCount > 0 ? "has-unread" : "",
          attention ? "is-attention" : "",
        ].filter(Boolean).join(" ")}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggleOpen}
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="workspace-announcement-badge" aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="workspace-announcement-panel"
          id={panelId}
          role="dialog"
          aria-label="Notifications"
        >
          <header className="workspace-announcement-panel-header">
            <h2>Notifications</h2>
            {loadError ? <p className="workspace-announcement-hint">Could not refresh.</p> : null}
          </header>
          {results.length === 0 ? (
            <p className="workspace-announcement-empty">No announcements yet.</p>
          ) : (
            <ul className="workspace-announcement-list">
              {results.map((item) => (
                <li
                  key={item.id}
                  className={[
                    "workspace-announcement-item",
                    `is-${item.severity || "info"}`,
                    item.is_read ? "is-read" : "is-unread",
                  ].join(" ")}
                >
                  <div className="workspace-announcement-item-top">
                    <span className="workspace-announcement-severity">
                      {announcementSeverityLabel(item.severity)}
                    </span>
                    <time dateTime={item.published_at || undefined}>
                      {formatAnnouncementTime(item.published_at)}
                    </time>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.message}</p>
                  {item.include_status_link && canOpenStatus && typeof onNavigate === "function" ? (
                    <button
                      type="button"
                      className="btn-text btn-sm workspace-announcement-status-link"
                      onClick={() => {
                        setOpen(false);
                        onNavigate({ name: "account", section: "status" });
                      }}
                    >
                      View Status
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
