import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";

import {
  InfoDocumentList,
  InfoDocumentViewer,
  InfoLoadError,
  groupContentDocuments,
  selectedInfoDocumentSlug,
  updateInfoDocumentSearch,
} from "./AccountInfoPanel.js";

const documents = [
  {
    slug: "privacy-policy",
    title: "Privacy Policy from API",
    description: "Canonical privacy description.",
    document_type: "legal",
    nav_group: "legal",
    nav_group_label: "Legal",
    sort_order: 20,
    updated_at: "2026-08-28T00:00:00Z",
  },
  {
    slug: "terms-of-use",
    title: "Terms supplied by API",
    description: "Canonical terms description.",
    document_type: "legal",
    nav_group: "legal",
    nav_group_label: "Legal",
    sort_order: 10,
  },
];

test("Info landing groups and renders document metadata supplied by the API", () => {
  const groups = groupContentDocuments(documents);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "Legal");
  assert.deepEqual(groups[0].documents.map((item) => item.slug), ["terms-of-use", "privacy-policy"]);
  const html = renderToStaticMarkup(InfoDocumentList({ documents, onOpen: () => {} }));
  assert.match(html, /Privacy Policy from API/);
  assert.match(html, /Terms supplied by API/);
  assert.match(html, /Canonical privacy description/);
  assert.match(html, /account\/info\?document=privacy-policy/);
});

test("Info query helpers support selection, direct deep links, and Back to list", () => {
  const selected = updateInfoDocumentSearch(new URLSearchParams("source=account"), "kiosk-setup");
  assert.equal(selected.get("document"), "kiosk-setup");
  assert.equal(selected.get("source"), "account");
  assert.equal(selectedInfoDocumentSlug(new URLSearchParams("document=kiosk-setup")), "kiosk-setup");
  const back = updateInfoDocumentSearch(selected, "");
  assert.equal(back.has("document"), false);
  assert.equal(back.get("source"), "account");
});

test("native document viewer renders canonical detail and Back control", () => {
  const document = {
    ...documents[0],
    body_markdown: "# Privacy Policy from API\n\n## Scope\nCanonical body from API.",
    effective_on: "2026-08-26",
    version: "1.2",
  };
  const html = renderToStaticMarkup(
    InfoDocumentViewer({ document, faqPayload: null, onBack: () => {}, onDocumentNavigate: () => {} }),
  );
  assert.match(html, /Back to Info/);
  assert.match(html, /Privacy Policy from API/);
  assert.match(html, /Canonical body from API/);
  assert.match(html, /Effective/);
  assert.match(html, /Version 1.2/);
});

test("FAQ viewer combines the FAQ document with canonical FAQ API questions", () => {
  const html = renderToStaticMarkup(
    InfoDocumentViewer({
      document: {
        slug: "faq",
        title: "FAQ",
        description: "Canonical FAQ introduction.",
        body_markdown: "# FAQ\n\nBrowse canonical answers.",
        nav_group_label: "Help",
      },
      faqPayload: {
        categories: [{ id: "general", label: "General" }],
        entries: [
          {
            slug: "api-question",
            question: "Question supplied by the FAQ API?",
            answer_markdown: "Answer supplied by the API.",
            category: "general",
          },
        ],
      },
      onBack: () => {},
      onDocumentNavigate: () => {},
    }),
  );
  assert.match(html, /Browse canonical answers/);
  assert.match(html, /Frequently asked questions/);
  assert.match(html, /Question supplied by the FAQ API/);
});

test("unavailable document state remains inside Account and offers Back", () => {
  const html = renderToStaticMarkup(
    InfoLoadError({ message: "This document is not available or is no longer published.", onBack: () => {} }),
  );
  assert.match(html, /not available or is no longer published/);
  assert.match(html, /Back to Info/);
});

