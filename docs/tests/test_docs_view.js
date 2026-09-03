import assert from "node:assert/strict";
import { test } from "node:test";

import {
  groupDocuments,
  hrefForDocument,
  localeFromPath,
  slugFromPath,
} from "../static/docs-view.js";

test("home paths map to the documentation document", () => {
  assert.equal(slugFromPath("/"), "documentation");
  assert.equal(slugFromPath("/documentation"), "documentation");
  assert.equal(slugFromPath("/en/"), "documentation");
  assert.equal(slugFromPath("/ja/"), "documentation");
  assert.equal(slugFromPath("/en/documentation"), "documentation");
  assert.equal(slugFromPath("/privacy-policy"), "privacy-policy");
  assert.equal(slugFromPath("/en/privacy-policy"), "privacy-policy");
  assert.equal(slugFromPath("/ja/terms-of-use"), "terms-of-use");
  assert.equal(slugFromPath("/en/getting-started"), "getting-started");
  assert.equal(slugFromPath("/ja/groups-members"), "groups-members");
  assert.equal(slugFromPath("/en/kiosk-setup"), "kiosk-setup");
  assert.equal(slugFromPath("/ja/billing-plans"), "billing-plans");
  assert.equal(slugFromPath("/en/faq"), "faq");
  assert.equal(slugFromPath("/ja/support"), "support");
});

test("localeFromPath reads locale prefixes", () => {
  assert.equal(localeFromPath("/en/"), "en");
  assert.equal(localeFromPath("/ja/getting-started"), "ja");
  assert.equal(localeFromPath("/getting-started"), null);
  assert.equal(localeFromPath("/"), null);
});

test("home document links include locale prefix", () => {
  assert.equal(
    hrefForDocument({ slug: "documentation", nav_group: "home" }, "en"),
    "/en/",
  );
  assert.equal(
    hrefForDocument({ slug: "documentation", nav_group: "home" }, "ja"),
    "/ja/",
  );
  assert.equal(hrefForDocument({ slug: "getting-started" }, "en"), "/en/getting-started");
  assert.equal(hrefForDocument({ slug: "groups-members" }, "ja"), "/ja/groups-members");
  assert.equal(hrefForDocument({ slug: "kiosk-setup" }, "en"), "/en/kiosk-setup");
  assert.equal(hrefForDocument({ slug: "billing-plans" }, "ja"), "/ja/billing-plans");
  assert.equal(hrefForDocument({ slug: "faq" }, "en"), "/en/faq");
  assert.equal(hrefForDocument({ slug: "support" }, "ja"), "/ja/support");
  assert.equal(hrefForDocument({ slug: "privacy-policy" }, "en"), "/en/privacy-policy");
});

test("nav groups omit empty future sections", () => {
  const groups = groupDocuments([
    {
      slug: "documentation",
      title: "Documentation",
      nav_group: "home",
      nav_group_label: "Documentation",
      sort_order: 0,
    },
    {
      slug: "getting-started",
      title: "Getting Started with CheckStation",
      nav_group: "getting_started",
      nav_group_label: "Getting Started",
      sort_order: 10,
    },
    {
      slug: "groups-members",
      title: "Groups & Members",
      nav_group: "using",
      nav_group_label: "Using CheckStation",
      sort_order: 10,
    },
    {
      slug: "kiosk-setup",
      title: "Kiosk Setup",
      nav_group: "using",
      nav_group_label: "Using CheckStation",
      sort_order: 20,
    },
    {
      slug: "billing-plans",
      title: "Billing & Plans",
      nav_group: "using",
      nav_group_label: "Using CheckStation",
      sort_order: 30,
    },
    {
      slug: "support",
      title: "Support",
      nav_group: "help",
      nav_group_label: "Help",
      sort_order: 5,
    },
    {
      slug: "faq",
      title: "FAQ",
      nav_group: "help",
      nav_group_label: "Help",
      sort_order: 10,
    },
    {
      slug: "privacy-policy",
      title: "Privacy Policy",
      nav_group: "legal",
      nav_group_label: "Legal",
      sort_order: 10,
    },
    {
      slug: "terms-of-use",
      title: "Terms of Use",
      nav_group: "legal",
      nav_group_label: "Legal",
      sort_order: 20,
    },
  ]);
  assert.deepEqual(
    groups.map((group) => [group.id, group.items.map((item) => item.slug)]),
    [
      ["home", ["documentation"]],
      ["getting_started", ["getting-started"]],
      ["using", ["groups-members", "kiosk-setup", "billing-plans"]],
      ["help", ["support", "faq"]],
      ["legal", ["privacy-policy", "terms-of-use"]],
    ],
  );
});
