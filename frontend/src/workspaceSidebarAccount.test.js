import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";

import { sidebarEffectivePlan, SidebarAccountChip } from "./workspaceSidebarAccount.js";

function sessionWithPlan(planKey, planLabel, extras = {}) {
  return {
    workspace: {
      account_kind: extras.accountKind || "owner",
      role: extras.role || "owner",
      identity: extras.identity || "owner@example.com",
      entitlements: {
        plan: { key: planKey, display_name: planLabel },
        features: {},
        limits: {},
      },
      builtin_trial: extras.builtinTrial || null,
      billing: extras.billing || null,
    },
  };
}

function renderChip(session) {
  return renderToStaticMarkup(createElement(SidebarAccountChip, { session }));
}

test("sidebar effective plan uses workspace entitlements, not billing status", () => {
  const session = sessionWithPlan("business", "Business", {
    billing: { status: "trialing", cancel_at_period_end: true },
    builtinTrial: { active: true },
  });
  assert.deepEqual(sidebarEffectivePlan(session), { key: "business", label: "Business" });
});

test("Basic plan badge renders with neutral styling", () => {
  const html = renderChip(sessionWithPlan("basic", "Basic"));
  assert.match(html, /account-role-label[^>]*>Owner</);
  assert.match(html, /sidebar-plan-badge is-basic[^>]*>Basic</);
});

test("Plus plan badge renders with plus styling", () => {
  const html = renderChip(sessionWithPlan("plus", "Plus"));
  assert.match(html, /sidebar-plan-badge is-plus[^>]*>Plus</);
});

test("Business plan badge renders with business styling", () => {
  const html = renderChip(sessionWithPlan("business", "Business"));
  assert.match(html, /sidebar-plan-badge is-business[^>]*>Business</);
});

test("Business trial entitlement displays Business without trial wording", () => {
  const html = renderChip(sessionWithPlan("business", "Business", {
    builtinTrial: { active: true },
    billing: { status: "trialing" },
  }));
  assert.match(html, /sidebar-plan-badge is-business[^>]*>Business</);
  assert.doesNotMatch(html, /Trial|Active|Cancel/i);
});

test("admin and staff show the same workspace effective plan badge", () => {
  const entitlements = {
    plan: { key: "plus", display_name: "Plus" },
    features: {},
    limits: {},
  };
  const adminHtml = renderChip({
    workspace: {
      account_kind: "workspace_staff",
      role: "admin",
      identity: "admin.user",
      entitlements,
    },
  });
  const staffHtml = renderChip({
    workspace: {
      account_kind: "workspace_staff",
      role: "staff",
      identity: "staff.user",
      entitlements,
    },
  });
  assert.match(adminHtml, /account-role-label[^>]*>Admin</);
  assert.match(staffHtml, /account-role-label[^>]*>Staff</);
  assert.match(adminHtml, /sidebar-plan-badge is-plus[^>]*>Plus</);
  assert.match(staffHtml, /sidebar-plan-badge is-plus[^>]*>Plus</);
});

test("long workspace identity keeps truncation-friendly email styling", () => {
  const html = renderChip(sessionWithPlan("basic", "Basic", {
    identity: "very.long.workspace.identity.address@customer-company.example.com",
  }));
  assert.match(html, /class="account-email"/);
  assert.match(html, /very\.long\.workspace\.identity\.address@customer-company\.example\.com/);
  const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
  assert.match(css, /\.account-email[\s\S]*word-break:\s*break-word/);
});

test("sidebar layout dimensions remain unchanged", () => {
  const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
  assert.match(css, /grid-template-columns:\s*260px minmax\(0,\s*1fr\)/);
  const sidebarAccountBlock = css.match(/^\.sidebar-account\s*\{[^}]+\}/m)?.[0] || "";
  assert.match(sidebarAccountBlock, /margin-top:\s*auto/);
  assert.match(sidebarAccountBlock, /padding-top:\s*var\(--space-4\)/);
  assert.doesNotMatch(sidebarAccountBlock, /min-height/);
  const layoutSource = readFileSync(new URL("./WorkspaceLayout.jsx", import.meta.url), "utf8");
  assert.match(layoutSource, /SidebarAccountChip/);
  assert.doesNotMatch(layoutSource, /account-role"/);
});
