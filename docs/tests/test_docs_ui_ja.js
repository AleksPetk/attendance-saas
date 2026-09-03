import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  docsPathFor,
  docsUi,
  formatMatchingAnswersCount,
  supportPopularCategories,
} from "../static/locale.js";
import { mountDocsLanguageMenu } from "../static/language-menu.js";
import { relatedGuideMeta } from "../static/faq-view.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(ROOT, "../static/index.html"), "utf8");
const docsJs = readFileSync(join(ROOT, "../static/docs.js"), "utf8");
const languageMenuJs = readFileSync(join(ROOT, "../static/language-menu.js"), "utf8");

test("Docs header includes visible language root without hidden attribute", () => {
  assert.match(indexHtml, /id="docs-language-root"/);
  assert.doesNotMatch(indexHtml, /id="docs-language-root"[^>]*hidden/);
  assert.match(indexHtml, /class="docs-top-actions"/);
});

test("language menu module renders globe trigger button", () => {
  assert.match(languageMenuJs, /docs-language-trigger/);
  assert.match(languageMenuJs, /docs-language-dropdown/);
  assert.doesNotMatch(languageMenuJs, /id="docs-language-menu"/);
});

test("docs.js mounts language menu on docs-language-root", () => {
  assert.match(docsJs, /getElementById\("docs-language-root"\)/);
  assert.match(docsJs, /mountDocsLanguageMenu/);
  assert.match(docsJs, /ui\.relatedGuide/);
  assert.match(docsJs, /supportPopularCategories\(locale\)/);
});

test("JA support categories use Japanese labels", () => {
  const labels = supportPopularCategories("ja").map((item) => item.label);
  assert.deepEqual(labels, [
    "はじめに",
    "メンバーとグループ",
    "キオスク",
    "プランとお支払い",
    "スタッフと権限",
    "メールと通知",
    "トラブルシューティング",
  ]);
  assert.doesNotMatch(labels.join("|"), /Getting Started|Members & Groups|Related guide/);
});

test("JA docs UI strings cover FAQ chrome leaks", () => {
  const ui = docsUi("ja");
  assert.equal(ui.relatedGuide, "関連ガイド");
  assert.equal(ui.supportLink, "サポート");
  assert.equal(ui.faqCategoriesAria, "FAQ カテゴリ");
  assert.equal(formatMatchingAnswersCount(3, "ja"), "3 件の一致する回答");
});

test("language menu preserves slug when switching locale", () => {
  const navigated = [];
  const root = {
    innerHTML: "",
    contains() {
      return true;
    },
    addEventListener() {},
    querySelector(selector) {
      if (selector === "#docs-language-trigger") {
        return root._trigger || null;
      }
      if (selector === "#docs-language-dropdown") {
        return root._menu || null;
      }
      return null;
    },
  };
  const originalPath = globalThis.window;
  globalThis.window = {
    location: { pathname: "/ja/faq" },
    addEventListener() {},
    removeEventListener() {},
  };
  try {
    mountDocsLanguageMenu(root, {
      locale: "ja",
      onNavigate(href) {
        navigated.push(href);
      },
    });
    assert.match(root.innerHTML, /docs-language-trigger/);
    assert.match(root.innerHTML, /data-locale="en"/);
    assert.match(root.innerHTML, /data-href="\/en\/faq"/);
  } finally {
    globalThis.window = originalPath;
  }
});

test("related guide meta uses localized document title", () => {
  const documents = [
    { slug: "kiosk-setup", title: "キオスク設定", nav_group: "using" },
  ];
  const meta = relatedGuideMeta("kiosk-setup", documents, "ja");
  assert.equal(meta.label, "キオスク設定");
  assert.equal(meta.href, "/ja/kiosk-setup");
});

test("EN docs header strings remain English", () => {
  const ui = docsUi("en");
  assert.equal(ui.relatedGuide, "Related guide");
  assert.equal(supportPopularCategories("en")[0].label, "Getting Started");
});
