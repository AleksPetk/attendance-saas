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
} from "./accountNavigation.js";
import {
  AccountBillingPanel,
  AccountSubNav,
  AccountSubscriptionPanel,
  catalogPriceWithInterval,
  isBasicPaidCheckoutCandidate,
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
  trial_available: false,
  stripe_configured: true,
  actions: {
    can_checkout_plus: true,
    can_checkout_business: true,
    can_start_trial: false,
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

test("account section ids cover security subscription billing", () => {
  assert.deepEqual(ACCOUNT_SECTION_IDS, ["security", "subscription", "billing"]);
  assert.equal(ACCOUNT_SECTIONS.length, 3);
  assert.ok(isAccountSectionId("security"));
  assert.ok(isAccountSectionId("subscription"));
  assert.ok(isAccountSectionId("billing"));
  assert.equal(isAccountSectionId("settings"), false);
});

test("account section routes are absolute and stable", () => {
  assert.equal(accountSectionMeta("security").path, "/account/security");
  assert.equal(accountSectionMeta("subscription").path, "/account/subscription");
  assert.equal(accountSectionMeta("billing").path, "/account/billing");
});

test("account subnav renders all three sections", () => {
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/account/security"] },
      createElement(AccountSubNav),
    ),
  );
  assert.match(html, /account-subnav/);
  assert.match(html, /Security/);
  assert.match(html, /Subscription/);
  assert.match(html, /Billing/);
  assert.match(html, /href="\/account\/security"/);
  assert.match(html, /href="\/account\/subscription"/);
  assert.match(html, /href="\/account\/billing"/);
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
  assert.match(html, /Plan options/);
  assert.match(html, /data-plan="basic"/);
  assert.match(html, /data-plan="plus"/);
  assert.match(html, /data-plan="business"/);
  assert.match(html, /\$9\.99\/month/);
  assert.match(html, /\$14\.99\/month/);
  assert.match(html, /Choose Plus/);
  assert.match(html, /Choose Business/);
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
  assert.match(html, /data-plan="basic"[^>]*is-current|account-plan-option is-current[^>]*data-plan="basic"/);
  assert.match(html, /Current plan/);
  assert.equal((html.match(/Current plan/g) || []).length >= 2, true);
});

test("subscription monthly yearly toggle updates displayed catalog prices", () => {
  assert.equal(catalogPriceWithInterval(basicBilling, "plus", "monthly"), "$9.99/month");
  assert.equal(catalogPriceWithInterval(basicBilling, "plus", "yearly"), "$99.90/year");
  assert.equal(catalogPriceWithInterval(basicBilling, "business", "monthly"), "$14.99/month");
  assert.equal(catalogPriceWithInterval(basicBilling, "business", "yearly"), "$149.90/year");

  const monthly = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: { workspace: { entitlements: basicEntitlements } },
      billing: basicBilling,
      initialCheckoutInterval: "monthly",
    }),
  );
  assert.match(monthly, /Monthly/);
  assert.match(monthly, /Yearly/);
  assert.match(monthly, /\$9\.99\/month/);
  assert.match(monthly, /\$14\.99\/month/);
  assert.doesNotMatch(monthly, /\$99\.90\/year/);

  const yearly = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: { workspace: { entitlements: basicEntitlements } },
      billing: basicBilling,
      initialCheckoutInterval: "yearly",
    }),
  );
  assert.match(yearly, /\$99\.90\/year/);
  assert.match(yearly, /\$149\.90\/year/);
  assert.doesNotMatch(yearly, /\$9\.99\/month/);
});

test("subscription panel shows plans when Stripe is not configured", () => {
  const billing = {
    ...basicBilling,
    stripe_configured: false,
    trial_available: false,
    actions: {
      ...basicBilling.actions,
      can_checkout_plus: false,
      can_checkout_business: false,
      can_start_trial: false,
    },
  };
  assert.equal(isBasicPaidCheckoutCandidate(billing, "basic"), true);
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: { workspace: { entitlements: basicEntitlements } },
      billing,
    }),
  );
  assert.match(html, /Plan options/);
  assert.match(html, /\$9\.99\/month/);
  assert.match(html, /\$14\.99\/month/);
  assert.match(html, /Choose Plus/);
  assert.match(html, /Choose Business/);
  assert.match(html, /Stripe test billing is not configured yet/);
  assert.match(html, /disabled/);
  assert.doesNotMatch(html, /Start Business trial/);
  assert.doesNotMatch(html, /account-plan-tier-chip/);
});

test("subscription panel hides trial when unavailable", () => {
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: { workspace: { entitlements: basicEntitlements } },
      billing: {
        ...basicBilling,
        trial_available: false,
        actions: { ...basicBilling.actions, can_start_trial: false },
      },
    }),
  );
  assert.doesNotMatch(html, /Start Business trial/);
  assert.doesNotMatch(html, /\b7[- ]day\b/i);
  assert.doesNotMatch(html, /\b14[- ]day\b/i);
});

test("subscription panel shows trial only when backend allows it", () => {
  const html = renderToStaticMarkup(
    createElement(AccountSubscriptionPanel, {
      session: { workspace: { entitlements: basicEntitlements } },
      billing: {
        ...basicBilling,
        trial_available: true,
        actions: { ...basicBilling.actions, can_start_trial: true },
      },
    }),
  );
  assert.match(html, /Start Business trial/);
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
  assert.match(html, /data-plan="plus"/);
  assert.match(html, /Current plan/);
  assert.match(html, /Upgrade to Business today for \$2\.37/);
  assert.match(html, /Business renews at \$14\.99\/month/);
  assert.match(html, /Confirm upgrade/);
  assert.doesNotMatch(html, /Choose Plus/);
  assert.doesNotMatch(html, /Choose Business/);
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
    trial_available: false,
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
  assert.match(html, /Trial ends/);
  assert.match(html, /Resume subscription/);
  assert.doesNotMatch(html, /Schedule downgrade to Plus/);
  assert.doesNotMatch(html, /Choose Plus/);
  assert.doesNotMatch(html, /\b7[- ]day\b/i);
  assert.doesNotMatch(html, /\b14[- ]day\b/i);
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
  assert.match(withPortal, /Manage billing in Stripe/);
  assert.match(withPortal, /Customer Portal/);
  assert.doesNotMatch(withPortal, /Invoice #/);

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
  assert.doesNotMatch(apple, /Manage billing in Stripe/);
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

test("direct account section routes resolve through MemoryRouter", () => {
  function Probe() {
    return createElement(AccountSubNav);
  }
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/account/billing"] },
      createElement(
        Routes,
        null,
        createElement(Route, { path: "/account/:section", element: createElement(Probe) }),
      ),
    ),
  );
  assert.match(html, /href="\/account\/billing"/);
  assert.match(html, /is-active/);
});

test("public pricing source uses Basic Plus Business and removes Starter Pro", () => {
  const src = readSrc("PublicPricingScreen.jsx");
  assert.match(src, /Basic/);
  assert.match(src, /Plus/);
  assert.match(src, /Business/);
  assert.match(src, /\$9\.99/);
  assert.match(src, /\$14\.99/);
  assert.match(src, /\$99\.90/);
  assert.match(src, /\$149\.90/);
  assert.match(src, /Monthly/);
  assert.match(src, /Yearly/);
  assert.match(src, /Business trial available/);
  assert.match(src, /\/register/);
  assert.match(src, /\/account\/subscription/);
  assert.doesNotMatch(src, /Starter/);
  assert.doesNotMatch(src, /tier: "Pro"/);
  assert.doesNotMatch(src, /\b7[- ]day\b/i);
  assert.doesNotMatch(src, /\b14[- ]day\b/i);
});
