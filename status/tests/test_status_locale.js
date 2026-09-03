import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  STATUS_LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  resolveInitialStatusLocale,
  resolveStatusLocale,
  saveStatusLocalePreference,
  statusPathFor,
  statusUi,
} from "../static/locale.js";
import {
  formatAutoUpdate,
  formatDuration,
  formatLastChecked,
  formatRelativeTime,
  groupComponents,
  incidentDisplaySummary,
  incidentTitle,
  overallNarrative,
  unavailablePayload,
} from "../static/status-view.js";
import { mountStatusLanguageMenu } from "../static/language-menu.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(ROOT, "../static/index.html"), "utf8");
const statusJs = readFileSync(join(ROOT, "../static/status.js"), "utf8");

const NOW = Date.parse("2026-08-26T11:18:00Z");

test("Status header includes visible language root without hidden attribute", () => {
  assert.match(indexHtml, /id="status-language-root"/);
  assert.doesNotMatch(indexHtml, /id="status-language-root"[^>]*hidden/);
  assert.match(indexHtml, /status-brand-row/);
});

test("status.js mounts language menu and requests lang query", () => {
  assert.match(statusJs, /mountStatusLanguageMenu/);
  assert.match(statusJs, /lang=\$\{encodeURIComponent\(currentLocale\)\}/);
  assert.match(statusJs, /checkstation\.status\.locale|STATUS_LOCALE_STORAGE_KEY|saveStatusLocalePreference/);
});

test("locale routes and storage key stay Status-specific", () => {
  assert.equal(STATUS_LOCALE_STORAGE_KEY, "checkstation.status.locale");
  assert.deepEqual(SUPPORTED_LOCALES, ["en", "ja"]);
  assert.equal(statusPathFor("en"), "/en/");
  assert.equal(statusPathFor("ja"), "/ja/");
  assert.equal(resolveStatusLocale("/ja/"), "ja");
  assert.equal(resolveStatusLocale("/en/"), "en");
  assert.equal(resolveInitialStatusLocale("/ja/"), "ja");
});

test("JA UI strings cover status chrome leaks", () => {
  const ui = statusUi("ja");
  assert.equal(ui.systemStatus, "システムステータス");
  assert.equal(ui.activeIncidents, "発生中のインシデント");
  assert.equal(ui.recentIncidents, "最近のインシデント");
  assert.equal(ui.scheduledMaintenance, "予定メンテナンス");
  assert.equal(ui.layerCore, "コアサービス");
  assert.equal(ui.noActiveIncidents, "発生中のインシデントはありません");
  assert.doesNotMatch(
    [
      ui.activeIncidents,
      ui.recentIncidents,
      ui.layerCore,
      ui.noActiveIncidents,
    ].join("|"),
    /Active incidents|Recent incidents|Core services|No active incidents/,
  );
});

test("language menu preserves home path when switching locale", () => {
  const root = {
    innerHTML: "",
    contains() {
      return true;
    },
    addEventListener() {},
    querySelector() {
      return null;
    },
  };
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: { pathname: "/ja/" },
    addEventListener() {},
    removeEventListener() {},
  };
  try {
    mountStatusLanguageMenu(root, { locale: "ja", onNavigate() {} });
    assert.match(root.innerHTML, /status-language-trigger/);
    assert.match(root.innerHTML, /data-locale="en"/);
    assert.match(root.innerHTML, /data-href="\/en\/"/);
    assert.match(root.innerHTML, /data-locale="ja"/);
    assert.match(root.innerHTML, /data-href="\/ja\/"/);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("overall narrative localizes for JA", () => {
  const degraded = {
    overall: { state: "some_degraded", label: "一部のシステムでパフォーマンス低下" },
    components: [
      { id: "api_backend", name: "API / バックエンド", state: "operational", layer: "core" },
      {
        id: "email_delivery",
        name: "メール配信",
        state: "major_outage",
        layer: "supporting",
      },
    ],
  };
  assert.equal(
    overallNarrative(degraded, "ja"),
    "メール配信 で問題が発生しています。",
  );
  assert.equal(unavailablePayload("ja").overall.label, "ステータスを取得できません");
});

test("components are grouped by localized layer titles", () => {
  const groups = groupComponents(
    [
      { id: "api_backend", name: "API / Backend", layer: "core", state: "operational" },
      { id: "email_delivery", name: "Email Delivery", layer: "supporting", state: "unknown" },
      { id: "documentation", name: "Documentation", layer: "peripheral", state: "unknown" },
    ],
    "ja",
  );
  assert.equal(groups[0].title, "コアサービス");
  assert.equal(groups[1].title, "サポートサービス");
  assert.equal(groups[2].title, "公開サービス");
});

test("timestamps localize for JA", () => {
  assert.match(formatLastChecked("2026-08-26T02:18:00Z", "ja"), /最終確認/);
  assert.equal(formatRelativeTime("2026-08-26T11:11:00Z", NOW, "ja"), "7 分前");
  assert.equal(
    formatDuration("2026-08-26T11:07:00Z", "2026-08-26T11:18:00Z", "ja"),
    "11 分",
  );
  assert.equal(formatAutoUpdate(30, "ja"), "30 秒ごとに自動更新");
});

test("incident helpers remain usable in EN", () => {
  const active = {
    title: "Email Delivery outage",
    summary: "This CheckStation component is currently unavailable.",
    status: "investigating",
  };
  assert.equal(incidentTitle(active, "en"), "Email Delivery");
  assert.equal(
    incidentDisplaySummary(active, "en"),
    "We're investigating an issue affecting Email Delivery.",
  );
});

test("saveStatusLocalePreference stores Status key only", () => {
  const storage = new Map();
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
  };
  try {
    saveStatusLocalePreference("ja");
    assert.equal(storage.get(STATUS_LOCALE_STORAGE_KEY), "ja");
    assert.equal(storage.get("checkstation.locale"), undefined);
    assert.equal(storage.get("checkstation.docs.locale"), undefined);
  } finally {
    globalThis.window = originalWindow;
  }
});
