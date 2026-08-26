import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  contactHref,
  featuredQuestions,
  statusApiUrl,
  statusSummary,
  statusTone,
} from "../static/support-view.js";
import { filterFaqEntries } from "../static/faq-search.js";

const ROOT = dirname(fileURLToPath(import.meta.url));

test("Support Contact CTA uses the configured main-site /contact URL", () => {
  assert.equal(contactHref("http://localhost:5173"), "http://localhost:5173/contact");
  assert.equal(contactHref("http://localhost:5173/"), "http://localhost:5173/contact");
});

test("Support status summary stays unknown when the Status API is missing", () => {
  assert.deepEqual(statusSummary(null), {
    state: "unavailable",
    label: "System status unavailable",
  });
  assert.equal(
    statusSummary({
      overall: { state: "all_operational", label: "All systems operational" },
    }).label,
    "All systems operational",
  );
  assert.equal(statusTone("all_operational"), "operational");
  assert.equal(
    statusSummary({
      overall: { state: "some_degraded", label: "Some systems degraded" },
    }).state,
    "some_degraded",
  );
  assert.equal(statusTone("some_degraded"), "attention");
  assert.equal(statusTone("unavailable"), "unknown");
  assert.equal(
    statusApiUrl("http://localhost:8090"),
    "http://localhost:8090/api/status/current/",
  );
});

test("Support search reuses canonical FAQ filtering", () => {
  const entries = [
    { slug: "why-cant-i-launch-my-kiosk", question: "Why can't I launch my kiosk?", answer_markdown: "readiness", keywords: [] },
    { slug: "other", question: "Something else", answer_markdown: "nope", keywords: [] },
  ];
  const found = filterFaqEntries(entries, "launch kiosk");
  assert.equal(found.items[0].slug, "why-cant-i-launch-my-kiosk");
});

test("Support hub markup uses FAQ API and Status API, not a second FAQ copy", () => {
  const js = readFileSync(join(ROOT, "../static/docs.js"), "utf8");
  assert.match(js, /slug === "support"/);
  assert.match(js, /\/api\/content\/faq\//);
  assert.match(js, /statusApiUrl/);
  assert.match(js, /contactHref/);
  assert.doesNotMatch(js, /Why can't I launch my kiosk\?/);
  assert.equal(featuredQuestions([{ featured: true, slug: "a" }, { featured: false, slug: "b" }], 1)[0].slug, "a");
});
