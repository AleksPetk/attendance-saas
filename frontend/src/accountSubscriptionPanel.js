import { createElement, useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  CancellationConfirmPanel,
  DowngradeConfirmPanel,
  catalogPriceWithInterval,
  scheduleChangePreviewCopy,
  scheduledChangeSummary,
  statusLabelForBilling,
} from "./accountPanels.js";
import {
  catalogPromotion,
  promotionCheckoutWarning,
} from "./promotionCatalog.js";
import {
  buildDowngradePlanOptions,
  buildUpgradePlanOptions,
  effectiveBillingInterval,
  effectivePlanKey,
  isEffectiveCurrentPlanOption,
  isHighestPaidPlan,
  planDisplayName,
  targetOfferPricing,
} from "./subscriptionPlanOptions.js";
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
  return "Something went wrong.";
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

function PlanOptionCard({
  planKey,
  title,
  priceLabel,
  pricePeriodLabel,
  priceNote,
  listPriceLabel,
  renewsLabel,
  isCurrent,
  isScheduled,
  scheduledLabel,
  recommended,
  children,
}) {
  const classes = ["account-plan-option"];
  if (isCurrent) classes.push("is-current");
  if (recommended) classes.push("is-recommended");
  if (isScheduled) classes.push("is-scheduled");
  return createElement(
    "article",
    { className: classes.join(" "), "data-plan": planKey },
    createElement(
      "header",
      { className: "account-plan-option-header" },
      createElement("h4", null, title),
      isCurrent
        ? createElement("span", { className: "account-plan-option-badge" }, "Current plan")
        : isScheduled
          ? createElement(
              "span",
              { className: "account-plan-option-badge account-plan-option-badge-scheduled" },
              scheduledLabel || "Scheduled",
            )
          : recommended
            ? createElement(
                "span",
                {
                  className:
                    "account-plan-option-badge account-plan-option-badge-recommended",
                },
                "Recommended",
              )
            : null,
    ),
    priceLabel
      ? createElement("p", { className: "account-plan-option-price" }, priceLabel)
      : null,
    pricePeriodLabel
      ? createElement("p", { className: "account-plan-option-period" }, pricePeriodLabel)
      : null,
    listPriceLabel && listPriceLabel !== priceLabel
      ? createElement(
          "p",
          { className: "account-plan-option-list-price" },
          `Normally ${listPriceLabel}`,
        )
      : null,
    priceNote
      ? createElement("p", { className: "account-plan-option-promo-note" }, priceNote)
      : null,
    renewsLabel
      ? createElement("p", { className: "account-plan-option-renews" }, renewsLabel)
      : null,
    children,
  );
}

function scrollConfirmIntoView(node) {
  if (!node) return;
  const rect = node.getBoundingClientRect();
  const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
  if (!inView) {
    node.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

export function AccountSubscriptionPanel({
  session,
  billing = null,
  billingLoading = false,
  billingError = "",
  confirmingCheckout = false,
  checkoutNotice = "",
  onStartCheckout,
  onPreviewUpgrade,
  onConfirmUpgrade,
  onScheduleDowngrade,
  onCancelSubscription,
  onResumeSubscription,
  onCancelScheduledDowngrade,
  onScheduleBillingChange,
  onCancelScheduledChange,
  busyAction = "",
  initialUpgradePreview = null,
  initialUpgradeError = "",
  initialConfirmCancel = false,
  initialConfirmDowngrade = false,
  initialDowngradeError = "",
  initialDowngradeExpanded = false,
}) {
  const entitlements = entitlementsFromSession(session);
  const sessionPlanKey = entitlements?.plan?.key || null;
  const planKey = effectivePlanKey(billing, sessionPlanKey);
  const planName =
    entitlements?.plan?.display_name ||
    billing?.effective_plan?.display_name ||
    planDisplayName(billing, planKey);
  const currentInterval = effectiveBillingInterval(billing);
  const usageRows = subscriptionUsageRows(entitlements);
  const actions = billing?.actions || {};

  const [upgradePreview, setUpgradePreview] = useState(initialUpgradePreview);
  const [upgradeError, setUpgradeError] = useState(initialUpgradeError);
  const [localError, setLocalError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(Boolean(initialConfirmCancel));
  const [confirmDowngrade, setConfirmDowngrade] = useState(
    Boolean(initialConfirmDowngrade),
  );
  const [downgradeError, setDowngradeError] = useState(initialDowngradeError);
  const [confirmScheduleChange, setConfirmScheduleChange] = useState(null);
  const [downgradeExpanded, setDowngradeExpanded] = useState(
    Boolean(initialDowngradeExpanded),
  );
  const [downgradeTarget, setDowngradeTarget] = useState(null);

  const upgradeConfirmRef = useRef(null);
  const scheduleConfirmRef = useRef(null);
  const downgradeConfirmRef = useRef(null);

  useEffect(() => {
    if (!upgradePreview) return undefined;
    scrollConfirmIntoView(upgradeConfirmRef.current);
    return undefined;
  }, [upgradePreview]);

  useEffect(() => {
    if (!confirmScheduleChange) return undefined;
    scrollConfirmIntoView(scheduleConfirmRef.current);
    return undefined;
  }, [confirmScheduleChange]);

  useEffect(() => {
    if (!confirmDowngrade) return undefined;
    scrollConfirmIntoView(downgradeConfirmRef.current);
    return undefined;
  }, [confirmDowngrade]);

  const scheduledSummary = scheduledChangeSummary(billing);
  const recurringPrice =
    billing?.subscribed_plan?.key && billing?.interval
      ? catalogPriceWithInterval(billing, billing.subscribed_plan.key, billing.interval)
      : null;
  const stripeConfigured = Boolean(billing?.stripe_configured);
  const isApple = billing?.purchase_source === "apple";
  const catalogPromo = catalogPromotion(billing?.catalog);
  const checkoutPromoWarning = promotionCheckoutWarning(billing?.catalog);
  const upgradeOptions = buildUpgradePlanOptions(billing, sessionPlanKey);
  const downgradeOptions = buildDowngradePlanOptions(billing, sessionPlanKey);
  const highestPlan = isHighestPaidPlan(billing, sessionPlanKey);
  const scheduledCancelAt = formatWhenDate(
    billing?.pending_change_effective_at ||
      billing?.current_period_end ||
      billing?.trial_ends_at,
  );
  const scheduledDowngradeAt = formatWhenDate(billing?.pending_change_effective_at);
  const hasPlanActionBlock = Boolean(actions.can_cancel || actions.can_resume_subscription);

  const pendingMatches = (plan, interval) =>
    Boolean(
      billing?.scheduled_change?.active &&
        (billing.pending_plan || billing.subscribed_plan?.key) === plan &&
        (billing.pending_interval || billing.interval) === interval,
    );

  function clearUpgradeConfirms() {
    setUpgradePreview(null);
    setUpgradeError("");
    setConfirmScheduleChange(null);
  }

  function clearDowngradeConfirms() {
    setConfirmDowngrade(false);
    setDowngradeError("");
    setDowngradeTarget(null);
  }

  async function handlePreviewUpgrade() {
    setUpgradeError("");
    setLocalError("");
    setUpgradePreview(null);
    clearDowngradeConfirms();
    setConfirmScheduleChange(null);
    if (!onPreviewUpgrade) return;
    try {
      const preview = await onPreviewUpgrade();
      setUpgradePreview(preview);
    } catch (err) {
      setUpgradeError(actionErrorMessage(err));
    }
  }

  async function handleConfirmUpgrade() {
    setUpgradeError("");
    setLocalError("");
    if (!onConfirmUpgrade) return;
    try {
      await onConfirmUpgrade();
      setUpgradePreview(null);
    } catch (err) {
      setUpgradeError(actionErrorMessage(err));
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

  function renderScheduleConfirmationArea() {
    if (!confirmScheduleChange) return null;
    const copy = scheduleChangePreviewCopy(
      billing,
      confirmScheduleChange.plan,
      confirmScheduleChange.interval,
    );
    return createElement(
      "div",
      {
        ref: scheduleConfirmRef,
        id: "account-schedule-change-confirmation",
        className: "account-schedule-change-preview",
        role: "region",
        "aria-label": "Plan change confirmation",
      },
      createElement("h4", { className: "account-schedule-change-title" }, copy.title),
      createElement("p", { className: "account-panel-note" }, copy.lead),
      createElement(
        "ul",
        { className: "account-schedule-change-list" },
        copy.bullets.map((line) => createElement("li", { key: line }, line)),
      ),
      createElement(
        "div",
        { className: "account-schedule-change-actions" },
        createElement(
          "button",
          {
            type: "button",
            className: "btn-secondary btn-sm",
            disabled: Boolean(busyAction),
            onClick: () => setConfirmScheduleChange(null),
          },
          "Cancel",
        ),
        createElement(
          "button",
          {
            type: "button",
            className: "btn-primary btn-sm",
            disabled: Boolean(busyAction),
            onClick: async () => {
              setLocalError("");
              try {
                await onScheduleBillingChange?.(
                  confirmScheduleChange.plan,
                  confirmScheduleChange.interval,
                );
                setConfirmScheduleChange(null);
              } catch (err) {
                setLocalError(actionErrorMessage(err));
              }
            },
          },
          busyAction === "schedule-change" ? "Scheduling…" : "Confirm change",
        ),
      ),
    );
  }

  function renderUpgradeConfirmationArea() {
    const show =
      Boolean(upgradePreview) ||
      busyAction === "preview" ||
      Boolean(upgradeError);
    if (!show) return null;
    if (busyAction === "preview" && !upgradePreview) {
      return createElement(
        "div",
        {
          ref: upgradeConfirmRef,
          id: "account-upgrade-confirmation",
          className: "account-upgrade-preview",
          role: "status",
          "aria-live": "polite",
          "aria-label": "Upgrade confirmation",
        },
        createElement("p", { className: "account-panel-note" }, "Loading upgrade preview…"),
      );
    }
    if (upgradeError && !upgradePreview) {
      return createElement(
        "div",
        {
          ref: upgradeConfirmRef,
          id: "account-upgrade-confirmation",
          className: "account-upgrade-preview",
          role: "alert",
          "aria-label": "Upgrade confirmation",
        },
        createElement(
          "p",
          { className: "account-panel-note account-panel-note-warning" },
          upgradeError,
        ),
      );
    }
    if (!upgradePreview) return null;
    return createElement(
      "div",
      {
        ref: upgradeConfirmRef,
        id: "account-upgrade-confirmation",
        className: "account-upgrade-preview",
        role: "region",
        "aria-label": "Upgrade confirmation",
      },
      createElement(
        "p",
        null,
        `Upgrade to Business today for ${upgradePreview.amount_due_formatted}.`,
      ),
      createElement(
        "p",
        { className: "account-panel-note" },
        `Business renews at ${upgradePreview.recurring_formatted}/${
          upgradePreview.recurring_interval === "yearly" ? "year" : "month"
        }${
          upgradePreview.next_renewal_at
            ? ` on ${formatWhen(upgradePreview.next_renewal_at)}`
            : ""
        }.`,
      ),
      upgradeError
        ? createElement(
            "p",
            { className: "account-panel-note account-panel-note-warning" },
            upgradeError,
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
            onClick: () => {
              setUpgradePreview(null);
              setUpgradeError("");
            },
          },
          "Cancel",
        ),
        createElement(
          "button",
          {
            type: "button",
            className: "btn-primary btn-sm",
            disabled: Boolean(busyAction),
            onClick: handleConfirmUpgrade,
          },
          busyAction === "upgrade" ? "Confirming…" : "Confirm upgrade",
        ),
      ),
    );
  }

  function renderUpgradeCard(option) {
    const pricing = option.pricing || targetOfferPricing(billing, option.plan, option.interval);
    const isCurrent = isEffectiveCurrentPlanOption(
      billing,
      option.plan,
      option.interval,
      sessionPlanKey,
    );
    const isScheduled = pendingMatches(option.plan, option.interval);
    const unit = option.interval === "yearly" ? "year" : "month";
    return createElement(
      PlanOptionCard,
      {
        key: option.id,
        planKey: option.plan,
        title: option.title,
        priceLabel: pricing.firstPeriodFormatted || pricing.listWithInterval,
        pricePeriodLabel: pricing.promotional
          ? option.interval === "yearly"
            ? "first year"
            : "first month"
          : `per ${unit}`,
        listPriceLabel: pricing.promotional ? pricing.listWithInterval : null,
        priceNote: pricing.label,
        renewsLabel:
          pricing.promotional && pricing.renewsAtWithInterval
            ? `Then ${pricing.renewsAtWithInterval}`
            : null,
        isCurrent,
        isScheduled,
        scheduledLabel: scheduledSummary?.effectiveAt
          ? `Changes on ${scheduledSummary.effectiveAt}`
          : "Scheduled",
        recommended: option.recommended && !isCurrent && !isScheduled,
      },
      option.kind === "checkout"
        ? createElement(
            "button",
            {
              type: "button",
              className: "btn-primary btn-sm",
              disabled: Boolean(busyAction) || !option.enabled,
              "aria-label": option.actionLabel,
              onClick: () => {
                if (!option.enabled) return;
                onStartCheckout?.(option.plan, option.interval);
              },
            },
            option.actionLabel,
          )
        : null,
      option.kind === "immediate_upgrade" && !upgradePreview && busyAction !== "preview"
        ? createElement(
            "button",
            {
              type: "button",
              className: "btn-primary btn-sm",
              disabled: Boolean(busyAction) || !option.enabled,
              "aria-label": option.actionLabel,
              onClick: () => {
                clearDowngradeConfirms();
                handlePreviewUpgrade();
              },
            },
            option.actionLabel,
          )
        : null,
      option.kind === "schedule" && !isScheduled
        ? createElement(
            "button",
            {
              type: "button",
              className: option.recommended ? "btn-primary btn-sm" : "btn-secondary btn-sm",
              disabled: Boolean(busyAction) || !option.enabled,
              "aria-label": option.actionLabel,
              onClick: () => {
                clearUpgradeConfirms();
                clearDowngradeConfirms();
                setConfirmScheduleChange({
                  plan: option.plan,
                  interval: option.interval,
                });
              },
            },
            option.actionLabel,
          )
        : null,
    );
  }

  function renderDowngradeConfirmationArea() {
    if (downgradeTarget?.kind === "cancel_to_basic") {
      return createElement(
        "div",
        { ref: downgradeConfirmRef, className: "account-downgrade-confirm-wrap" },
        createElement(CancellationConfirmPanel, {
          billing,
          busyAction,
          onKeep: () => {
            setConfirmCancel(false);
            clearDowngradeConfirms();
          },
          onConfirm: async () => {
            setLocalError("");
            try {
              await onCancelSubscription?.();
              setConfirmCancel(false);
              clearDowngradeConfirms();
            } catch (err) {
              setLocalError(actionErrorMessage(err));
            }
          },
        }),
      );
    }
    if (!confirmDowngrade && busyAction !== "downgrade" && !downgradeError) return null;
    if (busyAction === "downgrade" && !confirmDowngrade) {
      return createElement(
        "div",
        {
          ref: downgradeConfirmRef,
          id: "account-downgrade-confirmation",
          className: "account-upgrade-preview",
          role: "status",
        },
        createElement("p", { className: "account-panel-note" }, "Scheduling downgrade…"),
      );
    }
    if (downgradeError && !confirmDowngrade) {
      return createElement(
        "div",
        {
          ref: downgradeConfirmRef,
          id: "account-downgrade-confirmation",
          className: "account-upgrade-preview",
          role: "alert",
        },
        createElement(
          "p",
          { className: "account-panel-note account-panel-note-warning" },
          downgradeError,
        ),
      );
    }
    if (!confirmDowngrade) return null;
    return createElement(
      "div",
      { ref: downgradeConfirmRef },
      createElement(DowngradeConfirmPanel, {
        billing,
        targetInterval: currentInterval || "monthly",
        busyAction,
        error: downgradeError,
        onKeep: clearDowngradeConfirms,
        onConfirm: async () => {
          setDowngradeError("");
          setLocalError("");
          try {
            await onScheduleDowngrade?.(currentInterval || "monthly");
            clearDowngradeConfirms();
          } catch (err) {
            setDowngradeError(actionErrorMessage(err));
          }
        },
      }),
      createElement(
        "p",
        { className: "account-panel-note" },
        "Records above Plus limits become plan-locked when Plus begins. Data is not deleted.",
      ),
    );
  }

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
    billing?.builtin_trial?.active
      ? createElement(
          "div",
          {
            className: "account-billing-banner",
            role: "status",
          },
          createElement("strong", null, "7-day Business trial included"),
          createElement(
            "p",
            null,
            billing.builtin_trial.ends_at
              ? `This workspace already has Business until ${formatWhen(
                  billing.builtin_trial.ends_at,
                )}. No card is required for the trial. If you choose Plus or Business now, paid billing starts after that date.`
              : "This workspace already has Business for 7 days. No card is required for the trial.",
          ),
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
            `Your current plan stays active until ${
              formatWhen(billing.payment_issue.grace_deadline) || "the grace deadline"
            }. Update your payment method in Billing to keep access.`,
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
          {
            className: "account-billing-banner account-billing-banner-warning",
            role: "alert",
          },
          createElement("p", null, billingError || localError),
        )
      : null,

    // 1. Current plan
    createElement(
      PanelBlock,
      {
        title: "Current plan",
        description: "The subscription that is effective right now.",
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
              : billing?.builtin_trial?.active
                ? "Business is included free until the trial ends. Choosing Plus or Business does not shorten that week."
                : "Entitlements come from the workspace plan. Checkout changes apply after Stripe confirms.",
        ),
      ),
      billing && !billingLoading
        ? MetaPairs([
            ["Billing status", statusLabelForBilling(billing)],
            [
              "Included Business trial ends",
              billing.builtin_trial?.active && billing.builtin_trial?.ends_at
                ? formatWhen(billing.builtin_trial.ends_at)
                : null,
            ],
            [
              "Interval",
              currentInterval
                ? currentInterval === "yearly"
                  ? "Yearly"
                  : "Monthly"
                : null,
            ],
            ["Price", recurringPrice],
            ["Paid plan starts", billing.trial_ends_at ? formatWhen(billing.trial_ends_at) : null],
            [
              billing.cancel_at_period_end ? "Ends" : "Renews",
              billing.current_period_end && !billing.trial_ends_at
                ? formatWhen(billing.current_period_end)
                : null,
            ],
          ])
        : null,
      billing?.scheduled_change?.active ||
      (billing?.pending_plan && !billing?.cancel_at_period_end)
        ? createElement(
            "div",
            {
              className: "account-scheduled-change-panel",
              role: "status",
            },
            createElement(
              "strong",
              null,
              billing?.scheduled_change?.kind === "downgrade" ||
                billing?.pending_plan === "plus"
                ? "Downgrade scheduled"
                : "Scheduled change",
            ),
            createElement(
              "p",
              { className: "account-scheduled-change-target" },
              `${planDisplayName(
                billing,
                billing.pending_plan || billing.subscribed_plan?.key,
              )} ${
                (billing.pending_interval || billing.interval) === "yearly"
                  ? "Yearly"
                  : "Monthly"
              }`,
            ),
            createElement(
              "p",
              null,
              scheduledSummary?.effectiveAt || scheduledDowngradeAt
                ? `Begins ${scheduledSummary?.effectiveAt || scheduledDowngradeAt}`
                : "Begins at period end",
            ),
            createElement(
              "p",
              { className: "account-panel-note" },
              scheduledSummary?.pendingLabel ||
                (billing.pending_plan === "plus" && scheduledDowngradeAt
                  ? `Business remains active until ${scheduledDowngradeAt}. Plus begins on ${scheduledDowngradeAt}.`
                  : "Your current plan remains active until then."),
            ),
            actions.can_cancel_scheduled_change
              ? createElement(
                  "button",
                  {
                    type: "button",
                    className: "btn-secondary btn-sm",
                    disabled: Boolean(busyAction),
                    onClick: () => onCancelScheduledChange?.(),
                  },
                  busyAction === "cancel-schedule"
                    ? "Canceling…"
                    : "Cancel scheduled change",
                )
              : actions.can_cancel_scheduled_downgrade
                ? createElement(
                    "button",
                    {
                      type: "button",
                      className: "btn-secondary btn-sm",
                      disabled: Boolean(busyAction),
                      onClick: () => onCancelScheduledDowngrade?.(),
                    },
                    busyAction === "cancel-downgrade"
                      ? "Canceling…"
                      : "Cancel downgrade",
                  )
                : null,
          )
        : null,
      billing?.cancel_at_period_end
        ? createElement(
            "div",
            { className: "account-scheduled-action", role: "status" },
            createElement("strong", null, "Cancellation scheduled"),
            createElement(
              "p",
              null,
              scheduledCancelAt
                ? `Your current plan remains active until ${scheduledCancelAt}. Basic begins after that date. Data is preserved.`
                : "Your current plan remains active until the scheduled end date.",
            ),
            actions.can_resume_subscription
              ? createElement(
                  "button",
                  {
                    type: "button",
                    className: "btn-primary btn-sm",
                    disabled: Boolean(busyAction),
                    onClick: handleResume,
                  },
                  busyAction === "resume" ? "Resuming…" : "Resume subscription",
                )
              : null,
          )
        : null,
    ),

    // 2. Upgrade Plan
    createElement(
      PanelBlock,
      {
        title: highestPlan ? "Billing interval" : "Upgrade plan",
        description: highestPlan
          ? "You're on our highest plan. Switch billing interval if you need to."
          : "Upgrades, recommended offers, and billing interval changes.",
      },
      highestPlan
        ? createElement(
            "p",
            { className: "account-highest-plan-note", role: "status" },
            "You're on our highest plan.",
          )
        : null,
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
      catalogPromo?.active && planKey === "basic"
        ? createElement(
            "p",
            { className: "account-panel-note account-promo-banner", role: "status" },
            `${catalogPromo.label || "Promotion"}: ${catalogPromo.summary || ""}`,
          )
        : null,
      checkoutPromoWarning
        ? createElement(
            "p",
            {
              className: "account-panel-note account-panel-note-warning",
              role: "note",
            },
            checkoutPromoWarning,
          )
        : null,
      upgradeOptions.length
        ? createElement(
            "div",
            {
              className: "account-plan-options account-plan-options-upgrade",
              "aria-label": highestPlan ? "Billing interval options" : "Upgrade options",
            },
            upgradeOptions.map((option) => renderUpgradeCard(option)),
          )
        : !highestPlan
          ? createElement(
              "p",
              { className: "account-panel-note" },
              "No upgrade options are available for this subscription right now.",
            )
          : null,
      renderScheduleConfirmationArea(),
      renderUpgradeConfirmationArea(),
    ),

    // 3. Usage & limits — always current effective plan
    createElement(
      PanelBlock,
      {
        title: "Usage & limits",
        description: "Capacity for your current effective plan.",
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

    // 4. Downgrade Plan
    downgradeOptions.length
      ? createElement(
          PanelBlock,
          {
            title: "Downgrade plan",
            description: "Choose a lower plan if needed.",
          },
          createElement(
            "button",
            {
              type: "button",
              className: "btn-secondary btn-sm account-downgrade-toggle",
              "aria-expanded": downgradeExpanded ? "true" : "false",
              "aria-controls": "account-downgrade-options",
              onClick: () => setDowngradeExpanded((open) => !open),
            },
            downgradeExpanded ? "Hide downgrade options ▴" : "Show downgrade options ▾",
          ),
          downgradeExpanded ||
          confirmDowngrade ||
          Boolean(downgradeError) ||
          busyAction === "downgrade" ||
          downgradeTarget?.kind === "cancel_to_basic"
            ? createElement(
                "div",
                {
                  id: "account-downgrade-options",
                  className: "account-plan-options account-plan-options-downgrade",
                  hidden: !(
                    downgradeExpanded ||
                    confirmDowngrade ||
                    Boolean(downgradeError) ||
                    busyAction === "downgrade" ||
                    downgradeTarget?.kind === "cancel_to_basic"
                  )
                    ? true
                    : undefined,
                },
                (downgradeExpanded ? downgradeOptions : []).map((option) =>
                  createElement(
                    PlanOptionCard,
                    {
                      key: option.id,
                      planKey: option.plan,
                      title: option.title,
                      priceLabel: option.pricing?.firstPeriodWithInterval || "Free",
                      isCurrent: false,
                      recommended: false,
                    },
                    createElement(
                      "button",
                      {
                        type: "button",
                        className: "btn-secondary btn-sm",
                        disabled: Boolean(busyAction) || !option.enabled,
                        "aria-label": option.actionLabel,
                        onClick: () => {
                          clearUpgradeConfirms();
                          setLocalError("");
                          if (option.kind === "cancel_to_basic") {
                            setDowngradeTarget(option);
                            setConfirmCancel(true);
                            setConfirmDowngrade(false);
                            return;
                          }
                          setDowngradeTarget(option);
                          setDowngradeError("");
                          setConfirmDowngrade(true);
                        },
                      },
                      option.actionLabel,
                    ),
                  ),
                ),
                renderDowngradeConfirmationArea(),
              )
            : null,
        )
      : null,

    // 5. Plan actions — cancellation only
    hasPlanActionBlock
      ? createElement(
          PanelBlock,
          {
            title: "Plan actions",
            description: "Manage your subscription.",
          },
          actions.can_cancel && !billing?.cancel_at_period_end
            ? createElement(
                "div",
                { className: "account-cancel-block" },
                downgradeTarget?.kind === "cancel_to_basic"
                  ? createElement(
                      "p",
                      { className: "account-panel-note" },
                      "Confirm moving to Basic in Downgrade plan above.",
                    )
                  : !confirmCancel
                    ? createElement(
                        "button",
                        {
                          type: "button",
                          className: "btn-secondary",
                          disabled: Boolean(busyAction),
                          onClick: () => {
                            clearDowngradeConfirms();
                            setConfirmCancel(true);
                          },
                        },
                        "Cancel subscription",
                      )
                    : createElement(CancellationConfirmPanel, {
                        billing,
                        busyAction,
                        onKeep: () => setConfirmCancel(false),
                        onConfirm: async () => {
                          setLocalError("");
                          try {
                            await onCancelSubscription?.();
                            setConfirmCancel(false);
                          } catch (err) {
                            setLocalError(actionErrorMessage(err));
                          }
                        },
                      }),
              )
            : null,
        )
      : null,
  );
}
