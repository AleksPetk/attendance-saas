import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { escapeHtml } from "../static/markdown.js";
import {
  applyExclusiveOpen,
  faqCountLabel,
  highlightEscapedText,
  nextExclusiveOpenId,
  relatedGuideMeta,
  setFaqItemExpanded,
  toggleFaqExclusive,
} from "../static/faq-view.js";
import { filterFaqEntries } from "../static/faq-search.js";

const ROOT = dirname(fileURLToPath(import.meta.url));

function fakeClassList(initial = []) {
  const states = new Set(initial);
  return {
    states,
    toggle(name, on) {
      if (on) states.add(name);
      else states.delete(name);
    },
    contains(name) {
      return states.has(name);
    },
  };
}

function fakeButton({ id, expanded = false, controls }) {
  const attrs = {
    id,
    "aria-expanded": expanded ? "true" : "false",
    "aria-controls": controls,
  };
  const item = { classList: fakeClassList(expanded ? ["is-open"] : []) };
  return {
    id,
    getAttribute(name) {
      return attrs[name];
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
    },
    closest() {
      return item;
    },
    item,
  };
}

function fakePanel(hidden) {
  return { hidden };
}

test("result count keeps the current matching-answers wording", () => {
  assert.equal(faqCountLabel(52), "52 matching answers");
  assert.equal(faqCountLabel(1), "1 matching answer");
  assert.equal(faqCountLabel(0), "0 matching answers");
});

test("opening another FAQ item closes the previously opened one", () => {
  const items = [
    { id: "faq-q-a", expanded: true },
    { id: "faq-q-b", expanded: false },
  ];
  assert.equal(nextExclusiveOpenId("faq-q-a", "faq-q-a"), null);
  assert.equal(nextExclusiveOpenId("faq-q-a", "faq-q-b"), "faq-q-b");
  const next = applyExclusiveOpen(items, "faq-q-b");
  assert.deepEqual(
    next.map((item) => [item.id, item.expanded]),
    [
      ["faq-q-a", false],
      ["faq-q-b", true],
    ],
  );
});

test("toggle updates aria-expanded and only one panel stays open", () => {
  const first = fakeButton({ id: "faq-q-a", expanded: false, controls: "faq-a-a" });
  const second = fakeButton({ id: "faq-q-b", expanded: false, controls: "faq-a-b" });
  const panels = {
    "faq-a-a": fakePanel(true),
    "faq-a-b": fakePanel(true),
  };
  const findPanel = (id) => panels[id];

  setFaqItemExpanded(first, panels["faq-a-a"], false);
  assert.equal(first.getAttribute("aria-expanded"), "false");
  assert.equal(first.item.classList.contains("is-open"), false);
  assert.equal(panels["faq-a-a"].hidden, true);

  assert.equal(toggleFaqExclusive([first, second], first, findPanel), "faq-q-a");
  assert.equal(first.getAttribute("aria-expanded"), "true");
  assert.equal(second.getAttribute("aria-expanded"), "false");
  assert.equal(panels["faq-a-a"].hidden, false);
  assert.equal(panels["faq-a-b"].hidden, true);
  assert.equal(first.item.classList.contains("is-open"), true);

  assert.equal(toggleFaqExclusive([first, second], second, findPanel), "faq-q-b");
  assert.equal(first.getAttribute("aria-expanded"), "false");
  assert.equal(second.getAttribute("aria-expanded"), "true");
  assert.equal(panels["faq-a-a"].hidden, true);
  assert.equal(panels["faq-a-b"].hidden, false);

  assert.equal(toggleFaqExclusive([first, second], second, findPanel), null);
  assert.equal(second.getAttribute("aria-expanded"), "false");
  assert.equal(panels["faq-a-b"].hidden, true);
});

test("related guide uses the canonical Docs document title and href", () => {
  const meta = relatedGuideMeta("groups-members", [
    { slug: "groups-members", title: "Groups & Members" },
    { slug: "kiosk-setup", title: "Kiosk Setup" },
  ]);
  assert.equal(meta.href, "/groups-members");
  assert.equal(meta.label, "Groups & Members");
  assert.equal(relatedGuideMeta("", []), null);
});

test("question highlighting wraps escaped text only and skips short tokens", () => {
  const marked = highlightEscapedText(escapeHtml("What is a Member?"), ["member"]);
  assert.match(marked, /<mark class="faq-mark">Member<\/mark>/);
  const escaped = highlightEscapedText(escapeHtml("<script>alert(1)</script>"), ["script"]);
  assert.equal(escaped.includes("<script>"), false);
  assert.match(escaped, /&lt;/);
  assert.equal(highlightEscapedText(escapeHtml("PIN help"), ["a"]), "PIN help");
});

test("search and category filtering still drive the FAQ result set", () => {
  const entries = [
    {
      slug: "what-is-a-member",
      question: "What is a Member?",
      answer_markdown: "A reusable person record.",
      category: "members_groups",
      category_label: "Members & Groups",
      keywords: ["person"],
    },
    {
      slug: "how-do-pins-work",
      question: "How do PINs work on a kiosk?",
      answer_markdown: "Group participation PIN is used at check-in.",
      category: "kiosk",
      category_label: "Kiosk",
      keywords: ["pin"],
    },
  ];
  const search = filterFaqEntries(entries, "member");
  assert.equal(search.mode, "search");
  assert.equal(search.items.length, 1);
  assert.equal(search.items[0].slug, "what-is-a-member");
  const grouped = filterFaqEntries(entries, "");
  assert.equal(grouped.mode, "grouped");
  assert.equal(grouped.items.length, 2);
});

test("FAQ accordion markup and CSS stay accessible and mobile-safe", () => {
  const js = readFileSync(join(ROOT, "../static/docs.js"), "utf8");
  const css = readFileSync(join(ROOT, "../static/docs.css"), "utf8");
  assert.match(js, /type="button" class="faq-question"/);
  assert.match(js, /aria-expanded/);
  assert.match(js, /aria-controls/);
  assert.match(js, /toggleFaqExclusive/);
  assert.match(js, /width="16" height="16"/);
  assert.match(js, /faq-chevron/);
  assert.match(js, /aria-hidden="true"/);
  assert.match(js, /Related guide/);
  assert.match(js, /faq-related-link/);
  assert.match(js, /relatedGuideMeta/);
  assert.match(js, /faqCountLabel/);
  assert.match(js, /highlightEscapedText/);
  assert.doesNotMatch(js, /answer_markdown[\s\S]{0,80}highlightEscapedText/);
  assert.match(css, /\.faq-item\.is-open/);
  assert.match(css, /\.faq-chevron/);
  assert.match(css, /transform: rotate\(180deg\)/);
  assert.match(css, /min-height: 2\.75rem/);
  assert.match(css, /\.faq-related-link/);
  assert.match(css, /\.faq-toolbar/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /flex-wrap/);
  assert.match(css, /:focus-visible/);
});
