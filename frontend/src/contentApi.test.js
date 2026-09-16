import assert from "node:assert/strict";
import { test } from "node:test";

import { api } from "./api.js";

test("canonical content API helpers use existing list, detail, and FAQ endpoints", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ documents: [], entries: [], categories: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await api.listContentDocuments();
    await api.getContentDocument("privacy-policy");
    await api.listContentFaq({ category: "privacy", q: "personal data" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls[0].url, "http://localhost:8000/api/content/documents/");
  assert.equal(calls[1].url, "http://localhost:8000/api/content/documents/privacy-policy/");
  assert.equal(
    calls[2].url,
    "http://localhost:8000/api/content/faq/?category=privacy&q=personal+data",
  );
  assert.ok(calls.every((call) => call.options.credentials === "omit"));
});

test("document detail helper safely encodes a supplied slug", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ detail: "Not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await assert.rejects(api.getContentDocument("not a slug"), (error) => error.status === 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.match(requestedUrl, /not%20a%20slug/);
});

test("content document helper forwards active workspace language for EN and JA", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ slug: "terms-of-use", language: "en", title: "Terms" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await api.getContentDocument("terms-of-use", { lang: "en" });
    await api.getContentDocument("terms-of-use", { lang: "ja" });
    await api.getContentDocument("privacy-policy", { lang: "ja" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls[0].url, "http://localhost:8000/api/content/documents/terms-of-use/?lang=en");
  assert.equal(calls[1].url, "http://localhost:8000/api/content/documents/terms-of-use/?lang=ja");
  assert.equal(calls[2].url, "http://localhost:8000/api/content/documents/privacy-policy/?lang=ja");
  assert.ok(calls.every((call) => call.options.credentials === "omit"));
});

