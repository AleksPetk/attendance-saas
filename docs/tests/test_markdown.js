import assert from "node:assert/strict";
import { test } from "node:test";

import { extractHeadings, renderMarkdown } from "../static/markdown.js";

test("markdown escapes script tags instead of executing HTML", () => {
  const html = renderMarkdown("Hello <script>alert('xss')</script> **world**");
  assert.match(html, /&lt;script&gt;alert\('xss'\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /<strong>world<\/strong>/);
});

test("markdown keeps internal Docs paths as same-tab links", () => {
  const html = renderMarkdown("See [Kiosk Setup](/kiosk-setup) and [home](/).");
  assert.match(html, /<a href="\/kiosk-setup">Kiosk Setup<\/a>/);
  assert.match(html, /<a href="\/">home<\/a>/);
  assert.doesNotMatch(html, /href="\/kiosk-setup"[^>]*target="_blank"/);
  assert.doesNotMatch(html, /javascript:/i);
});

test("markdown rejects javascript URLs", () => {
  const html = renderMarkdown("See [bad](javascript:alert(1)) and [ok](https://example.com).");
  assert.doesNotMatch(html, /javascript:/i);
  assert.match(html, /<a href="https:\/\/example.com"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test("markdown rejects protocol-relative and unknown schemes", () => {
  const html = renderMarkdown("[bad](//evil.example) [also](data:text/html,x)");
  assert.doesNotMatch(html, /href="\/\//);
  assert.doesNotMatch(html, /data:text/);
});

test("image tags in source stay escaped", () => {
  const html = renderMarkdown('<img src=x onerror="alert(1)">');
  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /&lt;img /);
});

test("long legal-style markdown keeps headings and lists", () => {
  const source = `# Terms of Use\n\n## 1. The service\n\nCheck Station is a tool.\n\n- customers control data\n- kiosks record actions\n\n### 1.1 Nested\n\nMore text.\n`;
  const html = renderMarkdown(source);
  assert.match(html, /<h1 id="terms-of-use">Terms of Use<\/h1>/);
  assert.match(html, /<h2 id="1-the-service">/);
  assert.match(html, /<ul>/);
  assert.match(html, /<li>customers control data<\/li>/);
  const headings = extractHeadings(source);
  assert.equal(headings.length, 2);
});
