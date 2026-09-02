import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  PUBLIC_FOOTER_COLUMNS,
  footerItemIsLinked,
  publicDocsDocumentUrl,
  publicDocsPageUrl,
  publicStatusPageUrl,
  splitFooterItemsIntoColumns,
  workspaceStatusHomeUrl,
} from "./publicFooterLinks.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const APP_SRC = readFileSync(join(ROOT, "App.jsx"), "utf8");

const EXISTING_PUBLIC_ROUTES = [
  "/",
  "/features",
  "/how-it-works",
  "/pricing",
  "/login",
  "/staff-login",
  "/register",
  "/contact",
];

const NEW_TAB_IDS = new Set([
  "documentation",
  "getting-started",
  "kiosk-setup",
  "groups-members",
  "billing-plans",
  "faq",
  "privacy",
  "terms",
  "status",
  "support",
]);

function collectSourceFiles(dir, collected = []) {
  for (const name of readdirSync(dir)) {
    if (name === "assets" || name.endsWith(".test.js")) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectSourceFiles(full, collected);
      continue;
    }
    if (name.endsWith(".js") || name.endsWith(".jsx") || name.endsWith(".css")) {
      collected.push(full);
    }
  }
  return collected;
}

test("footer columns match planned Website / Docs / Usage structure", () => {
  assert.deepEqual(
    PUBLIC_FOOTER_COLUMNS.map((column) => column.id),
    ["website", "docs", "usage"],
  );
  assert.deepEqual(
    PUBLIC_FOOTER_COLUMNS.find((c) => c.id === "website").items.map((i) => i.label),
    ["Features", "How it works", "Pricing", "Login", "Staff login", "Get started"],
  );
  assert.deepEqual(
    PUBLIC_FOOTER_COLUMNS.find((c) => c.id === "docs").items.map((i) => i.label),
    [
      "Documentation",
      "Getting started",
      "Kiosk setup",
      "Groups & Members",
      "Billing & Plans",
      "FAQ",
    ],
  );
  assert.deepEqual(
    PUBLIC_FOOTER_COLUMNS.find((c) => c.id === "usage").items.map((i) => i.label),
    ["Privacy Policy", "Terms of Use", "Support", "Contact", "Status"],
  );
});

test("linked in-app footer items only use existing public App routes", () => {
  for (const column of PUBLIC_FOOTER_COLUMNS) {
    for (const item of column.items) {
      if (!footerItemIsLinked(item)) continue;
      if (item.href) continue;
      assert.ok(
        EXISTING_PUBLIC_ROUTES.includes(item.to),
        `${item.label} uses unknown route ${item.to}`,
      );
      assert.match(
        APP_SRC,
        new RegExp(`path="${item.to.replace(/\//g, "\\/")}"`),
        `App.jsx missing route for ${item.to}`,
      );
    }
  }
});

test("Documentation, Getting started, Kiosk setup, Groups & Members, Billing & Plans, FAQ, Privacy, and Terms open Docs in a new tab", () => {
  const docs = PUBLIC_FOOTER_COLUMNS.find((c) => c.id === "docs");
  const usage = PUBLIC_FOOTER_COLUMNS.find((c) => c.id === "usage");
  const website = PUBLIC_FOOTER_COLUMNS.find((c) => c.id === "website");
  const documentation = docs.items.find((i) => i.id === "documentation");
  const gettingStarted = docs.items.find((i) => i.id === "getting-started");
  const kioskSetup = docs.items.find((i) => i.id === "kiosk-setup");
  const groupsMembers = docs.items.find((i) => i.id === "groups-members");
  const billingPlans = docs.items.find((i) => i.id === "billing-plans");
  const faq = docs.items.find((i) => i.id === "faq");
  const privacy = usage.items.find((i) => i.id === "privacy");
  const terms = usage.items.find((i) => i.id === "terms");
  const status = usage.items.find((i) => i.id === "status");
  const support = usage.items.find((i) => i.id === "support");
  const contact = usage.items.find((i) => i.id === "contact");
  const websiteGetStarted = website.items.find((i) => i.id === "get-started");

  assert.equal(documentation.href, publicDocsPageUrl());
  assert.equal(publicDocsPageUrl(), "http://localhost:8091");
  assert.doesNotMatch(documentation.href, /privacy-policy|terms-of-use|getting-started|kiosk-setup|groups-members|billing-plans|faq/);
  assert.equal(gettingStarted.href, "http://localhost:8091/getting-started");
  assert.equal(kioskSetup.href, "http://localhost:8091/kiosk-setup");
  assert.equal(groupsMembers.href, "http://localhost:8091/groups-members");
  assert.equal(billingPlans.href, "http://localhost:8091/billing-plans");
  assert.equal(faq.href, "http://localhost:8091/faq");
  assert.equal(gettingStarted.href, publicDocsDocumentUrl("getting-started"));
  assert.equal(kioskSetup.href, publicDocsDocumentUrl("kiosk-setup"));
  assert.equal(groupsMembers.href, publicDocsDocumentUrl("groups-members"));
  assert.equal(billingPlans.href, publicDocsDocumentUrl("billing-plans"));
  assert.equal(faq.href, publicDocsDocumentUrl("faq"));
  assert.equal(privacy.href, "http://localhost:8091/privacy-policy");
  assert.equal(terms.href, "http://localhost:8091/terms-of-use");
  assert.equal(status.href, publicStatusPageUrl());
  assert.equal(status.href, "http://localhost:8090");
  assert.equal(support.href, "http://localhost:8091/support");
  assert.equal(support.external, true);
  assert.equal(support.to, undefined);
  assert.equal(contact.to, "/contact");
  assert.equal(contact.href, undefined);
  assert.notEqual(contact.external, true);

  for (const item of [
    documentation,
    gettingStarted,
    kioskSetup,
    groupsMembers,
    billingPlans,
    faq,
    privacy,
    terms,
    status,
    support,
  ]) {
    assert.equal(item.external, true);
    assert.match(item.href, /^https?:\/\//);
    assert.doesNotMatch(item.href, /#$/);
    assert.equal(item.to, undefined);
  }

  for (const item of docs.items) {
    assert.equal(footerItemIsLinked(item), true, `${item.label} should be linked`);
  }
  for (const item of usage.items) {
    assert.equal(footerItemIsLinked(item), true, `${item.label} should be linked`);
  }

  assert.equal(websiteGetStarted.to, "/register");
  assert.equal(websiteGetStarted.href, undefined);
  assert.notEqual(websiteGetStarted.external, true);
  assert.notEqual(websiteGetStarted.id, gettingStarted.id);
  assert.notEqual(websiteGetStarted.href, gettingStarted.href);
});

test("PublicPageShell uses safe new-tab anchors for external footer items", () => {
  const shell = readFileSync(join(ROOT, "PublicPageShell.jsx"), "utf8");
  assert.match(shell, /target: "_blank"/);
  assert.match(shell, /rel: "noopener noreferrer"/);
  assert.match(shell, /item\.external/);
  assert.doesNotMatch(shell, /window\.open/);
});

test("promotional frontend does not duplicate canonical document bodies", () => {
  const files = collectSourceFiles(ROOT);
  assert.ok(files.length > 10);
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(src, /This Privacy Policy explains how/);
    assert.doesNotMatch(src, /These Terms of Use \("Terms"\) are an agreement/);
    assert.doesNotMatch(src, /three-day grace period as implemented in the billing catalog/);
    assert.doesNotMatch(src, /This guide is the shortest useful path from a new CheckStation account/);
    assert.doesNotMatch(src, /This guide covers configuring, previewing, launching, and exiting a CheckStation kiosk/);
    assert.doesNotMatch(src, /This guide explains how people and check-in contexts work in CheckStation today/);
    assert.doesNotMatch(src, /This is the customer reference for CheckStation subscriptions/);
    assert.doesNotMatch(src, /Find short answers about CheckStation/);
  }
});

test("website column connects every planned item to a live route", () => {
  const website = PUBLIC_FOOTER_COLUMNS.find((c) => c.id === "website");
  for (const item of website.items) {
    assert.equal(footerItemIsLinked(item), true);
  }
  assert.equal(website.items.find((i) => i.id === "get-started").to, "/register");
  assert.equal(website.items.find((i) => i.id === "get-started").label, "Get started");
  const docsGettingStarted = PUBLIC_FOOTER_COLUMNS.find((c) => c.id === "docs").items.find(
    (i) => i.id === "getting-started",
  );
  assert.equal(docsGettingStarted.label, "Getting started");
  assert.equal(docsGettingStarted.to, undefined);
});

test("splitFooterItemsIntoColumns fills left column first", () => {
  const website = PUBLIC_FOOTER_COLUMNS.find((c) => c.id === "website");
  const docs = PUBLIC_FOOTER_COLUMNS.find((c) => c.id === "docs");
  const usage = PUBLIC_FOOTER_COLUMNS.find((c) => c.id === "usage");

  assert.deepEqual(
    splitFooterItemsIntoColumns(website.items).map((col) => col.map((i) => i.label)),
    [
      ["Features", "How it works", "Pricing"],
      ["Login", "Staff login", "Get started"],
    ],
  );
  assert.deepEqual(
    splitFooterItemsIntoColumns(docs.items).map((col) => col.map((i) => i.label)),
    [
      ["Documentation", "Getting started", "Kiosk setup"],
      ["Groups & Members", "Billing & Plans", "FAQ"],
    ],
  );
  assert.deepEqual(
    splitFooterItemsIntoColumns(usage.items).map((col) => col.map((i) => i.label)),
    [
      ["Privacy Policy", "Terms of Use", "Support"],
      ["Contact", "Status"],
    ],
  );
});

test("workspace Status outbound URLs include locale prefix", () => {
  assert.equal(workspaceStatusHomeUrl("en"), "http://localhost:8090/en/");
  assert.equal(workspaceStatusHomeUrl("ja"), "http://localhost:8090/ja/");
  assert.notEqual(workspaceStatusHomeUrl("ja"), publicStatusPageUrl());
});
