/**
 * Run: node --test src/accountNavigation.test.js src/publicPricing.test.js
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { test } from "node:test";

import {
  ACCOUNT_SECTION_IDS,
  ACCOUNT_SECTIONS,
  DEFAULT_ACCOUNT_SECTION,
  accountSectionMeta,
  isAccountSectionId,
  resolveAccountSection,
  visibleAccountSectionIds,
} from "./accountNavigation.js";
import {
  AccountBillingPanel,
  AccountSubNav,
  AccountSubscriptionPanel,
  DowngradeConfirmPanel,
  catalogPriceWithInterval,
  isBasicPaidCheckoutCandidate,
  scheduleChangePreviewCopy,
  scheduledChangeSummary,
  subscriptionAccessEndLabel,
} from "./accountPanels.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
function readSrc(name) {
  return readFileSync(join(__dirname, name), "utf8");
}

const basicEntitlements = {
  plan: { key: "basic", display_name: "Basic" },
  features: { staff_management: false },
  limits: {
    active_standard_groups: 2,
    active_structured_groups: 0,
    archived_groups: 2,
    members: 10,
    workspace_admins: 0,
    workspace_staff: 0,
  },
  usage: {
    active_standard_groups: 1,
    active_structured_groups: 0,
    archived_groups: 0,
    members: 7,
    workspace_admins: 0,
    workspace_staff: 0,
  },
  over_limit: [],
  is_over_limit: false,
};

const basicBilling = {
  effective_plan: { key: "basic", display_name: "Basic" },
  subscribed_plan: { key: null, display_name: null },
  purchase_source: "none",
  status: "none",
  interval: null,
  catalog: {
    currency: "usd",
    basic: { key: "basic", display_name: "Basic", formatted: "Free" },
    plans: {
      plus: {
        key: "plus",
        display_name: "Plus",
        intervals: {
          monthly: { interval: "monthly", cents: 999, formatted: "$9.99" },
          yearly: { interval: "yearly", cents: 9990, formatted: "$99.90" },
        },
      },
      business: {
        key: "business",
        display_name: "Business",
        intervals: {
          monthly: { interval: "monthly", cents: 1499, formatted: "$14.99" },
          yearly: { interval: "yearly", cents: 14990, formatted: "$149.90" },
        },
      },
    },
  },
  stripe_configured: true,
  actions: {
    can_checkout_plus: true,
    can_checkout_business: true,
    can_upgrade_to_business: false,
    can_schedule_downgrade_to_plus: false,
    can_cancel_scheduled_downgrade: false,
    can_cancel: false,
    can_resume_subscription: false,
    can_open_portal: false,
    can_change_interval: false,
  },
};

test("default account section is security", () => {
  assert.equal(DEFAULT_ACCOUNT_SECTION, "security");
  assert.equal(resolveAccountSection(undefined), "security");
  assert.equal(resolveAccountSection(""), "security");
  assert.equal(resolveAccountSection("unknown"), "security");
});

test("account section ids include the owner Tutorial and Status areas", () => {
  assert.deepEqual(ACCOUNT_SECTION_IDS, ["security", "subscription", "billing", "info", "tutorial", "status"]);
  assert.equal(ACCOUNT_SECTIONS.length, 6);
  assert.ok(isAccountSectionId("security"));
  assert.ok(isAccountSectionId("subscription"));
  assert.ok(isAccountSectionId("billing"));
  assert.ok(isAccountSectionId("info"));
  assert.ok(isAccountSectionId("tutorial"));
  assert.ok(isAccountSectionId("status"));
  assert.equal(isAccountSectionId("settings"), false);
});

test("account section routes are absolute and stable", () => {
  assert.equal(accountSectionMeta("security").path, "/account/security");
  assert.equal(accountSectionMeta("subscription").path, "/account/subscription");
  assert.equal(accountSectionMeta("billing").path, "/account/billing");
  assert.equal(accountSectionMeta("info").path, "/account/info");
  assert.equal(accountSectionMeta("tutorial").path, "/account/tutorial");
  assert.equal(accountSectionMeta("status").path, "/account/status");
});

test("account subnav renders all six sections for a billing-capable owner", () => {
  const session = {
    workspace: {
      capabilities: { can_view_billing: true, can_manage_subscription: true },
    },
  };
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/account/security"] },
      createElement(AccountSubNav, { session }),
    ),
  );
  assert.match(html, /account-subnav/);
  assert.match(html, /Security/);
  assert.match(html, /Subscription/);
  assert.match(html, /Billing/);
  assert.match(html, /Info/);
  assert.match(html, /Tutorial/);
  assert.match(html, /Status/);
  assert.match(html, /href="\/account\/security"/);
  assert.match(html, /href="\/account\/subscription"/);
  assert.match(html, /href="\/account\/billing"/);
  assert.match(html, /href="\/account\/info"/);
  assert.match(html, /href="\/account\/status"/);
  assert.match(html, /is-active/);
});

test("subscription panel shows plan option cards and catalog prices", () => {
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: { workspace: { entitlements: basicEntitlements } },
      billing: basicBilling,
    }),
  );
  assert.match(html, /Current plan/);
  assert.match(html, /Upgrade plan|Billing interval/);
  assert.match(html, /data-plan="plus"/);
  assert.match(html, /data-plan="business"/);
  assert.match(html, /\$9\.99/);
  assert.match(html, /\$14\.99/);
  assert.match(html, /Choose Plus Monthly|Choose Plus/);
  assert.match(html, /Choose Business Monthly|Choose Business/);
  assert.match(html, /1 \/ 2/);
  assert.match(html, /7 \/ 10/);
  assert.match(html, /Usage &amp; limits|Usage & limits/);
  assert.doesNotMatch(html, /account-plan-tier-chip/);
  assert.doesNotMatch(html, /Start Business trial/);
  assert.doesNotMatch(html, /Plan attention required/);
  assert.doesNotMatch(html, /Plan status/);
  assert.doesNotMatch(html, /Within limits/);
  assert.doesNotMatch(html, /Coming in the next implementation stage/);
  assert.doesNotMatch(html, /Starter/);
  assert.doesNotMatch(html, /Pro/);
  assert.doesNotMatch(html, /Successfully upgraded/i);
  assert.doesNotMatch(html, /Invoice #/);
});

test("subscription panel marks Basic as current plan", () => {
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: { workspace: { entitlements: basicEntitlements } },
      billing: basicBilling,
    }),
  );
  assert.match(html, /Effective plan/);
  assert.match(html, /Current plan/);
  assert.doesNotMatch(html, /account-plan-option is-current/);
  // Basic checkout cards must not show CURRENT PLAN badge
});

test("subscription basic upgrade shows monthly and yearly catalog prices", () => {
  assert.equal(catalogPriceWithInterval(basicBilling, "plus", "monthly"), "$9.99/month");
  assert.equal(catalogPriceWithInterval(basicBilling, "plus", "yearly"), "$99.90/year");
  assert.equal(catalogPriceWithInterval(basicBilling, "business", "monthly"), "$14.99/month");
  assert.equal(catalogPriceWithInterval(basicBilling, "business", "yearly"), "$149.90/year");

  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: { workspace: { entitlements: basicEntitlements } },
      billing: basicBilling,
    }),
  );
  assert.match(html, /Plus Monthly/);
  assert.match(html, /Plus Yearly/);
  assert.match(html, /Business Monthly/);
  assert.match(html, /Business Yearly/);
  assert.match(html, /\$9\.99/);
  assert.match(html, /\$99\.90/);
  assert.match(html, /\$14\.99/);
  assert.match(html, /\$149\.90/);
});

test("subscription panel shows plans when Stripe is not configured", () => {
  const billing = {
    ...basicBilling,
    stripe_configured: false,
    actions: {
      ...basicBilling.actions,
      can_checkout_plus: false,
      can_checkout_business: false,
    },
  };
  assert.equal(isBasicPaidCheckoutCandidate(billing, "basic"), true);
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: { workspace: { entitlements: basicEntitlements } },
      billing,
    }),
  );
  assert.match(html, /Upgrade plan|Billing interval/);
  assert.match(html, /\$9\.99/);
  assert.match(html, /\$14\.99/);
  assert.match(html, /Choose Plus Monthly|Choose Plus/);
  assert.match(html, /Choose Business Monthly|Choose Business/);
  assert.match(html, /Stripe test billing is not configured yet/);
  assert.match(html, /disabled/);
  assert.doesNotMatch(html, /Start Business trial/);
  assert.doesNotMatch(html, /account-plan-tier-chip/);
});

test("subscription panel hides the removed card-trial CTA", () => {
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: { workspace: { entitlements: basicEntitlements } },
      billing: basicBilling,
    }),
  );
  assert.doesNotMatch(html, /Start Business trial/);
});

test("subscription panel shows included Business trial when builtin trial is active", () => {
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: { workspace: { entitlements: basicEntitlements } },
      billing: {
        ...basicBilling,
        effective_plan: { key: "business", display_name: "Business" },
        builtin_trial: {
          active: true,
          granted: true,
          consumed: true,
          days: 7,
          ends_at: "2026-09-03T00:00:00Z",
        },
      },
    }),
  );
  assert.match(html, /7-day Business trial included/);
  assert.doesNotMatch(html, /Start Business trial/);
});

test("subscription panel shows upgrade preview copy from API value", () => {
  const billing = {
    ...basicBilling,
    effective_plan: { key: "plus", display_name: "Plus" },
    subscribed_plan: { key: "plus", display_name: "Plus" },
    purchase_source: "stripe",
    status: "active",
    interval: "monthly",
    current_period_end: "2026-09-01T00:00:00Z",
    actions: {
      ...basicBilling.actions,
      can_checkout_plus: false,
      can_checkout_business: false,
      can_upgrade_to_business: true,
      can_cancel: true,
      can_open_portal: true,
    },
  };
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: {
        workspace: {
          entitlements: {
            ...basicEntitlements,
            plan: { key: "plus", display_name: "Plus" },
          },
        },
      },
      billing,
      initialUpgradePreview: {
        amount_due_formatted: "$2.37",
        recurring_formatted: "$14.99",
        recurring_interval: "monthly",
        next_renewal_at: "2026-09-01T00:00:00Z",
      },
    }),
  );
  assert.match(html, /Effective plan/);
  assert.match(html, /Current plan/);
  assert.match(html, /Upgrade to Business today for \$2\.37/);
  assert.match(html, /Business renews at \$14\.99\/month/);
  assert.match(html, /Confirm upgrade/);
  assert.match(html, /id="account-upgrade-confirmation"/);
  assert.doesNotMatch(html, /Choose Plus/);
  assert.doesNotMatch(html, /Choose Business/);

  const planOptionsIndex = (html.includes("Upgrade plan") ? html.indexOf("Upgrade plan") : html.indexOf("Billing interval"));
  const upgradeIndex = html.indexOf("Upgrade to Business today");
  const usageIndex = html.indexOf("Usage &amp; limits");
  const planActionsIndex = html.indexOf("Plan actions");
  assert.ok(planOptionsIndex >= 0);
  assert.ok(upgradeIndex > planOptionsIndex);
  assert.ok(usageIndex > upgradeIndex);
  if (planActionsIndex >= 0) {
    const planActionsSection = html.slice(planActionsIndex);
    assert.doesNotMatch(planActionsSection, /Upgrade to Business today/);
    assert.doesNotMatch(planActionsSection, /account-upgrade-confirmation/);
  }
});

test("subscription panel shows upgrade preview loading below plan options", () => {
  const billing = {
    ...basicBilling,
    effective_plan: { key: "plus", display_name: "Plus" },
    subscribed_plan: { key: "plus", display_name: "Plus" },
    purchase_source: "stripe",
    status: "active",
    interval: "monthly",
    actions: {
      ...basicBilling.actions,
      can_checkout_plus: false,
      can_checkout_business: false,
      can_upgrade_to_business: true,
    },
  };
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: {
        workspace: {
          entitlements: {
            ...basicEntitlements,
            plan: { key: "plus", display_name: "Plus" },
          },
        },
      },
      billing,
      busyAction: "preview",
    }),
  );
  assert.match(html, /Loading upgrade preview/);
  const planOptionsIndex = (html.includes("Upgrade plan") ? html.indexOf("Upgrade plan") : html.indexOf("Billing interval"));
  const loadingIndex = html.indexOf("Loading upgrade preview");
  const usageIndex = html.indexOf("Usage &amp; limits");
  assert.ok(loadingIndex > planOptionsIndex);
  assert.ok(usageIndex > loadingIndex);
  assert.doesNotMatch(html, /Upgrade to Business<\/button>/);
});

test("subscription panel shows upgrade preview error below plan options", () => {
  const billing = {
    ...basicBilling,
    effective_plan: { key: "plus", display_name: "Plus" },
    subscribed_plan: { key: "plus", display_name: "Plus" },
    purchase_source: "stripe",
    status: "active",
    interval: "monthly",
    actions: {
      ...basicBilling.actions,
      can_checkout_plus: false,
      can_checkout_business: false,
      can_upgrade_to_business: true,
    },
  };
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: {
        workspace: {
          entitlements: {
            ...basicEntitlements,
            plan: { key: "plus", display_name: "Plus" },
          },
        },
      },
      billing,
      initialUpgradeError: "Stripe could not preview this upgrade.",
    }),
  );
  assert.match(html, /Stripe could not preview this upgrade\./);
  const planOptionsIndex = (html.includes("Upgrade plan") ? html.indexOf("Upgrade plan") : html.indexOf("Billing interval"));
  const errorIndex = html.indexOf("Stripe could not preview this upgrade");
  const usageIndex = html.indexOf("Usage &amp; limits");
  assert.ok(errorIndex > planOptionsIndex);
  assert.ok(usageIndex > errorIndex);
});

test("subscription panel shows downgrade confirmation below plan options", () => {
  const billing = {
    ...basicBilling,
    effective_plan: { key: "business", display_name: "Business" },
    subscribed_plan: { key: "business", display_name: "Business" },
    purchase_source: "stripe",
    status: "active",
    interval: "monthly",
    current_period_end: "2026-09-25T11:59:00.000Z",
    actions: {
      ...basicBilling.actions,
      can_checkout_plus: false,
      can_checkout_business: false,
      can_schedule_downgrade_to_plus: true,
      can_cancel: true,
    },
  };
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: {
        workspace: {
          entitlements: {
            ...basicEntitlements,
            plan: { key: "business", display_name: "Business" },
          },
        },
      },
      billing,
      initialConfirmDowngrade: true,
      initialDowngradeExpanded: true,
    }),
  );
  assert.match(html, /id="account-downgrade-confirmation"/);
  assert.match(html, /You will keep Business until/);
  assert.match(html, /Plus monthly begins on that date|Plus begins on that date/);
  assert.match(html, /Keep Business/);
  assert.match(html, /Confirm downgrade/);

  const usageIndex = html.indexOf("Usage &amp; limits");
  const downgradeIndex = html.indexOf("Downgrade plan");
  const confirmIndex = html.indexOf("account-downgrade-confirmation");
  const planActionsIndex = html.indexOf("Plan actions");
  assert.ok(downgradeIndex > usageIndex);
  assert.ok(confirmIndex > downgradeIndex);
  assert.equal((html.match(/account-downgrade-confirmation/g) || []).length, 1);
  assert.equal((html.match(/Confirm downgrade/g) || []).length, 1);
  if (planActionsIndex >= 0) {
    const planActionsSection = html.slice(planActionsIndex);
    assert.doesNotMatch(planActionsSection, /Confirm downgrade/);
    assert.doesNotMatch(planActionsSection, /account-downgrade-confirmation/);
    assert.doesNotMatch(planActionsSection, /Keep Business/);
  }
  const keepIndex = html.indexOf("Keep Business");
  const confirmBtnIndex = html.indexOf("Confirm downgrade");
  assert.ok(keepIndex > 0 && confirmBtnIndex > keepIndex);
});

test("subscription panel shows downgrade loading and error near plan options", () => {
  const billing = {
    ...basicBilling,
    effective_plan: { key: "business", display_name: "Business" },
    subscribed_plan: { key: "business", display_name: "Business" },
    purchase_source: "stripe",
    status: "active",
    interval: "monthly",
    current_period_end: "2026-09-25T11:59:00.000Z",
    actions: {
      ...basicBilling.actions,
      can_schedule_downgrade_to_plus: true,
    },
  };
  const session = {
    workspace: {
      entitlements: {
        ...basicEntitlements,
        plan: { key: "business", display_name: "Business" },
      },
    },
  };
  const loadingHtml = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session,
      billing,
      initialConfirmDowngrade: true,
      initialDowngradeExpanded: true,
      busyAction: "downgrade",
    }),
  );
  assert.match(loadingHtml, /Scheduling…/);
  assert.ok(loadingHtml.indexOf("Scheduling…") > loadingHtml.indexOf("Downgrade plan"));
  assert.ok(loadingHtml.indexOf("Scheduling…") > loadingHtml.indexOf("Usage &amp; limits"));

  const errorHtml = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session,
      billing,
      initialConfirmDowngrade: true,
      initialDowngradeExpanded: true,
      initialDowngradeError: "Could not schedule the downgrade.",
    }),
  );
  assert.match(errorHtml, /Could not schedule the downgrade\./);
  assert.ok(
    errorHtml.indexOf("Could not schedule the downgrade") > errorHtml.indexOf("Downgrade plan"),
  );
  assert.ok(
    errorHtml.indexOf("Could not schedule the downgrade") >
      errorHtml.indexOf("Usage &amp; limits"),
  );
});

test("downgrade confirm panel Keep Business and Confirm call through", async () => {
  let kept = false;
  let confirmed = false;
  const panel = createElement(DowngradeConfirmPanel, {
    billing: {
      ...basicBilling,
      current_period_end: "2026-09-25T11:59:00.000Z",
    },
    targetInterval: "yearly",
    onKeep: () => {
      kept = true;
    },
    onConfirm: async () => {
      confirmed = true;
    },
  });
  const html = renderToStaticMarkup(panel);
  assert.match(html, /Keep Business/);
  assert.match(html, /Confirm downgrade/);
  assert.match(html, /Plus yearly begins/);
  assert.match(html, /\$99\.90 per year/);
  assert.ok(html.indexOf("Keep Business") < html.indexOf("Confirm downgrade"));
  assert.equal(typeof panel.props.onKeep, "function");
  assert.equal(typeof panel.props.onConfirm, "function");
  panel.props.onKeep();
  await panel.props.onConfirm();
  assert.equal(kept, true);
  assert.equal(confirmed, true);
});

test("scheduled change summary for business yearly to plus yearly uses yearly price", () => {
  const billing = {
    ...basicBilling,
    effective_plan: { key: "business", display_name: "Business" },
    subscribed_plan: { key: "business", display_name: "Business" },
    interval: "yearly",
    pending_plan: "plus",
    pending_interval: "yearly",
    pending_change_effective_at: "2026-09-25T11:59:00.000Z",
    scheduled_change: { active: true, kind: "downgrade" },
  };
  const summary = scheduledChangeSummary(billing);
  assert.match(summary.lead, /Business yearly remains active/i);
  assert.match(summary.bullets.join(" "), /Plus yearly begins/i);
  assert.match(summary.bullets.join(" "), /\$99\.90 per year/);
  assert.doesNotMatch(summary.bullets.join(" "), /\$9\.99/);
  assert.doesNotMatch(summary.pendingLabel, /monthly/i);
});

test("subscription panel shows scheduled downgrade without conflicting checkout", () => {
  const billing = {
    ...basicBilling,
    effective_plan: { key: "business", display_name: "Business" },
    subscribed_plan: { key: "business", display_name: "Business" },
    purchase_source: "stripe",
    status: "active",
    interval: "monthly",
    pending_plan: "plus",
    pending_change_effective_at: "2026-09-15T00:00:00Z",
    actions: {
      ...basicBilling.actions,
      can_checkout_plus: false,
      can_checkout_business: false,
      can_schedule_downgrade_to_plus: false,
      can_cancel_scheduled_downgrade: true,
      can_cancel: true,
      can_resume_subscription: false,
    },
  };
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: {
        workspace: {
          entitlements: {
            ...basicEntitlements,
            plan: { key: "business", display_name: "Business" },
          },
        },
      },
      billing,
    }),
  );
  assert.match(html, /Downgrade scheduled/);
  assert.match(html, /Business remains active until/);
  assert.match(html, /Plus begins on/);
  assert.match(html, /Cancel downgrade/);
  assert.doesNotMatch(html, /Choose Plus/);
  assert.doesNotMatch(html, /Choose Business/);
  assert.doesNotMatch(html, /Schedule downgrade to Plus/);
  assert.doesNotMatch(html, /Resume subscription/);
});

test("subscription panel shows resume when cancellation is scheduled", () => {
  const billing = {
    ...basicBilling,
    effective_plan: { key: "plus", display_name: "Plus" },
    subscribed_plan: { key: "plus", display_name: "Plus" },
    purchase_source: "stripe",
    status: "active",
    interval: "monthly",
    cancel_at_period_end: true,
    pending_plan: "basic",
    pending_change_effective_at: "2026-09-30T00:00:00Z",
    current_period_end: "2026-09-30T00:00:00Z",
    actions: {
      ...basicBilling.actions,
      can_checkout_plus: false,
      can_checkout_business: false,
      can_cancel: false,
      can_resume_subscription: true,
      can_schedule_downgrade_to_plus: false,
      can_cancel_scheduled_downgrade: false,
    },
  };
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: {
        workspace: {
          entitlements: {
            ...basicEntitlements,
            plan: { key: "plus", display_name: "Plus" },
          },
        },
      },
      billing,
    }),
  );
  assert.match(html, /Cancellation scheduled/);
  assert.match(html, /Your current plan remains active until/);
  assert.match(html, /Resume subscription/);
  assert.doesNotMatch(html, />Canceled</);
  assert.doesNotMatch(html, /Cancel subscription/);
  assert.doesNotMatch(html, /Cancel downgrade/);
});

test("subscription panel hides Stripe resume for Apple source", () => {
  const billing = {
    ...basicBilling,
    effective_plan: { key: "plus", display_name: "Plus" },
    subscribed_plan: { key: "plus", display_name: "Plus" },
    purchase_source: "apple",
    status: "active",
    interval: "monthly",
    cancel_at_period_end: true,
    pending_change_effective_at: "2026-09-30T00:00:00Z",
    actions: {
      ...basicBilling.actions,
      can_checkout_plus: false,
      can_checkout_business: false,
      can_cancel: false,
      can_resume_subscription: false,
      can_cancel_scheduled_downgrade: false,
    },
  };
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: {
        workspace: {
          entitlements: {
            ...basicEntitlements,
            plan: { key: "plus", display_name: "Plus" },
          },
        },
      },
      billing,
    }),
  );
  assert.doesNotMatch(html, /Resume subscription/);
  assert.doesNotMatch(html, /Cancel downgrade/);
  assert.match(html, /Apple/);
});

test("subscription panel shows scheduled cancellation and trial without invented duration", () => {
  const billing = {
    ...basicBilling,
    effective_plan: { key: "business", display_name: "Business" },
    subscribed_plan: { key: "business", display_name: "Business" },
    purchase_source: "stripe",
    status: "trialing",
    interval: "monthly",
    trial_ends_at: "2026-09-10T00:00:00Z",
    cancel_at_period_end: true,
    pending_change_effective_at: "2026-09-10T00:00:00Z",
    actions: {
      ...basicBilling.actions,
      can_checkout_plus: false,
      can_checkout_business: false,
      can_cancel: false,
      can_resume_subscription: true,
    },
  };
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: {
        workspace: {
          entitlements: {
            ...basicEntitlements,
            plan: { key: "business", display_name: "Business" },
          },
        },
      },
      billing,
    }),
  );
  assert.match(html, /Cancellation scheduled/);
  assert.match(html, /Your current plan remains active until|Subscription ends|Access remains/);
  assert.match(html, /Paid plan starts/);
  assert.match(html, /Resume subscription/);
  assert.doesNotMatch(html, /Schedule downgrade to Plus/);
  assert.doesNotMatch(html, /Choose Plus/);
  assert.doesNotMatch(html, /\b7[- ]day\b/i);
  assert.doesNotMatch(html, /\b14[- ]day\b/i);
});

test("subscription cancellation confirmation panel shows structured copy and button order", () => {
  const billing = {
    ...basicBilling,
    effective_plan: { key: "plus", display_name: "Plus" },
    subscribed_plan: { key: "plus", display_name: "Plus" },
    purchase_source: "stripe",
    status: "active",
    interval: "monthly",
    current_period_end: "2026-09-25T11:59:00.000Z",
    actions: {
      ...basicBilling.actions,
      can_checkout_plus: false,
      can_checkout_business: false,
      can_cancel: true,
    },
  };
  const accessEnd = subscriptionAccessEndLabel(billing);
  assert.ok(accessEnd);
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: {
        workspace: {
          entitlements: {
            ...basicEntitlements,
            plan: { key: "plus", display_name: "Plus" },
          },
        },
      },
      billing,
      initialConfirmCancel: true,
    }),
  );
  assert.match(html, /account-cancel-confirm/);
  assert.match(html, /Cancel subscription\?/);
  assert.match(html, /Your current plan remains active until:/);
  assert.match(html, new RegExp(accessEnd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /After that:/);
  assert.match(html, /workspace moves to Basic/);
  assert.match(html, /data is preserved/);
  assert.match(html, /Basic limits apply/);
  assert.match(html, /account is not deleted/);
  assert.match(html, /btn-danger btn-sm/);
  assert.doesNotMatch(html, /Access remains until .* Then the workspace moves to Basic\. Data is preserved/);
  const keepIndex = html.indexOf("Keep subscription");
  const confirmIndex = html.indexOf("Confirm cancellation");
  assert.ok(keepIndex >= 0);
  assert.ok(confirmIndex >= 0);
  assert.ok(keepIndex < confirmIndex);
});

test("subscription cancellation confirmation uses trial end when trialing", () => {
  const billing = {
    ...basicBilling,
    effective_plan: { key: "business", display_name: "Business" },
    subscribed_plan: { key: "business", display_name: "Business" },
    purchase_source: "stripe",
    status: "trialing",
    interval: "monthly",
    trial_ends_at: "2026-10-10T08:30:00.000Z",
    current_period_end: "2026-09-01T00:00:00.000Z",
    actions: {
      ...basicBilling.actions,
      can_cancel: true,
    },
  };
  const accessEnd = subscriptionAccessEndLabel(billing);
  assert.ok(accessEnd);
  assert.notEqual(accessEnd, subscriptionAccessEndLabel({ current_period_end: billing.current_period_end }));
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: {
        workspace: {
          entitlements: {
            ...basicEntitlements,
            plan: { key: "business", display_name: "Business" },
          },
        },
      },
      billing,
      initialConfirmCancel: true,
    }),
  );
  assert.match(html, new RegExp(accessEnd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("subscription panel shows payment-grace warning", () => {
  const billing = {
    ...basicBilling,
    effective_plan: { key: "plus", display_name: "Plus" },
    subscribed_plan: { key: "plus", display_name: "Plus" },
    purchase_source: "stripe",
    status: "past_due",
    interval: "monthly",
    payment_issue: {
      active: true,
      started_at: "2026-08-20T00:00:00Z",
      grace_deadline: "2026-08-23T00:00:00Z",
    },
    actions: {
      ...basicBilling.actions,
      can_checkout_plus: false,
      can_checkout_business: false,
      can_open_portal: true,
      can_cancel: true,
      can_upgrade_to_business: true,
    },
  };
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(AccountSubscriptionPanel, {
        session: {
          workspace: {
            entitlements: {
              ...basicEntitlements,
              plan: { key: "plus", display_name: "Plus" },
            },
          },
        },
        billing,
      }),
    ),
  );
  assert.match(html, /Payment problem/);
  assert.match(html, /grace/);
  assert.match(html, /Upgrade to Business/);
  assert.doesNotMatch(html, /Choose Plus/);
  assert.doesNotMatch(html, /Effective plan<\/span><strong[^>]*>Basic/);
});

test("billing panel shows Stripe portal only when allowed", () => {
  const withPortal = renderToStaticMarkup(
    createElement(AccountBillingPanel, {
      billing: {
        ...basicBilling,
        purchase_source: "stripe",
        status: "active",
        actions: { ...basicBilling.actions, can_open_portal: true },
      },
    }),
  );
  assert.match(withPortal, /Open Stripe Billing Portal ↗/);
  assert.match(withPortal, /Recent invoices &amp; receipts|Recent invoices & receipts/);
  assert.match(withPortal, /No invoices or receipts yet\./);
  assert.doesNotMatch(withPortal, /Manage billing in Stripe/);

  const apple = renderToStaticMarkup(
    createElement(AccountBillingPanel, {
      billing: {
        ...basicBilling,
        purchase_source: "apple",
        status: "active",
        actions: { ...basicBilling.actions, can_open_portal: false },
      },
    }),
  );
  assert.match(apple, /managed in Apple/);
  assert.doesNotMatch(apple, /Open Stripe Billing Portal/);
  assert.doesNotMatch(apple, /Recent invoices/);
});

test("billing panel renders invoice rows with external links", () => {
  const html = renderToStaticMarkup(
    createElement(AccountBillingPanel, {
      billing: {
        ...basicBilling,
        purchase_source: "stripe",
        status: "active",
        actions: { ...basicBilling.actions, can_open_portal: true },
      },
      invoices: [
        {
          id: "in_test_1",
          created_at_formatted: "Sep 25, 2026",
          amount_formatted: "$9.99",
          currency: "usd",
          status: "paid",
          status_label: "Paid",
          description: "Plus (monthly)",
          hosted_url: "https://invoice.stripe.test/i/in_test_1",
        },
      ],
    }),
  );
  assert.match(html, /Sep 25, 2026/);
  assert.match(html, /\$9\.99/);
  assert.match(html, /Paid/);
  assert.match(html, /Plus \(monthly\)/);
  assert.match(html, /View invoice \/ receipt ↗/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /View all in Stripe ↗/);
});

test("subscription panel offers interval switch for active plus monthly", () => {
  const billing = {
    ...basicBilling,
    effective_plan: { key: "plus", display_name: "Plus" },
    subscribed_plan: { key: "plus", display_name: "Plus" },
    purchase_source: "stripe",
    status: "active",
    interval: "monthly",
    current_period_end: "2026-09-25T11:59:00.000Z",
    actions: {
      ...basicBilling.actions,
      can_checkout_plus: false,
      can_checkout_business: false,
      can_change_interval: true,
      can_schedule_billing_change: true,
      can_upgrade_to_business: true,
    },
  };
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: {
        workspace: {
          entitlements: {
            ...basicEntitlements,
            plan: { key: "plus", display_name: "Plus" },
          },
        },
      },
      billing,
      initialCheckoutInterval: "yearly",
    }),
  );
  assert.match(html, /Switch to Yearly Billing|Upgrade to Plus Yearly/);
  assert.match(html, /Upgrade to Business Yearly|Schedule Business yearly/);
  assert.match(html, /Upgrade to Business/);
});

test("subscription panel shows scheduled interval change panel", () => {
  const billing = {
    ...basicBilling,
    effective_plan: { key: "plus", display_name: "Plus" },
    subscribed_plan: { key: "plus", display_name: "Plus" },
    purchase_source: "stripe",
    status: "active",
    interval: "monthly",
    pending_plan: "plus",
    pending_interval: "yearly",
    pending_change_effective_at: "2026-09-25T11:59:00.000Z",
    scheduled_change: { active: true, kind: "interval" },
    actions: {
      ...basicBilling.actions,
      can_cancel_scheduled_change: true,
      can_change_interval: false,
      can_upgrade_to_business: false,
    },
  };
  const summary = scheduledChangeSummary(billing);
  assert.ok(summary);
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: {
        workspace: {
          entitlements: {
            ...basicEntitlements,
            plan: { key: "plus", display_name: "Plus" },
          },
        },
      },
      billing,
    }),
  );
  assert.match(html, /Cancel scheduled change/);
  assert.match(html, /Plus yearly begins|Begins /i);
  assert.match(html, /Plus monthly remains active/i);
});

test("schedule change preview copy explains period-end timing", () => {
  const billing = {
    ...basicBilling,
    effective_plan: { key: "plus", display_name: "Plus" },
    subscribed_plan: { key: "plus", display_name: "Plus" },
    interval: "monthly",
    current_period_end: "2026-09-25T11:59:00.000Z",
  };
  const copy = scheduleChangePreviewCopy(billing, "business", "yearly");
  assert.match(copy.title, /Upgrade to Business Yearly/i);
  assert.match(copy.lead, /remains active until/i);
  assert.match(copy.bullets.join(" "), /Business yearly begins/i);
  assert.match(copy.bullets.join(" "), /\$149\.90/);
});

test("billing panel hides Stripe invoice controls for non-Stripe source", () => {
  const html = renderToStaticMarkup(
    createElement(AccountBillingPanel, {
      billing: {
        ...basicBilling,
        purchase_source: "none",
        actions: { ...basicBilling.actions, can_open_portal: false },
      },
    }),
  );
  assert.doesNotMatch(html, /Recent invoices/);
  assert.doesNotMatch(html, /Open Stripe Billing Portal/);
  assert.doesNotMatch(html, /View invoice/);
});

test("billing panel shows invoice error without navigation markup", () => {
  const html = renderToStaticMarkup(
    createElement(AccountBillingPanel, {
      billing: {
        ...basicBilling,
        purchase_source: "stripe",
        actions: { ...basicBilling.actions, can_open_portal: true },
      },
      invoicesError: "Stripe invoices could not be retrieved.",
    }),
  );
  assert.match(html, /Stripe invoices could not be retrieved\./);
  assert.doesNotMatch(html, /window\.location/);
});

test("subscription panel hides Stripe interval controls for Apple source", () => {
  const billing = {
    ...basicBilling,
    effective_plan: { key: "plus", display_name: "Plus" },
    subscribed_plan: { key: "plus", display_name: "Plus" },
    purchase_source: "apple",
    status: "active",
    interval: "monthly",
    actions: {
      ...basicBilling.actions,
      can_change_interval: false,
      can_schedule_billing_change: false,
    },
  };
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: {
        workspace: {
          entitlements: {
            ...basicEntitlements,
            plan: { key: "plus", display_name: "Plus" },
          },
        },
      },
      billing,
      initialCheckoutInterval: "yearly",
    }),
  );
  assert.doesNotMatch(html, /Switch to yearly billing/);
  assert.doesNotMatch(html, /Schedule Business yearly/);
});

test("checkout confirming banner does not claim fake success", () => {
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: { workspace: { entitlements: basicEntitlements } },
      billing: basicBilling,
      confirmingCheckout: true,
    }),
  );
  assert.match(html, /Confirming subscription/);
  assert.doesNotMatch(html, /Payment successful/i);
});

test("subscription panel shows over-capacity in Usage & limits without raw keys", () => {
  const entitlements = {
    plan: { key: "plus", display_name: "Plus" },
    features: { staff_management: true },
    limits: {
      active_standard_groups: 10,
      active_structured_groups: 0,
      archived_groups: 10,
      members: 50,
      workspace_admins: 2,
      workspace_staff: 5,
    },
    usage: {
      active_standard_groups: 20,
      active_structured_groups: 0,
      archived_groups: 0,
      members: 12,
      workspace_admins: 1,
      workspace_staff: 2,
    },
    over_limit: [
      {
        resource: "active_standard_groups",
        usage: 20,
        limit: 10,
        over_by: 10,
      },
    ],
    is_over_limit: true,
  };
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: { workspace: { entitlements } },
      billing: {
        ...basicBilling,
        effective_plan: { key: "plus", display_name: "Plus" },
        actions: {
          ...basicBilling.actions,
          can_checkout_plus: false,
          can_checkout_business: false,
        },
      },
    }),
  );
  assert.match(html, /Plus/);
  assert.match(html, /Usage &amp; limits|Usage & limits/);
  assert.match(html, /20 \/ 10/);
  assert.doesNotMatch(html, /Plan status/);
  assert.doesNotMatch(html, /Over limit/);
  assert.doesNotMatch(html, /active_standard_groups/);
  assert.doesNotMatch(html, /over by 10/);
});

test("subscription panel summarizes plan locks without attention actions", () => {
  const entitlements = {
    plan: { key: "basic", display_name: "Basic" },
    features: { staff_management: false },
    limits: {
      active_standard_groups: 2,
      active_structured_groups: 0,
      archived_groups: 2,
      members: 10,
      workspace_admins: 0,
      workspace_staff: 0,
    },
    usage: {
      active_standard_groups: 2,
      active_structured_groups: 0,
      archived_groups: 2,
      members: 4,
      workspace_admins: 0,
      workspace_staff: 0,
    },
    usage_totals: {
      active_standard_groups: 18,
      active_structured_groups: 1,
      archived_groups: 3,
      members: 4,
      workspace_admins: 1,
      workspace_staff: 2,
    },
    selection_required: {
      active_standard_groups: true,
      archived_groups: true,
      members: true,
      workspace_admins: true,
      workspace_staff: true,
    },
    plan_locks: {
      locked_counts: {
        active_standard_groups: 16,
        archived_groups: 1,
        members: 0,
        workspace_admins: 1,
        workspace_staff: 2,
      },
      structured_locked_count: 1,
    },
    over_limit: [],
    is_over_limit: true,
  };
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: { workspace: { entitlements } },
      billing: basicBilling,
    }),
  );
  assert.match(html, /Usage &amp; limits|Usage & limits/);
  assert.match(html, /Groups/);
  assert.match(html, /18 records · 2 available · 16 plan locked/);
  assert.match(html, /Limit: 2/);
  assert.match(html, /Structured Groups/);
  assert.match(html, /1 record · 0 available · 1 plan locked/);
  assert.match(html, /Limit: 0/);
  assert.match(html, /Workspace Admins/);
  assert.match(html, /1 record · 0 available · 1 plan locked/);
  assert.match(html, /Workspace Staff/);
  assert.match(html, /2 records · 0 available · 2 plan locked/);
  assert.match(html, /Members/);
  assert.match(html, /4 \/ 10/);
  assert.doesNotMatch(html, /Plan attention required/);
  assert.doesNotMatch(html, /Choose available Groups/);
  assert.doesNotMatch(html, /Choose available Admins/);
  assert.doesNotMatch(html, /Choose available Staff/);
  assert.doesNotMatch(html, /Choose available Members/);
  assert.doesNotMatch(html, /View Groups/);
  assert.doesNotMatch(html, /active_standard_groups/);
  assert.doesNotMatch(html, /href="\/groups"/);
  assert.doesNotMatch(html, /href="\/staff"/);
  assert.doesNotMatch(html, /href="\/members"/);
});

test("direct Info account route resolves through MemoryRouter", () => {
  const session = {
    workspace: {
      capabilities: { can_view_billing: true, can_manage_subscription: true },
    },
  };
  function Probe() {
    return createElement(AccountSubNav, { session });
  }
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/account/info"] },
      createElement(
        Routes,
        null,
        createElement(Route, { path: "/account/:section", element: createElement(Probe) }),
      ),
    ),
  );
  assert.match(html, /href="\/account\/info"/);
  assert.match(html, /is-active/);
});

test("direct Tutorial route is registered for owners and Account remains owner-gated", () => {
  const session = {
    workspace: {
      capabilities: {
        can_manage_owner_account: true,
        can_view_billing: true,
        can_manage_subscription: true,
      },
    },
  };
  assert.equal(resolveAccountSection("tutorial", session), "tutorial");
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/account/tutorial"] },
      createElement(AccountSubNav, { session }),
    ),
  );
  assert.match(html, /href="\/account\/tutorial"/);
  assert.match(html, /is-active/);
  assert.match(readSrc("App.jsx"), /canManageOwnerAccount\(session\)[\s\S]*?<AccountScreen/);
});

test("direct Status route resolves inside owner Account navigation", () => {
  const session = {
    workspace: {
      capabilities: {
        can_manage_owner_account: true,
        can_view_billing: true,
        can_manage_subscription: true,
      },
    },
  };
  assert.equal(resolveAccountSection("status", session), "status");
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/account/status"] },
      createElement(AccountSubNav, { session }),
    ),
  );
  assert.match(html, /href="\/account\/status"/);
  assert.match(html, /is-active/);
});

test("CheckStation-managed account hides billing sections but keeps Info, Tutorial, and Status", () => {
  const session = {
    workspace: {
      capabilities: { can_view_billing: false, can_manage_subscription: false },
    },
  };
  assert.deepEqual(visibleAccountSectionIds(session), ["security", "info", "tutorial", "status"]);
  assert.equal(isAccountSectionId("subscription", session), false);
  assert.equal(resolveAccountSection("billing", session), "security");
  assert.equal(isAccountSectionId("info", session), true);
  assert.equal(resolveAccountSection("info", session), "info");
  assert.equal(isAccountSectionId("tutorial", session), true);
  assert.equal(resolveAccountSection("tutorial", session), "tutorial");
  assert.equal(isAccountSectionId("status", session), true);
  assert.equal(resolveAccountSection("status", session), "status");
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/account/security"] },
      createElement(AccountSubNav, { session }),
    ),
  );
  assert.match(html, /Security/);
  assert.match(html, /Info/);
  assert.match(html, /Tutorial/);
  assert.match(html, /Status/);
  assert.doesNotMatch(html, /Subscription/);
  assert.doesNotMatch(html, /Billing/);
});

test("public pricing source uses Basic Plus Business and removes Starter Pro", () => {
  const src = `${readSrc("PublicPricingScreen.jsx")}\n${readSrc("pricingPage.js")}`;
  assert.match(src, /Basic/);
  assert.match(src, /Plus/);
  assert.match(src, /Business/);
  assert.match(src, /\$9\.99/);
  assert.match(src, /\$14\.99/);
  assert.match(src, /\$99\.90/);
  assert.match(src, /\$149\.90/);
  assert.match(src, /Monthly/);
  assert.match(src, /Yearly/);
  assert.match(src, /Simple plans for every workspace/);
  assert.match(src, /Get Started Free/);
  assert.match(src, /Choose Plus/);
  assert.match(src, /Go Business/);
  assert.match(src, /\/register/);
  assert.match(src, /\/account\/subscription/);
  assert.doesNotMatch(src, /\bV1\b/);
  assert.doesNotMatch(src, /Paid checkout starts after you create a workspace/);
  assert.doesNotMatch(src, /anonymous paid workspaces/);
  assert.doesNotMatch(src, /Choose in Account/);
  assert.doesNotMatch(src, /7-day Business trial/);
  assert.doesNotMatch(src, /Higher Group \/ Member limits/);
  assert.doesNotMatch(src, /More Admin and Staff seats/);
  assert.doesNotMatch(src, /Starter/);
  assert.doesNotMatch(src, /tier: "Pro"/);
  assert.doesNotMatch(src, /Start Business trial/);
  assert.doesNotMatch(src, /\b14[- ]day\b/i);
});
