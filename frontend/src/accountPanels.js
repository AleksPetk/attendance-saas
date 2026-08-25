import { createElement, useState } from "react";
import { NavLink } from "react-router-dom";
import { ACCOUNT_SECTIONS } from "./accountNavigation.js";
import {
  entitlementsFromSession,
  subscriptionUsageRows,
} from "./workspaceEntitlements.js";

function actionErrorMessage(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  const data = error.data;
  if (!data) return error.message || "Something went wrong.";
  if (typeof data.detail === "string") return data.detail;
  if (typeof data.code === "string" && typeof data.detail === "string") return data.detail;
  return "Something went wrong.";
}

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
  const amount = catalogPrice(billing, planKey, interval);
  if (!amount) return null;
  return `${amount}/${interval === "yearly" ? "year" : "month"}`;
}

/** Basic workspace that may start a paid checkout (Stripe may still be off). */
export function isBasicPaidCheckoutCandidate(billing, planKey) {
  if (!billing || billing.purchase_source === "apple") return false;
  if (planKey !== "basic") return false;
  const status = billing.status;
  return !status || status === "none" || status === "canceled";
}

function statusLabel(billing) {
  if (!billing) return "Loading…";
  if (billing.payment_issue?.active) return "Payment problem — grace period";
  if (billing.cancel_at_period_end) return "Cancellation scheduled";
  if (billing.pending_plan === "plus") return "Downgrade scheduled";
  if (billing.status === "trialing") return "Business trial";
  if (billing.status === "active") return "Active";
  if (billing.status === "canceled") return "Ended";
  return "No paid subscription";
}

function PlanOptionCard({
  planKey,
  title,
  priceLabel,
  isCurrent,
  children,
}) {
  return createElement(
    "article",
    {
      className: isCurrent
        ? "account-plan-option is-current"
        : "account-plan-option",
      "data-plan": planKey,
    },
    createElement(
      "header",
      { className: "account-plan-option-header" },
      createElement("h4", null, title),
      isCurrent
        ? createElement("span", { className: "account-plan-option-badge" }, "Current plan")
        : null,
    ),
    priceLabel
      ? createElement("p", { className: "account-plan-option-price" }, priceLabel)
      : null,
    children,
  );
}

export function AccountSubscriptionPanel({
  session,
  billing = null,
  billingLoading = false,
  billingError = "",
  confirmingCheckout = false,
  checkoutNotice = "",
  onStartCheckout,
  onStartTrial,
  onPreviewUpgrade,
  onConfirmUpgrade,
  onScheduleDowngrade,
  onCancelSubscription,
  onResumeSubscription,
  onCancelScheduledDowngrade,
  busyAction = "",
  initialUpgradePreview = null,
  initialCheckoutInterval = "monthly",
}) {
  const entitlements = entitlementsFromSession(session);
  const planKey = entitlements?.plan?.key || billing?.effective_plan?.key || null;
  const planName =
    entitlements?.plan?.display_name || billing?.effective_plan?.display_name || null;
  const usageRows = subscriptionUsageRows(entitlements);
  const actions = billing?.actions || {};
  const [checkoutInterval, setCheckoutInterval] = useState(
    initialCheckoutInterval === "yearly" ? "yearly" : "monthly",
  );
  const [upgradePreview, setUpgradePreview] = useState(initialUpgradePreview);
  const [localError, setLocalError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDowngrade, setConfirmDowngrade] = useState(false);

  async function handlePreviewUpgrade() {
    setLocalError("");
    setUpgradePreview(null);
    if (!onPreviewUpgrade) return;
    try {
      const preview = await onPreviewUpgrade();
      setUpgradePreview(preview);
    } catch (err) {
      setLocalError(actionErrorMessage(err));
    }
  }

  async function handleConfirmUpgrade() {
    setLocalError("");
    if (!onConfirmUpgrade) return;
    try {
      await onConfirmUpgrade();
      setUpgradePreview(null);
    } catch (err) {
      setLocalError(actionErrorMessage(err));
    }
  }

  async function handleResume() {
    setLocalError("");
    if (!onResumeSubscription) return;
    try {
      await onResumeSubscription();
    } catch (err) {
      setLocalError(actionErrorMessage(err));
    }
  }

  async function handleCancelDowngrade() {
    setLocalError("");
    if (!onCancelScheduledDowngrade) return;
    try {
      await onCancelScheduledDowngrade();
    } catch (err) {
      setLocalError(actionErrorMessage(err));
    }
  }

  const recurringPrice =
    billing?.subscribed_plan?.key && billing?.interval
      ? catalogPriceWithInterval(billing, billing.subscribed_plan.key, billing.interval)
      : null;
  const stripeConfigured = Boolean(billing?.stripe_configured);
  const isApple = billing?.purchase_source === "apple";
  const basicCheckoutCandidate = isBasicPaidCheckoutCandidate(billing, planKey);
  const showPaidCheckoutActions = basicCheckoutCandidate && !isApple;
  const plusPrice = catalogPriceWithInterval(billing, "plus", checkoutInterval);
  const businessPrice = catalogPriceWithInterval(billing, "business", checkoutInterval);
  const basicPrice = billing?.catalog?.basic?.formatted || "Free";
  const scheduledDowngradeAt = formatWhenDate(billing?.pending_change_effective_at);
  const scheduledCancelAt = formatWhenDate(
    billing?.pending_change_effective_at || billing?.current_period_end || billing?.trial_ends_at,
  );
  const hasPlanActionBlock =
    Boolean(upgradePreview) ||
    (actions.can_schedule_downgrade_to_plus && confirmDowngrade) ||
    actions.can_cancel;

  return createElement(
    "div",
    { className: "account-panel account-panel-subscription" },
    confirmingCheckout
      ? createElement(
          "div",
          {
            className: "account-billing-banner account-billing-banner-confirming",
            role: "status",
          },
          createElement("strong", null, "Confirming subscription…"),
          createElement(
            "p",
            null,
            "Checkout return is only a status check. Paid access appears after Stripe confirms the subscription.",
          ),
        )
      : null,
    checkoutNotice
      ? createElement(
          "div",
          { className: "account-billing-banner", role: "status" },
          createElement("p", null, checkoutNotice),
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
            `Your current plan stays active until ${formatWhen(billing.payment_issue.grace_deadline) || "the grace deadline"}. Update your payment method in Billing to keep access.`,
          ),
          createElement(
            NavLink,
            { to: "/account/billing", className: "btn-secondary btn-sm" },
            "Open Billing",
          ),
        )
      : null,
    billingError || localError
      ? createElement(
          "div",
          { className: "account-billing-banner account-billing-banner-warning", role: "alert" },
          createElement("p", null, billingError || localError),
        )
      : null,
    createElement(
      PanelBlock,
      {
        title: "Current plan",
        description: "Effective workspace plan and billing status.",
      },
      createElement(
        "div",
        { className: "account-panel-stat" },
        createElement("span", { className: "account-panel-stat-label" }, "Effective plan"),
        createElement(
          "strong",
          {
            className: planName
              ? "account-panel-stat-value"
              : "account-panel-stat-value account-panel-stat-muted",
          },
          planName || "Unavailable",
        ),
        createElement(
          "p",
          { className: "account-panel-note" },
          billingLoading
            ? "Loading subscription state…"
            : isApple
              ? "This workspace is billed through Apple. Manage renewals in Apple subscriptions."
              : "Entitlements come from the workspace plan. Checkout changes apply after Stripe confirms.",
        ),
      ),
      billing && !billingLoading
        ? MetaPairs([
            ["Billing status", statusLabel(billing)],
            [
              "Interval",
              billing.interval
                ? billing.interval === "yearly"
                  ? "Yearly"
                  : "Monthly"
                : null,
            ],
            ["Price", recurringPrice],
            ["Trial ends", billing.trial_ends_at ? formatWhen(billing.trial_ends_at) : null],
            [
              billing.cancel_at_period_end ? "Ends" : "Renews",
              billing.current_period_end && !billing.trial_ends_at
                ? formatWhen(billing.current_period_end)
                : null,
            ],
            [
              "Scheduled change",
              billing.pending_plan === "plus" && scheduledDowngradeAt
                ? `Business remains active until ${scheduledDowngradeAt}. Plus begins on ${scheduledDowngradeAt}.`
                : null,
            ],
            [
              "Cancellation",
              billing.cancel_at_period_end && scheduledCancelAt
                ? `Your current plan remains active until ${scheduledCancelAt}. Basic begins after that date. Data is preserved.`
                : null,
            ],
          ])
        : null,
      billing?.cancel_at_period_end && actions.can_resume_subscription
        ? createElement(
            "div",
            { className: "account-scheduled-action", role: "status" },
            createElement("strong", null, "Cancellation scheduled"),
            createElement(
              "p",
              null,
              scheduledCancelAt
                ? `Your current plan remains active until ${scheduledCancelAt}.`
                : "Your current plan remains active until the scheduled end date.",
            ),
            createElement(
              "button",
              {
                type: "button",
                className: "btn-primary btn-sm",
                disabled: Boolean(busyAction),
                onClick: handleResume,
              },
              busyAction === "resume" ? "Resuming…" : "Resume subscription",
            ),
          )
        : null,
      billing?.pending_plan === "plus" &&
        !billing?.cancel_at_period_end &&
        actions.can_cancel_scheduled_downgrade
        ? createElement(
            "div",
            { className: "account-scheduled-action", role: "status" },
            createElement("strong", null, "Downgrade scheduled"),
            createElement(
              "p",
              null,
              scheduledDowngradeAt
                ? `Business remains active until ${scheduledDowngradeAt}. Plus begins on ${scheduledDowngradeAt}.`
                : "Business remains active until period end. Plus begins after that date.",
            ),
            createElement(
              "button",
              {
                type: "button",
                className: "btn-secondary btn-sm",
                disabled: Boolean(busyAction),
                onClick: handleCancelDowngrade,
              },
              busyAction === "cancel-downgrade" ? "Canceling…" : "Cancel downgrade",
            ),
          )
        : null,
    ),
    createElement(
      PanelBlock,
      {
        title: "Plan options",
        description: "Choose a paid plan when you are ready. Prices come from the billing catalog.",
      },
      createElement(
        "div",
        { className: "account-interval-toggle", role: "group", "aria-label": "Billing interval" },
        ["monthly", "yearly"].map((interval) =>
          createElement(
            "button",
            {
              key: interval,
              type: "button",
              className:
                checkoutInterval === interval
                  ? "btn-secondary btn-sm is-selected"
                  : "btn-secondary btn-sm",
              onClick: () => setCheckoutInterval(interval),
            },
            interval === "yearly" ? "Yearly" : "Monthly",
          ),
        ),
      ),
      !stripeConfigured && !isApple
        ? createElement(
            "p",
            { className: "account-panel-note" },
            "Stripe test billing is not configured yet. Plan prices stay visible; checkout stays unavailable until TEST credentials are supplied.",
          )
        : null,
      isApple
        ? createElement(
            "p",
            { className: "account-panel-note" },
            "Apple-managed billing cannot use Stripe Checkout from these options.",
          )
        : null,
      createElement(
        "div",
        { className: "account-plan-options", "aria-label": "Available plans" },
        createElement(
          PlanOptionCard,
          {
            planKey: "basic",
            title: billing?.catalog?.basic?.display_name || "Basic",
            priceLabel: basicPrice,
            isCurrent: planKey === "basic",
          },
        ),
        createElement(
          PlanOptionCard,
          {
            planKey: "plus",
            title: billing?.catalog?.plans?.plus?.display_name || "Plus",
            priceLabel: plusPrice || "Plus",
            isCurrent: planKey === "plus",
          },
          showPaidCheckoutActions
            ? createElement(
                "button",
                {
                  type: "button",
                  className: "btn-primary btn-sm",
                  disabled: Boolean(busyAction) || !actions.can_checkout_plus,
                  onClick: () => {
                    if (!actions.can_checkout_plus) return;
                    onStartCheckout?.("plus", checkoutInterval);
                  },
                },
                "Choose Plus",
              )
            : null,
          actions.can_schedule_downgrade_to_plus
            ? createElement(
                "button",
                {
                  type: "button",
                  className: "btn-secondary btn-sm",
                  disabled: Boolean(busyAction),
                  onClick: () => setConfirmDowngrade(true),
                },
                "Schedule downgrade to Plus",
              )
            : null,
        ),
        createElement(
          PlanOptionCard,
          {
            planKey: "business",
            title: billing?.catalog?.plans?.business?.display_name || "Business",
            priceLabel: businessPrice || "Business",
            isCurrent: planKey === "business",
          },
          showPaidCheckoutActions
            ? createElement(
                "button",
                {
                  type: "button",
                  className: "btn-primary btn-sm",
                  disabled: Boolean(busyAction) || !actions.can_checkout_business,
                  onClick: () => {
                    if (!actions.can_checkout_business) return;
                    onStartCheckout?.("business", checkoutInterval);
                  },
                },
                "Choose Business",
              )
            : null,
          actions.can_start_trial
            ? createElement(
                "button",
                {
                  type: "button",
                  className: "btn-secondary btn-sm",
                  disabled: Boolean(busyAction),
                  onClick: () => onStartTrial?.(checkoutInterval),
                },
                "Start Business trial",
              )
            : null,
          actions.can_upgrade_to_business && !upgradePreview
            ? createElement(
                "button",
                {
                  type: "button",
                  className: "btn-primary btn-sm",
                  disabled: Boolean(busyAction),
                  onClick: handlePreviewUpgrade,
                },
                busyAction === "preview" ? "Loading preview…" : "Upgrade to Business",
              )
            : null,
        ),
      ),
    ),
    createElement(
      PanelBlock,
      {
        title: "Usage & limits",
        description: "Current plan capacity versus workspace records.",
      },
      usageRows.length
        ? createElement(
            "ul",
            { className: "account-usage-list" },
            usageRows.map((row) =>
              createElement(
                "li",
                {
                  key: row.key,
                  className: row.over ? "account-usage-row is-over" : "account-usage-row",
                },
                createElement("span", { className: "account-usage-label" }, row.label),
                createElement(
                  "div",
                  { className: "account-usage-value-block" },
                  createElement(
                    "strong",
                    { className: "account-usage-value" },
                    row.display || `${row.usage} / ${row.limit}`,
                  ),
                  row.limitNote
                    ? createElement(
                        "span",
                        { className: "account-usage-limit-note" },
                        row.limitNote,
                      )
                    : null,
                ),
              ),
            ),
          )
        : createElement(
            "div",
            { className: "account-panel-empty" },
            createElement("p", null, "Usage data is unavailable."),
          ),
    ),
    hasPlanActionBlock
      ? createElement(
          PanelBlock,
          {
            title: "Plan actions",
            description: "Confirm plan changes for this workspace.",
          },
          actions.can_upgrade_to_business && upgradePreview
            ? createElement(
                "div",
                { className: "account-upgrade-preview" },
                createElement(
                  "p",
                  null,
                  `Upgrade to Business today for ${upgradePreview.amount_due_formatted}.`,
                ),
                createElement(
                  "p",
                  { className: "account-panel-note" },
                  `Business renews at ${upgradePreview.recurring_formatted}/${upgradePreview.recurring_interval === "yearly" ? "year" : "month"}${
                    upgradePreview.next_renewal_at
                      ? ` on ${formatWhen(upgradePreview.next_renewal_at)}`
                      : ""
                  }.`,
                ),
                createElement(
                  "div",
                  { className: "account-panel-actions" },
                  createElement(
                    "button",
                    {
                      type: "button",
                      className: "btn-primary",
                      disabled: Boolean(busyAction),
                      onClick: handleConfirmUpgrade,
                    },
                    busyAction === "upgrade" ? "Confirming…" : "Confirm upgrade",
                  ),
                  createElement(
                    "button",
                    {
                      type: "button",
                      className: "btn-secondary",
                      disabled: Boolean(busyAction),
                      onClick: () => setUpgradePreview(null),
                    },
                    "Cancel",
                  ),
                ),
              )
            : null,
          actions.can_schedule_downgrade_to_plus && confirmDowngrade
            ? createElement(
                "div",
                { className: "account-downgrade-block" },
                createElement(
                  "p",
                  null,
                  `You will keep Business until ${formatWhen(billing.current_period_end) || "period end"}. Plus begins on that date.`,
                ),
                createElement(
                  "div",
                  { className: "account-panel-actions" },
                  createElement(
                    "button",
                    {
                      type: "button",
                      className: "btn-primary",
                      disabled: Boolean(busyAction),
                      onClick: async () => {
                        setLocalError("");
                        try {
                          await onScheduleDowngrade?.();
                          setConfirmDowngrade(false);
                        } catch (err) {
                          setLocalError(actionErrorMessage(err));
                        }
                      },
                    },
                    busyAction === "downgrade" ? "Scheduling…" : "Confirm downgrade",
                  ),
                  createElement(
                    "button",
                    {
                      type: "button",
                      className: "btn-secondary",
                      onClick: () => setConfirmDowngrade(false),
                    },
                    "Keep Business",
                  ),
                ),
              )
            : null,
          actions.can_cancel
            ? createElement(
                "div",
                { className: "account-cancel-block" },
                !confirmCancel
                  ? createElement(
                      "button",
                      {
                        type: "button",
                        className: "btn-secondary",
                        disabled: Boolean(busyAction),
                        onClick: () => setConfirmCancel(true),
                      },
                      "Cancel subscription",
                    )
                  : createElement(
                      "div",
                      null,
                      createElement(
                        "p",
                        null,
                        `Access remains until ${formatWhen(
                          billing.trial_ends_at || billing.current_period_end,
                        ) || "the current period ends"}. Then the workspace moves to Basic. Data is preserved. Basic limits apply after the transition. This is not account deletion.`,
                      ),
                      createElement(
                        "div",
                        { className: "account-panel-actions" },
                        createElement(
                          "button",
                          {
                            type: "button",
                            className: "btn-danger",
                            disabled: Boolean(busyAction),
                            onClick: async () => {
                              setLocalError("");
                              try {
                                await onCancelSubscription?.();
                                setConfirmCancel(false);
                              } catch (err) {
                                setLocalError(actionErrorMessage(err));
                              }
                            },
                          },
                          busyAction === "cancel" ? "Canceling…" : "Confirm cancellation",
                        ),
                        createElement(
                          "button",
                          {
                            type: "button",
                            className: "btn-secondary",
                            onClick: () => setConfirmCancel(false),
                          },
                          "Keep subscription",
                        ),
                      ),
                    ),
              )
            : null,
        )
      : null,
  );
}

export function AccountBillingPanel({
  billing = null,
  billingLoading = false,
  billingError = "",
  portalNotice = "",
  onOpenPortal,
  busyAction = "",
}) {
  const canPortal = Boolean(billing?.actions?.can_open_portal);
  const isApple = billing?.purchase_source === "apple";
  return createElement(
    "div",
    { className: "account-panel account-panel-billing" },
    createElement(
      "p",
      { className: "account-panel-intro" },
      "Payment method and invoices for Stripe-managed subscriptions open in the Stripe Customer Portal. Check Station does not invent invoice history.",
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
    createElement(
      PanelBlock,
      { title: "Invoices / receipts" },
      createElement(
        "div",
        { className: "account-panel-empty" },
        createElement(
          "p",
          null,
          canPortal
            ? "Open the Stripe Customer Portal for invoices and receipts."
            : "No Stripe invoice history is stored in Check Station.",
        ),
      ),
    ),
    createElement(
      PanelBlock,
      { title: "Payment method / billing portal" },
      isApple
        ? createElement(
            "div",
            { className: "account-panel-empty" },
            createElement(
              "p",
              null,
              "This subscription is managed in Apple. Stripe Customer Portal is not available.",
            ),
          )
        : canPortal
          ? createElement(
              "div",
              { className: "account-panel-actions" },
              createElement(
                "button",
                {
                  type: "button",
                  className: "btn-primary",
                  disabled: Boolean(busyAction),
                  onClick: () => onOpenPortal?.(),
                },
                busyAction === "portal" ? "Opening…" : "Manage billing in Stripe",
              ),
            )
          : createElement(
              "div",
              { className: "account-panel-empty" },
              createElement(
                "p",
                null,
                billingLoading
                  ? "Loading…"
                  : "Stripe Customer Portal is available after a Stripe-managed subscription exists.",
              ),
            ),
    ),
  );
}
