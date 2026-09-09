import { useCallback, useEffect, useId, useRef, useState } from "react";
import { endpoints } from "@checkstation/api";
import { canManageOwnerAccount } from "@checkstation/domain";
import {
  ANNOUNCEMENT_ATTENTION_MS,
  ANNOUNCEMENT_POLL_MS,
  EMPTY_ANNOUNCEMENTS,
  announcementUnreadCount,
  markAnnouncementResultsRead,
  mergeAnnouncementPayload,
  shouldShowAnnouncementAttention,
  type AnnouncementPayload,
  type AnnouncementSeverity,
} from "../lib/announcements";
import { useApp } from "../lib/AppProvider";

function BellIcon() {
  return <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z" /></svg>;
}

export function DesktopAnnouncementBell({ onViewStatus }: { onViewStatus: () => void }) {
  const { api, authState, locale, t } = useApp();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  const payloadRef = useRef<AnnouncementPayload>(EMPTY_ANNOUNCEMENTS);
  const previousUnread = useRef(0);
  const markReadInFlight = useRef(false);
  const loadInFlight = useRef(false);
  const [payload, setPayload] = useState<AnnouncementPayload>(EMPTY_ANNOUNCEMENTS);
  const [open, setOpen] = useState(false);
  const [attention, setAttention] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { payloadRef.current = payload; }, [payload]);

  const applyPayload = useCallback((next: AnnouncementPayload) => {
    const merged = mergeAnnouncementPayload(next);
    const unread = announcementUnreadCount(merged);
    if (shouldShowAnnouncementAttention(unread, previousUnread.current, openRef.current)) setAttention(true);
    previousUnread.current = unread;
    setPayload(merged);
  }, []);

  const load = useCallback(async () => {
    if (document.visibilityState === "hidden" || loadInFlight.current) return;
    loadInFlight.current = true;
    try {
      applyPayload(await api.get<AnnouncementPayload>(endpoints.announcements()));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      loadInFlight.current = false;
    }
  }, [api, applyPayload]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), ANNOUNCEMENT_POLL_MS);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [load]);

  useEffect(() => {
    if (!attention) return;
    const timer = window.setTimeout(() => setAttention(false), ANNOUNCEMENT_ATTENTION_MS);
    return () => window.clearTimeout(timer);
  }, [attention]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("pointerdown", onPointerDown); window.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  const markVisibleRead = useCallback(async () => {
    const current = payloadRef.current;
    if (markReadInFlight.current || !current.results.some((item) => !item.is_read)) return;
    previousUnread.current = 0;
    setAttention(false);
    setPayload(markAnnouncementResultsRead(current));
    markReadInFlight.current = true;
    try {
      await api.post(`${endpoints.announcements()}mark-read/`, {});
      applyPayload(await api.get<AnnouncementPayload>(endpoints.announcements()));
      setLoadError(false);
    } catch {
      try { applyPayload(await api.get<AnnouncementPayload>(endpoints.announcements())); }
      catch { setPayload(current); previousUnread.current = announcementUnreadCount(current); setLoadError(true); }
    } finally {
      markReadInFlight.current = false;
    }
  }, [api, applyPayload]);

  const unreadCount = announcementUnreadCount(payload);
  const toggleOpen = () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setAttention(false);
    void markVisibleRead();
  };

  return <div className="workspace-announcement-root" ref={rootRef}>
    <button type="button" className={["workspace-announcement-bell", unreadCount ? "has-unread" : "", attention ? "is-attention" : ""].filter(Boolean).join(" ")} aria-label={unreadCount ? t("notifications.unreadAria", { count: unreadCount }) : t("notifications.aria")} aria-expanded={open} aria-controls={panelId} onClick={toggleOpen}>
      <BellIcon />
      {unreadCount ? <span className="workspace-announcement-badge" aria-hidden="true">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
    </button>
    {open ? <div className="workspace-announcement-panel" id={panelId} role="dialog" aria-label={t("notifications.aria")}>
      <header className="workspace-announcement-panel-header"><h2>{t("notifications.title")}</h2>{loadError ? <p className="workspace-announcement-hint">{t("notifications.refreshFailed")}</p> : null}</header>
      {!payload.results.length ? <p className="workspace-announcement-empty">{t("notifications.empty")}</p> : <ul className="workspace-announcement-list">{payload.results.map((item) => <li key={item.id} className={`workspace-announcement-item is-${item.severity || "info"} ${item.is_read ? "is-read" : "is-unread"}`}>
        <div className="workspace-announcement-item-top"><span className="workspace-announcement-severity">{severityLabel(item.severity, t)}</span><time dateTime={item.published_at || undefined}>{formatTime(item.published_at, locale)}</time></div>
        <strong>{item.title}</strong><p>{item.message}</p>
        {item.include_status_link && canManageOwnerAccount(authState.session) ? <button type="button" className="workspace-announcement-status-link" onClick={() => { setOpen(false); onViewStatus(); }}>{t("notifications.viewStatus")}</button> : null}
      </li>)}</ul>}
    </div> : null}
  </div>;
}

function severityLabel(severity: AnnouncementSeverity | undefined, t: (key: string) => string) {
  if (severity === "maintenance") return t("announcementSeverity.maintenance");
  if (severity === "important") return t("announcementSeverity.important");
  return t("announcementSeverity.info");
}

function formatTime(value: string | null | undefined, locale: "en" | "ja") {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
