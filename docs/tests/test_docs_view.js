import assert from "node:assert/strict";
import { test } from "node:test";

import {
  groupDocuments,
  hrefForDocument,
  slugFromPath,
} from "../static/docs-view.js";

test("home paths map to the documentation document", () => {
  assert.equal(slugFromPath("/"), "documentation");
  assert.equal(slugFromPath("/documentation"), "documentation");
  assert.equal(slugFromPath("/privacy-policy"), "privacy-policy");
  assert.equal(slugFromPath("/terms-of-use"), "terms-of-use");
  assert.equal(slugFromPath("/getting-started"), "getting-started");
  assert.equal(slugFromPath("/groups-members"), "groups-members");
  assert.equal(slugFromPath("/kiosk-setup"), "kiosk-setup");
  assert.equal(slugFromPath("/billing-plans"), "billing-plans");
  assert.equal(slugFromPath("/faq"), "faq");
  assert.equal(slugFromPath("/support"), "support");
});

test("home document links to Docs root, not an article path", () => {
  assert.equal(hrefForDocument({ slug: "documentation", nav_group: "home" }), "/");
  assert.equal(hrefForDocument({ slug: "getting-started" }), "/getting-started");
  assert.equal(hrefForDocument({ slug: "groups-members" }), "/groups-members");
  assert.equal(hrefForDocument({ slug: "kiosk-setup" }), "/kiosk-setup");
  assert.equal(hrefForDocument({ slug: "billing-plans" }), "/billing-plans");
  assert.equal(hrefForDocument({ slug: "faq" }), "/faq");
  assert.equal(hrefForDocument({ slug: "support" }), "/support");
  assert.equal(hrefForDocument({ slug: "privacy-policy" }), "/privacy-policy");
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
