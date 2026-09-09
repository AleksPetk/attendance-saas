export const ANNOUNCEMENT_POLL_MS = 20_000;
export const ANNOUNCEMENT_ATTENTION_MS = 4_200;

export type AnnouncementSeverity = "info" | "maintenance" | "important";

export type Announcement = {
  id: number;
  title: string;
  message: string;
  severity?: AnnouncementSeverity;
  published_at?: string | null;
  expires_at?: string | null;
  include_status_link?: boolean;
  is_read?: boolean;
  read_at?: string | null;
};

export type AnnouncementPayload = {
  unread_count: number;
  results: Announcement[];
};

export const EMPTY_ANNOUNCEMENTS: AnnouncementPayload = { unread_count: 0, results: [] };

export function announcementUnreadCount(payload: AnnouncementPayload) {
  if (typeof payload.unread_count === "number") return payload.unread_count;
  return payload.results.filter((item) => !item.is_read).length;
}

export function mergeAnnouncementPayload(next: AnnouncementPayload): AnnouncementPayload {
  return {
    unread_count: announcementUnreadCount(next),
    results: [...(next.results || [])].sort((a, b) => {
      const byTime = (Date.parse(b.published_at || "") || 0) - (Date.parse(a.published_at || "") || 0);
      return byTime || b.id - a.id;
    }),
  };
}

export function markAnnouncementResultsRead(payload: AnnouncementPayload): AnnouncementPayload {
  const now = new Date().toISOString();
  return {
    unread_count: 0,
    results: payload.results.map((item) => item.is_read ? item : { ...item, is_read: true, read_at: now }),
  };
}

export function shouldShowAnnouncementAttention(unreadCount: number, previousUnreadCount: number, panelOpen: boolean) {
  return !panelOpen && unreadCount > 0 && unreadCount > previousUnreadCount;
}
