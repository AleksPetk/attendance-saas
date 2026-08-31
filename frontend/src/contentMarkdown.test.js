import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";

import {
  ContentMarkdown,
  classifyContentHref,
  stripLeadingDocumentTitle,
} from "./contentMarkdown.js";

function render(markdown) {
  return renderToStaticMarkup(ContentMarkdown({ markdown }));
}

function findElement(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  const children = Array.isArray(node.props?.children)
    ? node.props.children
    : [node.props?.children];
  for (const child of children) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return null;
}

test("raw script and event-handler HTML render only as escaped text", () => {
  const html = render('<script>alert("xss")</script>\n\n<img src=x onerror="alert(1)">');
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=/);
});

test("unsafe Markdown URLs are rejected and valid HTTPS remains linked", () => {
  const html = render(
    "[js](javascript:alert(1)) [data](data:text/html,x) [relative](//evil.example) [safe](https://example.com/help)",
  );
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.doesNotMatch(html, /href="data:/i);
  assert.doesNotMatch(html, /href="\/\/evil/i);
  assert.match(html, /href="https:\/\/example.com\/help"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test("URL classifier allows only documented link classes", () => {
  assert.equal(classifyContentHref("/billing-plans").kind, "internal-document");
  assert.equal(classifyContentHref("#billing").kind, "fragment");
  assert.equal(classifyContentHref("mailto:help@example.com").kind, "external");
  assert.equal(classifyContentHref("http://example.com").kind, "external");
  assert.equal(classifyContentHref("javascript:alert(1)").kind, "unsafe");
  assert.equal(classifyContentHref("data:text/html,x").kind, "unsafe");
  assert.equal(classifyContentHref("//evil.example").kind, "unsafe");
});

test("internal document links target Account Info and use native navigation callback", () => {
  let selected = "";
  const tree = ContentMarkdown({
    markdown: "Read [Billing & Plans](/billing-plans).",
    onDocumentNavigate: (slug) => {
      selected = slug;
    },
  });
  const link = findElement(tree, (node) => node.type === "a");
  assert.ok(link);
  assert.equal(link.props.href, "/account/info?document=billing-plans");
  let prevented = false;
  link.props.onClick({
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(selected, "billing-plans");
});

test("safe renderer supports a registration-native internal document URL", () => {
  const tree = ContentMarkdown({
    markdown: "Read the [Privacy Policy](/privacy-policy).",
    onDocumentNavigate: () => {},
    internalDocumentHref: (slug) => `/register?legal=${encodeURIComponent(slug)}`,
  });
  const link = findElement(tree, (node) => node.type === "a");
  assert.ok(link);
  assert.equal(link.props.href, "/register?legal=privacy-policy");
});

test("leading canonical title can be removed without changing document content", () => {
  assert.equal(
    stripLeadingDocumentTitle("# Privacy Policy\n\n## Scope\nText", "Privacy Policy"),
    "## Scope\nText",
  );
  assert.equal(stripLeadingDocumentTitle("## Scope\nText", "Privacy Policy"), "## Scope\nText");
});
