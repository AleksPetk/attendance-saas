import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  faqPathForQuery,
  filterFaqEntries,
  groupFaqByCategory,
  searchQueryFromSearch,
  tokenizeQuery,
} from "../static/faq-search.js";

const ROOT = dirname(fileURLToPath(import.meta.url));

const ENTRIES = [
  {
    slug: "what-is-a-member",
    question: "What is a Member?",
    answer_markdown: "A reusable person record.",
    category: "members_groups",
    category_label: "Members & Groups",
    keywords: ["person", "profile"],
    sort_order: 10,
  },
  {
    slug: "how-do-pins-work",
    question: "How do PINs work on a kiosk?",
    answer_markdown: "Group participation PIN is used at check-in.",
    category: "kiosk",
    category_label: "Kiosk",
    keywords: ["pin", "exit code"],
    sort_order: 20,
  },
  {
    slug: "what-happens-when-i-cancel",
    question: "How do I cancel my subscription?",
    answer_markdown: "Cancel from Account Subscription. Access remains until period end.",
    category: "subscription_changes",
    category_label: "Subscription Changes",
    keywords: ["cancel", "resume"],
    sort_order: 30,
  },
  {
    slug: "downgrade-data",
    question: "What happens to my data if I downgrade?",
    answer_markdown: "Records are not deleted. Extra Members become plan-locked.",
    category: "members_groups",
    category_label: "Members & Groups",
    keywords: ["plan lock", "downgrade members"],
    sort_order: 40,
  },
];

test("search is case-insensitive, trimmed, and matches question, answer, keywords, category", () => {
  assert.deepEqual(tokenizeQuery("  Cancel   Subscription "), ["cancel", "subscription"]);
  const question = filterFaqEntries(ENTRIES, "  MEMBER  ");
  assert.equal(question.mode, "search");
  assert.equal(question.items[0].slug, "what-is-a-member");

  const keyword = filterFaqEntries(ENTRIES, "pin");
  assert.ok(keyword.items.some((item) => item.slug === "how-do-pins-work"));

  const answer = filterFaqEntries(ENTRIES, "plan-locked");
  assert.ok(answer.items.some((item) => item.slug === "downgrade-data"));

  const category = filterFaqEntries(ENTRIES, "kiosk");
  assert.ok(category.items.some((item) => item.slug === "how-do-pins-work"));
});

test("cancel subscription and downgrade members rank useful matches first", () => {
  const cancel = filterFaqEntries(ENTRIES, "cancel subscription");
  assert.equal(cancel.items[0].slug, "what-happens-when-i-cancel");
  const down = filterFaqEntries(ENTRIES, "downgrade members");
  assert.equal(down.items[0].slug, "downgrade-data");
});

test("empty search returns grouped mode and whitespace-only is empty", () => {
  const grouped = filterFaqEntries(ENTRIES, "   ");
  assert.equal(grouped.mode, "grouped");
  assert.equal(grouped.items.length, ENTRIES.length);
  const none = filterFaqEntries(ENTRIES, "zzzz-no-match");
  assert.equal(none.mode, "search");
  assert.equal(none.items.length, 0);
});

test("URL query helpers support /faq?q=", () => {
  assert.equal(searchQueryFromSearch("?q=downgrade"), "downgrade");
  assert.equal(faqPathForQuery("  pin "), "/faq?q=pin");
  assert.equal(faqPathForQuery("   "), "/faq");
});

test("groupFaqByCategory preserves category order", () => {
  const groups = groupFaqByCategory(ENTRIES, [
    { id: "kiosk", label: "Kiosk" },
    { id: "members_groups", label: "Members & Groups" },
  ]);
  assert.deepEqual(
    groups.map((group) => group.id),
    ["kiosk", "members_groups", "subscription_changes"],
  );
});

test("FAQ UI is accordion-accessible and has a no-result state", () => {
  const js = readFileSync(join(ROOT, "../static/docs.js"), "utf8");
  const css = readFileSync(join(ROOT, "../static/docs.css"), "utf8");
  assert.match(js, /aria-expanded/);
  assert.match(js, /aria-controls/);
  assert.match(js, /toggleFaqExclusive/);
  assert.match(js, /No matching answers found/);
  assert.match(js, /faqPathForQuery/);
  assert.match(js, /\/api\/content\/faq\//);
  assert.match(js, /id="faq-search"/);
  assert.match(js, /Search CheckStation help/);
  assert.match(js, /faqCountLabel/);
  assert.match(js, /faq-related-link/);
  assert.doesNotMatch(js, /What is a Member\?/);
  assert.match(css, /\.faq-search/);
  assert.match(css, /faq-search-row/);
  assert.match(css, /\.faq-chip\.is-active/);
  assert.match(css, /flex-wrap/);
});
