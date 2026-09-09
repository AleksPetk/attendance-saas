import assert from "node:assert/strict";
import test from "node:test";
import {
  announcementUnreadCount,
  markAnnouncementResultsRead,
  mergeAnnouncementPayload,
  shouldShowAnnouncementAttention,
  type AnnouncementPayload,
} from "./announcements";

const payload: AnnouncementPayload = {
  unread_count: 2,
  results: [
    { id: 1, title: "Older", message: "One", published_at: "2026-01-01T00:00:00Z", is_read: false },
    { id: 2, title: "Newer", message: "Two", published_at: "2026-01-02T00:00:00Z", is_read: false },
  ],
};

test("announcement payload keeps Workspace unread and newest-first behavior", () => {
  const merged = mergeAnnouncementPayload(payload);
  assert.equal(announcementUnreadCount(merged), 2);
  assert.deepEqual(merged.results.map((item) => item.id), [2, 1]);
  assert.equal(shouldShowAnnouncementAttention(2, 1, false), true);
  assert.equal(shouldShowAnnouncementAttention(2, 1, true), false);
});

test("opening the panel marks visible announcements read without dropping history", () => {
  const read = markAnnouncementResultsRead(payload);
  assert.equal(read.unread_count, 0);
  assert.equal(read.results.length, 2);
  assert.equal(read.results.every((item) => item.is_read && item.read_at), true);
});
