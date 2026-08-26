import { createElement } from "react";
import { NavLink } from "react-router-dom";
import { ACCOUNT_SECTIONS } from "./accountNavigation.js";
import { externalLinkProps } from "./billingExternalLinks.js";
import { promotionPriceNote } from "./promotionCatalog.js";
import {
  catalogListPriceWithInterval,
  planDisplayName,
  targetOfferPricing,
} from "./subscriptionPlanOptions.js";

export function AccountSubNav() {
  return createElement(
    "nav",
    { className: "account-subnav", "aria-label": "Account sections" },
    ACCOUNT_SECTIONS.map((section) =>
      createElement(
        NavLink,
        {
          key: section.id,
          to: section.path,
          end: true,
          className: ({ isActive }) =>
            isActive ? "account-subnav-link is-active" : "account-subnav-link",
        },
        section.label,
      ),
    ),
  );
}

function PanelBlock({ title, description, children }) {
  return createElement(
    "section",
    { className: "account-panel-block" },
    createElement(
      "header",
      { className: "account-panel-block-header" },
      createElement("h3", null, title),
      description ? createElement("p", null, description) : null,
    ),
    children,
  );
}

function formatWhen(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function formatWhenDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function MetaPairs(pairs) {
  const children = [];
  for (const [label, value] of pairs) {
    if (value == null || value === false) continue;
    children.push(createElement("dt", { key: `dt-${label}` }, label));
    children.push(createElement("dd", { key: `dd-${label}` }, value));
  }
  if (!children.length) return null;
  return createElement("dl", { className: "account-billing-meta" }, children);
}

export function catalogPrice(billing, planKey, interval) {
  return billing?.catalog?.plans?.[planKey]?.intervals?.[interval]?.formatted || null;
}

export function catalogPriceWithInterval(billing, planKey, interval) {
  return catalogListPriceWithInterval(billing, planKey, interval);
}

/** Display price for plan cards — prefers API first-period promo amount when active. */
export function catalogOfferPriceWithInterval(billing, planKey, interval) {
  const pricing = targetOfferPricing(billing, planKey, interval);
  return pricing.firstPeriodWithInterval || catalogPriceWithInterval(billing, planKey, interval);
}

export function catalogOfferPriceNote(billing, planKey, interval) {
  return promotionPriceNote(billing?.catalog, planKey, interval);
}

export function scheduledChangeSummary(billing) {
  if (!billing?.scheduled_change?.active) return null;
  const effectiveAt = formatWhenDate(billing.pending_change_effective_at);
  const targetPlan = billing.pending_plan || billing.subscribed_plan?.key;
  const targetInterval = billing.pending_interval || billing.interval;
  const currentPlan = billing.subscribed_plan?.key || billing.effective_plan?.key;
  const currentInterval = billing.interval;
  const targetPlanName = planDisplayName(billing, targetPlan);
  const currentPlanName =
    billing.subscribed_plan?.display_name || billing.effective_plan?.display_name || "Current plan";
  const pricing = targetOfferPricing(billing, targetPlan, targetInterval);
  const kind = billing.scheduled_change?.kind;
  const chargeLines = pricing.promotional
    ? [
        `First ${targetInterval === "yearly" ? "year" : "period"}: ${pricing.firstPeriodFormatted}.`,
        `Future renewals: ${pricing.renewsAtWithInterval?.replace("/", " per ") || pricing.listWithInterval}.`,
      ]
    : [
        pricing.listWithInterval
          ? `You will be charged ${pricing.listWithInterval.replace("/", " per ")} then.`
          : null,
      ];
  if (kind === "interval") {
    return {
      title: `Switch to ${targetInterval === "yearly" ? "yearly" : "monthly"} billing`,
      lead: `${currentPlanName} ${currentInterval} remains active until ${effectiveAt || "period end"}.`,
      bullets: [
        `${targetInterval === "yearly" ? "Yearly" : "Monthly"} billing begins on ${effectiveAt || "period end"}.`,
        ...chargeLines,
        "Your new billing period starts on that date.",
      ].filter(Boolean),
      pendingLabel: `${currentPlanName} ${currentInterval} remains active until ${effectiveAt || "period end"}. ${targetPlanName} ${targetInterval} begins ${effectiveAt || "then"}.`,
      targetPlan,
      targetInterval,
      effectiveAt,
    };
  }
  return {
    title: "Scheduled change",
    lead: `${currentPlanName} ${currentInterval} remains active until ${effectiveAt || "period end"}.`,
    bullets: [
      `${targetPlanName} ${targetInterval} begins on ${effectiveAt || "period end"}.`,
      ...chargeLines,
      "No change happens before that date.",
    ].filter(Boolean),
    pendingLabel: `${targetPlanName} ${targetInterval} begins ${effectiveAt || "on the scheduled date"}. Until then, ${currentPlanName} ${currentInterval} remains active.`,
    targetPlan,
    targetInterval,
    effectiveAt,
  };
}

export function scheduleChangePreviewCopy(billing, planKey, interval) {
  const effectiveAt = formatWhenDate(billing?.current_period_end || billing?.trial_ends_at);
  const currentPlan = billing?.subscribed_plan?.key || billing?.effective_plan?.key;
  const currentInterval = billing?.interval;
  const currentPlanName =
    billing?.subscribed_plan?.display_name || billing?.effective_plan?.display_name || "Current plan";
  const targetPlanName = planDisplayName(billing, planKey);
  const pricing = targetOfferPricing(billing, planKey, interval);
  const intervalOnly = planKey === currentPlan && interval !== currentInterval;
  const title = intervalOnly
    ? interval === "yearly"
      ? "Switch to Yearly Billing"
      : "Switch to Monthly Billing"
    : planKey === "business" && interval === "yearly"
      ? "Upgrade to Business Yearly"
      : planKey === "plus" && interval === "yearly"
        ? "Upgrade to Plus Yearly"
        : `Switch to ${targetPlanName} ${interval === "yearly" ? "Yearly" : "Monthly"}`;
  const lead = `Your ${currentPlanName} ${currentInterval} plan remains active until ${effectiveAt || "period end"}.`;
  const chargeBullets = pricing.promotional
    ? [
        `First ${interval === "yearly" ? "year" : "period"}: ${pricing.firstPeriodFormatted}.`,
        `Future renewals: ${pricing.renewsAtWithInterval?.replace("/", " per ") || pricing.listWithInterval}.`,
      ]
    : [
        pricing.listWithInterval
          ? `You will be charged ${pricing.listWithInterval.replace("/", " per ")}.`
          : null,
      ];
  const bullets = intervalOnly
    ? [
        `On ${effectiveAt || "period end"}, ${interval === "yearly" ? "yearly" : "monthly"} billing begins.`,
        ...chargeBullets,
        "Your new billing period starts then.",
      ]
    : [
        `On ${effectiveAt || "period end"}, ${targetPlanName} ${interval} begins.`,
        ...chargeBullets,
        `${currentPlanName} ${currentInterval} stays active until then.`,
      ];
  return {
    title,
    lead,
    bullets: bullets.filter(Boolean),
  };
}

/** Basic workspace that may start a paid checkout (Stripe may still be off). */
export function isBasicPaidCheckoutCandidate(billing, planKey) {
  if (!billing || billing.purchase_source === "apple") return false;
  if (planKey !== "basic") return false;
  const status = billing.status;
  return !status || status === "none" || status === "canceled";
}

export function statusLabelForBilling(billing) {
  if (!billing) return "Loading…";
  if (billing.payment_issue?.active) return "Payment problem — grace period";
  if (billing.cancel_at_period_end) return "Cancellation scheduled";
  if (billing.scheduled_change?.active) return "Change scheduled";
  if (billing.pending_plan === "plus" && billing.subscribed_plan?.key === "business") {
    return "Downgrade scheduled";
  }
  if (billing.status === "trialing") return "Business trial";
  if (billing.status === "active") return "Active";
  if (billing.status === "canceled") return "Ended";
  return "No paid subscription";
}

function statusLabel(billing) {
  return statusLabelForBilling(billing);
}

/** Effective access end for cancellation copy (paid period or trial end). */
export function subscriptionAccessEndLabel(billing) {
  return formatWhen(billing?.trial_ends_at || billing?.current_period_end);
}

export function CancellationConfirmPanel({ billing, busyAction, onConfirm, onKeep }) {
  const accessEnd = subscriptionAccessEndLabel(billing);
  return createElement(
    "div",
    {
      className: "account-cancel-confirm",
      role: "group",
      "aria-labelledby": "account-cancel-confirm-title",
    },
    createElement(
      "h4",
      { id: "account-cancel-confirm-title", className: "account-cancel-confirm-title" },
      "Cancel subscription?",
    ),
    createElement(
      "p",
      { className: "account-cancel-confirm-lead" },
      "Your current plan remains active until:",
    ),
    createElement(
      "p",
      { className: "account-cancel-confirm-date" },
      accessEnd || "the scheduled end date",
    ),
    createElement(
      "div",
      { className: "account-cancel-confirm-after" },
      createElement("p", { className: "account-cancel-confirm-after-label" }, "After that:"),
      createElement(
        "ul",
        { className: "account-cancel-confirm-list" },
        createElement("li", null, "workspace moves to Basic"),
        createElement("li", null, "data is preserved"),
        createElement("li", null, "Basic limits apply"),
        createElement("li", null, "account is not deleted"),
      ),
    ),
    createElement(
      "div",
      { className: "account-cancel-confirm-actions" },
      createElement(
        "button",
        {
          type: "button",
          className: "btn-secondary btn-sm",
          disabled: Boolean(busyAction),
          onClick: onKeep,
        },
        "Keep subscription",
      ),
      createElement(
        "button",
        {
          type: "button",
          className: "btn-danger btn-sm",
          disabled: Boolean(busyAction),
          onClick: onConfirm,
        },
        busyAction === "cancel" ? "Canceling…" : "Confirm cancellation",
      ),
    ),
  );
}

/** Period-end Business → Plus confirmation (shared under Plan options). */
export function DowngradeConfirmPanel({
  billing,
  targetInterval,
  busyAction = "",
  error = "",
  onKeep,
  onConfirm,
}) {
  const interval = targetInterval || billing?.interval || "monthly";
  const targetPrice = catalogPriceWithInterval(billing, "plus", interval);
  const when = formatWhen(billing?.current_period_end) || "period end";
  return createElement(
    "div",
    {
      id: "account-downgrade-confirmation",
      className: "account-upgrade-preview",
      role: "region",
      "aria-label": "Downgrade confirmation",
    },
    createElement(
      "p",
      null,
      `You will keep Business until ${when}. Plus ${interval} begins on that date.`,
    ),
    targetPrice
      ? createElement(
          "p",
          { className: "account-panel-note" },
          `You will be charged ${targetPrice.replace("/", " per ")} then.`,
        )
      : null,
    error
      ? createElement(
          "p",
          { className: "account-panel-note account-panel-note-warning" },
          error,
        )
      : null,
    createElement(
      "div",
      { className: "account-upgrade-preview-actions" },
      createElement(
        "button",
        {
          type: "button",
          className: "btn-secondary btn-sm",
          disabled: Boolean(busyAction),
          onClick: onKeep,
        },
        "Keep Business",
      ),
      createElement(
        "button",
        {
          type: "button",
          className: "btn-primary btn-sm",
          disabled: Boolean(busyAction),
          onClick: onConfirm,
        },
        busyAction === "downgrade" ? "Scheduling…" : "Confirm downgrade",
      ),
    ),
  );
}

export { AccountSubscriptionPanel } from "./accountSubscriptionPanel.js";

export function AccountBillingPanel({
  billing = null,
  billingLoading = false,
  billingError = "",
  portalNotice = "",
  invoices = [],
  invoicesLoading = false,
  invoicesError = "",
  onOpenPortal,
  busyAction = "",
}) {
  const canPortal = Boolean(billing?.actions?.can_open_portal);
  const isStripe = billing?.purchase_source === "stripe";
  const isApple = billing?.purchase_source === "apple";
  const showStripeBilling = isStripe && canPortal;

  const invoiceRows = showStripeBilling
    ? invoicesLoading
      ? createElement("p", { className: "account-panel-note" }, "Loading invoices…")
      : invoicesError
        ? createElement(
            "p",
            { className: "account-panel-note account-panel-note-warning", role: "alert" },
            invoicesError,
          )
        : invoices.length === 0
          ? createElement("p", { className: "account-panel-note" }, "No invoices or receipts yet.")
          : createElement(
              "div",
              { className: "account-billing-invoices" },
              createElement(
                "ul",
                { className: "account-billing-invoice-list" },
                invoices.map((invoice) =>
                  createElement(
                    "li",
                    { key: invoice.id, className: "account-billing-invoice-row" },
                    createElement(
                      "div",
                      { className: "account-billing-invoice-main" },
                      createElement(
                        "span",
                        { className: "account-billing-invoice-date" },
                        invoice.created_at_formatted || "—",
                      ),
                      createElement(
                        "span",
                        { className: "account-billing-invoice-amount" },
                        invoice.amount_formatted || "—",
                      ),
                      createElement(
                        "span",
                        { className: "account-billing-invoice-status" },
                        invoice.status_label || invoice.status || "—",
                      ),
                    ),
                    invoice.description
                      ? createElement(
                          "p",
                          { className: "account-billing-invoice-description" },
                          invoice.description,
                        )
                      : null,
                    invoice.hosted_url
                      ? createElement(
                          "a",
                          {
                            ...externalLinkProps(invoice.hosted_url),
                            className: "account-billing-invoice-link",
                          },
                          "View invoice / receipt ↗",
                        )
                      : null,
                  ),
                ),
              ),
              createElement(
                "button",
                {
                  type: "button",
                  className: "btn-text btn-sm account-billing-view-all",
                  disabled: Boolean(busyAction),
                  onClick: () => onOpenPortal?.(),
                },
                "View all in Stripe ↗",
              ),
            )
    : null;

  return createElement(
    "div",
    { className: "account-panel account-panel-billing" },
    createElement(
      "p",
      { className: "account-panel-intro" },
      isApple
        ? "Apple-managed subscriptions are handled outside Check Station."
        : "Stripe payment method, invoices, and receipts for this workspace.",
    ),
    portalNotice
      ? createElement(
          "div",
          { className: "account-billing-banner", role: "status" },
          createElement("p", null, portalNotice),
        )
      : null,
    billingError
      ? createElement(
          "div",
          { className: "account-billing-banner account-billing-banner-warning", role: "alert" },
          createElement("p", null, billingError),
        )
      : null,
    billing?.payment_issue?.active
      ? createElement(
          "div",
          {
            className: "account-billing-banner account-billing-banner-warning",
            role: "alert",
          },
          createElement("strong", null, "Payment problem"),
          createElement(
            "p",
            null,
            `Grace deadline: ${formatWhen(billing.payment_issue.grace_deadline) || "pending"}. Your current plan remains temporarily active.`,
          ),
        )
      : null,
    createElement(
      PanelBlock,
      { title: "Subscription summary" },
      billingLoading
        ? createElement("p", { className: "account-panel-note" }, "Loading billing…")
        : MetaPairs([
            [
              "Purchase source",
              billing?.purchase_source === "stripe"
                ? "Stripe"
                : billing?.purchase_source === "apple"
                  ? "Apple"
                  : "None",
            ],
            ["Status", statusLabel(billing)],
            ["Subscribed plan", billing?.subscribed_plan?.display_name || null],
          ]),
    ),
    showStripeBilling
      ? createElement(
          PanelBlock,
          { title: "Recent invoices & receipts" },
          invoiceRows,
        )
      : null,
    isApple
      ? createElement(
          PanelBlock,
          { title: "Billing portal" },
          createElement(
            "p",
            { className: "account-panel-note" },
            "This subscription is managed in Apple. Stripe billing tools are not available.",
          ),
        )
      : isStripe && canPortal
        ? createElement(
            PanelBlock,
            { title: "Billing portal" },
            createElement(
              "div",
              { className: "account-panel-actions" },
              createElement(
                "button",
                {
                  type: "button",
                  className: "btn-secondary",
                  disabled: Boolean(busyAction),
                  onClick: () => onOpenPortal?.(),
                },
                busyAction === "portal" ? "Opening…" : "Open Stripe Billing Portal ↗",
              ),
            ),
          )
        : isStripe
          ? createElement(
              PanelBlock,
              { title: "Billing portal" },
              createElement(
                "p",
                { className: "account-panel-note" },
                billingLoading
                  ? "Loading…"
                  : "Stripe billing tools are available after a Stripe-managed subscription exists.",
              ),
            )
          : null,
  );
}
