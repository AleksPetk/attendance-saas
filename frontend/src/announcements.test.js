import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import {
  ANNOUNCEMENT_POLL_MS,
  announcementListFetchOptions,
  announcementUnreadCount,
  markAnnouncementResultsRead,
  mergeAnnouncementPayload,
  shouldShowAnnouncementAttention,
  shouldStartAnnouncementPoll,
  sortAnnouncementsNewestFirst,
} from "./announcements.js";

test("notification helpers keep newest first and unread counts", () => {
  const sorted = sortAnnouncementsNewestFirst([
    { id: 1, published_at: "2026-08-30T10:00:00Z", is_read: true },
    { id: 2, published_at: "2026-08-31T10:00:00Z", is_read: false },
  ]);
  assert.deepEqual(sorted.map((item) => item.id), [2, 1]);
  assert.equal(announcementUnreadCount({ unread_count: 3, results: [] }), 3);
  assert.equal(
    announcementUnreadCount({
      results: [
        { id: 1, is_read: false },
        { id: 2, is_read: true },
      ],
    }),
    1,
  );
});

test("opening/read mapping clears unread without dropping history", () => {
  const current = {
    unread_count: 2,
    results: [
      { id: 1, title: "A", is_read: false },
      { id: 2, title: "B", is_read: false },
    ],
  };
  const next = markAnnouncementResultsRead(current);
  assert.equal(next.unread_count, 0);
  assert.equal(next.results.length, 2);
  assert.ok(next.results.every((item) => item.is_read));
});

test("attention only fires when unread increases while panel is closed", () => {
  assert.equal(
    shouldShowAnnouncementAttention({ unreadCount: 1, previousUnreadCount: 0, panelOpen: false }),
    true,
  );
  assert.equal(
    shouldShowAnnouncementAttention({ unreadCount: 1, previousUnreadCount: 1, panelOpen: false }),
    false,
  );
  assert.equal(
    shouldShowAnnouncementAttention({ unreadCount: 2, previousUnreadCount: 1, panelOpen: true }),
    false,
  );
});

test("failed refresh can preserve previous payload via merge helper", () => {
  const previous = mergeAnnouncementPayload(null, {
    unread_count: 1,
    results: [{ id: 9, title: "Keep me", published_at: "2026-08-31T08:00:00Z", is_read: false }],
  });
  assert.equal(previous.results[0].title, "Keep me");
  assert.deepEqual(mergeAnnouncementPayload(previous, null), previous);
});

test("poll merge updates unread 0 -> 1 and keeps prior reads", () => {
  const afterRead = mergeAnnouncementPayload(null, {
    unread_count: 0,
    results: [
      {
        id: 1,
        title: "Already read",
        published_at: "2026-08-31T08:00:00Z",
        is_read: true,
        read_at: "2026-08-31T08:05:00Z",
      },
    ],
  });
  assert.equal(announcementUnreadCount(afterRead), 0);
  assert.equal(
    shouldShowAnnouncementAttention({
      unreadCount: announcementUnreadCount(afterRead),
      previousUnreadCount: 0,
      panelOpen: false,
    }),
    false,
  );

  const afterNewPublish = mergeAnnouncementPayload(afterRead, {
    unread_count: 1,
    results: [
      {
        id: 2,
        title: "Brand new",
        published_at: "2026-08-31T09:00:00Z",
        is_read: false,
      },
      afterRead.results[0],
    ],
  });
  assert.equal(announcementUnreadCount(afterNewPublish), 1);
  assert.equal(afterNewPublish.results[0].id, 2);
  assert.equal(afterNewPublish.results[1].is_read, true);
  assert.equal(
    shouldShowAnnouncementAttention({
      unreadCount: 1,
      previousUnreadCount: 0,
      panelOpen: false,
    }),
    true,
  );
});

test("poll scheduler helpers skip overlap and hidden tabs", () => {
  assert.equal(ANNOUNCEMENT_POLL_MS, 20000);
  assert.deepEqual(announcementListFetchOptions(), { cache: "no-store" });
  assert.equal(shouldStartAnnouncementPoll({ visibilityState: "visible", inFlight: false }), true);
  assert.equal(shouldStartAnnouncementPoll({ visibilityState: "hidden", inFlight: false }), false);
  assert.equal(shouldStartAnnouncementPoll({ visibilityState: "visible", inFlight: true }), false);
});

test("Workspace header owns live announcement polling across Workspace routes", () => {
  const layout = readFileSync(new URL("./WorkspaceLayout.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
  const bell = readFileSync(new URL("./WorkspaceAnnouncementBell.jsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

  assert.match(layout, /WorkspaceAnnouncementBell/);
  assert.match(layout, /workspace-topbar-actions/);
  assert.match(app, /<WorkspaceLayout[\s\S]*<\/WorkspaceLayout>/);
  assert.match(app, /path="\/members"/);
  assert.match(app, /path="\/groups"/);
  assert.match(app, /path="\/history"/);
  assert.match(app, /path="\/account/);

  assert.match(bell, /t\("notifications\.title"\)/);
  assert.match(bell, /workspace-announcement-badge/);
  assert.match(bell, /is-attention/);
  assert.match(bell, /markAnnouncementsRead/);
  assert.match(bell, /openRef\.current/);
  assert.match(bell, /payloadRef\.current/);
  assert.match(bell, /ANNOUNCEMENT_POLL_MS/);
  assert.match(bell, /setInterval\(load,\s*ANNOUNCEMENT_POLL_MS\)/);
  assert.match(bell, /clearInterval/);
  assert.match(bell, /visibilitychange/);
  assert.match(bell, /shouldStartAnnouncementPoll/);
  assert.match(bell, /pollInFlight/);
  assert.match(bell, /cancelled = true/);
  assert.match(bell, /setLoadError\(true\)/);
  assert.doesNotMatch(bell, /queueMicrotask/);
  assert.doesNotMatch(bell, /shouldPersist/);
  assert.doesNotMatch(bell, /ignoreStaleUnreadUntil/);
  assert.doesNotMatch(bell, /localStorage/);
  assert.doesNotMatch(bell, /sessionStorage/);
  assert.match(css, /grid-template-columns:\s*260px minmax\(0,\s*1fr\)/);
  assert.match(css, /\.workspace-announcement-bell/);
  assert.match(css, /@keyframes announcement-attention/);
});

test("announcement list client uses scoped no-store cache", () => {
  const api = readFileSync(new URL("./api.js", import.meta.url), "utf8");
  assert.match(
    api,
    /listAnnouncements:\s*\(\)\s*=>\s*\n?\s*request\("\/api\/announcements\/",\s*\{\s*cache:\s*"no-store"\s*\}\)/,
  );
  assert.match(api, /\.\.\.\(cache \? \{ cache \} : \{\}\)/);
  assert.match(api, /markAnnouncementsRead:/);
  assert.match(api, /markAnnouncementRead:/);
});

test("index.html uses CheckStation favicons and does not reference Vite/React scaffold icons", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /favicon-32x32\.png\?v=20260831/);
  assert.match(html, /favicon\.ico\?v=20260831/);
  assert.match(html, /apple-touch-icon\.png\?v=20260831/);
  assert.doesNotMatch(html, /vite\.svg/);
  assert.doesNotMatch(html, /react\.svg/);
  assert.ok(existsSync(new URL("../public/favicon.ico", import.meta.url)));
  assert.ok(existsSync(new URL("../public/favicon-32x32.png", import.meta.url)));
  assert.ok(existsSync(new URL("../public/apple-touch-icon.png", import.meta.url)));
});
