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
import { formatDate, formatDateTime } from "./i18n/format.js";
import i18n from "./i18n/index.js";
import { translatePlanName } from "./i18n/plans.js";
import {
  catalogPromotion,
  isAcquisitionPromotion,
  localizedPromotionSummary,
  promotionCheckoutWarning,
} from "./promotionCatalog.js";
import { pricingTemplateClass } from "./pricingTemplates.js";
import PricingCardsLoadingState from "./PricingCardsLoadingState.js";
import { PromotionalText } from "./promotionalText.js";
import {
  buildDowngradePlanOptions,
  buildUpgradePlanOptions,
  effectiveBillingInterval,
  effectivePlanKey,
  futurePaidPlanSelection,
  isBuiltinTrialSelectionMode,
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
  if (!data) return error.message || i18n.t("errors:generic");
  if (typeof data.detail === "string") return data.detail;
  return i18n.t("errors:generic");
}

function formatWhen(iso) {
  if (!iso) return null;
  return formatDateTime(iso, i18n.language) || iso;
}

function formatWhenDate(iso) {
  if (!iso) return null;
  return formatDate(iso, i18n.language) || iso;
}

function translatePlan(billing, planKey, fallback = "") {
  const catalogFallback =
    planKey === "basic"
      ? billing?.catalog?.basic?.display_name
      : billing?.catalog?.plans?.[planKey]?.display_name;
  return translatePlanName((key, opts) => i18n.t(key, opts), planKey, fallback || catalogFallback || planKey);
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
  isSelectedFuture = false,
  recommended,
  templateClass,
  children,
}) {
  const classes = ["account-plan-option"];
  classes.push(templateClass || "pricing-template-normal");
  if (isCurrent || isSelectedFuture) classes.push("is-current");
  if (recommended) classes.push("is-recommended");
  if (isScheduled) classes.push("is-scheduled");
  return createElement(
    "article",
    { className: classes.join(" "), "data-plan": planKey },
    createElement(
      "header",
      { className: "account-plan-option-header" },
      createElement("h4", null, title),
      isSelectedFuture
        ? createElement(
            "span",
            { className: "account-plan-option-badge" },
            i18n.t("billing:trialSelection.selectedBadge"),
          )
        : isCurrent
        ? createElement("span", { className: "account-plan-option-badge" }, i18n.t("billing:currentPlan.badge"))
        : isScheduled
          ? createElement(
              "span",
              { className: "account-plan-option-badge account-plan-option-badge-scheduled" },
              scheduledLabel || i18n.t("billing:currentPlan.scheduled"),
            )
          : recommended
            ? createElement(
                "span",
                {
                  className:
                    "account-plan-option-badge account-plan-option-badge-recommended",
                },
                i18n.t("billing:currentPlan.recommended"),
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
          i18n.t("billing:currentPlan.normally", { price: listPriceLabel }),
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
  const planName = translatePlan(
    billing,
    planKey,
    entitlements?.plan?.display_name || billing?.effective_plan?.display_name,
  );
  const currentInterval = effectiveBillingInterval(billing);
  const usageRows = subscriptionUsageRows(entitlements);
  const actions = billing?.actions || {};
  const pricingCatalogResolved =
    !billingLoading && Boolean(billing || billingError);
  const templateClass = pricingCatalogResolved
    ? pricingTemplateClass(billing?.catalog)
    : null;

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
  const discountT = (key, opts) => i18n.t(`billing:promoDiscount.${key}`, opts);
  const catalogPromoSummary = localizedPromotionSummary(billing?.catalog, discountT);
  const checkoutPromoWarning = promotionCheckoutWarning(billing?.catalog);
  const upgradeOptions = buildUpgradePlanOptions(billing, sessionPlanKey);
  const downgradeOptions = buildDowngradePlanOptions(billing, sessionPlanKey);
  const trialSelectionMode = isBuiltinTrialSelectionMode(billing);
  const futureSelection = futurePaidPlanSelection(billing);
  const highestPlan = !trialSelectionMode && isHighestPaidPlan(billing, sessionPlanKey);
  const scheduledCancelAt = formatWhenDate(
    billing?.pending_change_effective_at ||
      billing?.current_period_end ||
      billing?.trial_ends_at,
  );
  const scheduledDowngradeAt = formatWhenDate(billing?.pending_change_effective_at);
  const hasPlanActionBlock = Boolean(actions.can_cancel || actions.can_resume_subscription);
  const futurePlanLabel = futureSelection
    ? `${planDisplayName(billing, futureSelection.plan)} ${
        futureSelection.interval === "yearly"
          ? i18n.t("billing:interval.yearly")
          : i18n.t("billing:interval.monthly")
      }`
    : null;

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
        "aria-label": i18n.t("billing:scheduledChange.scheduleAria"),
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
          i18n.t("common:cancel"),
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
          busyAction === "schedule-change"
            ? i18n.t("billing:upgrade.scheduling")
            : i18n.t("billing:upgrade.confirmChange"),
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
          "aria-label": i18n.t("billing:scheduledChange.upgradeAria"),
        },
        createElement("p", { className: "account-panel-note" }, i18n.t("billing:upgrade.previewLoading")),
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
          "aria-label": i18n.t("billing:scheduledChange.upgradeAria"),
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
        "aria-label": i18n.t("billing:scheduledChange.upgradeAria"),
      },
      createElement(
        "p",
        null,
        i18n.t("billing:upgrade.upgradeToday", { amount: upgradePreview.amount_due_formatted }),
      ),
      createElement(
        "p",
        { className: "account-panel-note" },
        i18n.t("billing:upgrade.renewsAt", {
          amount: upgradePreview.recurring_formatted,
          unit:
            upgradePreview.recurring_interval === "yearly"
              ? i18n.t("billing:interval.year")
              : i18n.t("billing:interval.month"),
          date: upgradePreview.next_renewal_at
            ? i18n.t("billing:upgrade.onDate", { date: formatWhen(upgradePreview.next_renewal_at) })
            : "",
        }),
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
          i18n.t("common:cancel"),
        ),
        createElement(
          "button",
          {
            type: "button",
            className: "btn-primary btn-sm",
            disabled: Boolean(busyAction),
            onClick: handleConfirmUpgrade,
          },
          busyAction === "upgrade"
            ? i18n.t("billing:upgrade.confirming")
            : i18n.t("billing:upgrade.confirmUpgrade"),
        ),
      ),
    );
  }

  function renderUpgradeCard(option) {
    const pricing = option.pricing || targetOfferPricing(billing, option.plan, option.interval);
    const isCurrent = !trialSelectionMode && isEffectiveCurrentPlanOption(
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
            ? i18n.t("billing:currentPlan.firstYear")
            : i18n.t("billing:currentPlan.firstMonth")
          : option.interval === "yearly"
            ? i18n.t("billing:currentPlan.perYear")
            : i18n.t("billing:currentPlan.perMonth"),
        listPriceLabel: pricing.promotional ? pricing.listWithInterval : null,
        priceNote: pricing.label,
        renewsLabel:
          pricing.promotional && pricing.renewsAtWithInterval
            ? i18n.t("billing:currentPlan.thenRenews", { price: pricing.renewsAtWithInterval })
            : null,
        isCurrent,
        isScheduled,
        isSelectedFuture: Boolean(option.selectedFuture),
        scheduledLabel: scheduledSummary?.effectiveAt
          ? i18n.t("billing:scheduledChange.changesOn", { date: scheduledSummary.effectiveAt })
          : i18n.t("billing:currentPlan.scheduled"),
        recommended: option.recommended && !isCurrent && !isScheduled && !option.selectedFuture,
        templateClass,
      },
      option.kind === "checkout"
        ? createElement(
            "button",
            {
              type: "button",
              className: option.selectedFuture ? "btn-secondary btn-sm" : "btn-primary btn-sm",
              disabled: Boolean(busyAction) || !option.enabled || Boolean(option.selectedFuture),
              "aria-label": option.actionLabel,
              onClick: () => {
                if (!option.enabled || option.selectedFuture) return;
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
        createElement("p", { className: "account-panel-note" }, i18n.t("billing:downgrade.scheduling")),
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
        i18n.t("billing:downgrade.lockNote"),
      ),
    );
  }

  return createElement(
    "div",
    { className: "account-panel account-panel-subscription", "data-tutorial-target": "account-subscription" },
    confirmingCheckout
      ? createElement(
          "div",
          {
            className: "account-billing-banner account-billing-banner-confirming",
            role: "status",
          },
          createElement("strong", null, i18n.t("billing:confirmingCheckout.title")),
          createElement(
            "p",
            null,
            i18n.t("billing:confirmingCheckout.body"),
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
          createElement("strong", null, i18n.t("billing:builtinTrial.title")),
          createElement(
            "p",
            null,
            billing.builtin_trial.ends_at
              ? i18n.t("billing:builtinTrial.withDate", {
                  date: formatWhen(billing.builtin_trial.ends_at),
                })
              : i18n.t("billing:builtinTrial.generic"),
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
          createElement("strong", null, i18n.t("billing:paymentIssue.title")),
          createElement(
            "p",
            null,
            i18n.t("billing:paymentIssue.graceSubscription", {
              deadline:
                formatWhen(billing.payment_issue.grace_deadline) ||
                i18n.t("billing:paymentIssue.pending"),
            }),
          ),
          createElement(
            NavLink,
            { to: "/account/billing", className: "btn-secondary btn-sm" },
            i18n.t("billing:paymentIssue.openBilling"),
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
        title: i18n.t("billing:currentPlan.title"),
        description: i18n.t("billing:currentPlan.description"),
      },
      createElement(
        "div",
        { className: "account-panel-stat" },
        createElement("span", { className: "account-panel-stat-label" }, i18n.t("billing:currentPlan.effectivePlan")),
        createElement(
          "strong",
          {
            className: planName
              ? "account-panel-stat-value"
              : "account-panel-stat-value account-panel-stat-muted",
          },
          planName || i18n.t("billing:currentPlan.unavailable"),
        ),
        createElement(
          "p",
          { className: "account-panel-note" },
          billingLoading
            ? i18n.t("billing:currentPlan.loading")
            : isApple
              ? i18n.t("billing:currentPlan.appleNote")
              : billing?.builtin_trial?.active
                ? i18n.t("billing:currentPlan.trialNote")
                : i18n.t("billing:currentPlan.stripeNote"),
        ),
      ),
      billing && !billingLoading
        ? MetaPairs([
            [i18n.t("billing:currentPlan.billingStatus"), statusLabelForBilling(billing)],
            [
              i18n.t("billing:currentPlan.trialEnds"),
              billing.builtin_trial?.active && billing.builtin_trial?.ends_at
                ? formatWhen(billing.builtin_trial.ends_at)
                : null,
            ],
            [
              i18n.t("billing:trialSelection.selectedPlan"),
              trialSelectionMode ? futurePlanLabel || i18n.t("billing:trialSelection.noneSelected") : null,
            ],
            [
              i18n.t("billing:currentPlan.interval"),
              !trialSelectionMode && currentInterval
                ? currentInterval === "yearly"
                  ? i18n.t("billing:interval.yearly")
                  : i18n.t("billing:interval.monthly")
                : null,
            ],
            [i18n.t("billing:currentPlan.price"), trialSelectionMode ? null : recurringPrice],
            [
              i18n.t("billing:currentPlan.paidPlanStarts"),
              trialSelectionMode && futureSelection && billing.trial_ends_at
                ? formatWhen(billing.trial_ends_at)
                : !trialSelectionMode && billing.trial_ends_at
                  ? formatWhen(billing.trial_ends_at)
                  : null,
            ],
            [
              billing.cancel_at_period_end
                ? i18n.t("billing:currentPlan.ends")
                : i18n.t("billing:currentPlan.renews"),
              !trialSelectionMode && billing.current_period_end && !billing.trial_ends_at
                ? formatWhen(billing.current_period_end)
                : null,
            ],
          ])
        : null,
      !trialSelectionMode &&
      (billing?.scheduled_change?.active ||
        (billing?.pending_plan && !billing?.cancel_at_period_end))
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
                ? i18n.t("billing:scheduledChange.downgradeScheduled")
                : i18n.t("billing:scheduledChange.title"),
            ),
            createElement(
              "p",
              { className: "account-scheduled-change-target" },
              `${translatePlan(
                billing,
                billing.pending_plan || billing.subscribed_plan?.key,
              )} ${
                (billing.pending_interval || billing.interval) === "yearly"
                  ? i18n.t("billing:interval.yearly")
                  : i18n.t("billing:interval.monthly")
              }`,
            ),
            createElement(
              "p",
              null,
              scheduledSummary?.effectiveAt || scheduledDowngradeAt
                ? i18n.t("billing:scheduledChange.begins", {
                    date: scheduledSummary?.effectiveAt || scheduledDowngradeAt,
                  })
                : i18n.t("billing:scheduledChange.beginsPeriodEnd"),
            ),
            createElement(
              "p",
              { className: "account-panel-note" },
              scheduledSummary?.pendingLabel ||
                (billing.pending_plan === "plus" && scheduledDowngradeAt
                  ? i18n.t("billing:scheduledChange.plusDowngrade", { date: scheduledDowngradeAt })
                  : i18n.t("billing:scheduledChange.currentRemains")),
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
                    ? i18n.t("billing:scheduledChange.canceling")
                    : i18n.t("billing:scheduledChange.cancelChange"),
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
                      ? i18n.t("billing:scheduledChange.canceling")
                      : i18n.t("billing:scheduledChange.cancelDowngrade"),
                  )
                : null,
          )
        : null,
      !trialSelectionMode && billing?.cancel_at_period_end
        ? createElement(
            "div",
            { className: "account-scheduled-action", role: "status" },
            createElement("strong", null, i18n.t("billing:cancellation.scheduled")),
            createElement(
              "p",
              null,
              scheduledCancelAt
                ? i18n.t("billing:cancellation.activeUntilDate", { date: scheduledCancelAt })
                : i18n.t("billing:cancellation.activeUntilGeneric"),
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
                  busyAction === "resume"
                    ? i18n.t("billing:cancellation.resuming")
                    : i18n.t("billing:cancellation.resume"),
                )
              : null,
          )
        : null,
    ),

    // 2. Plan selection (trial) or Upgrade Plan (paid)
    createElement(
      PanelBlock,
      {
        title: trialSelectionMode
          ? i18n.t("billing:trialSelection.title")
          : highestPlan
            ? i18n.t("billing:upgrade.billingIntervalTitle")
            : i18n.t("billing:upgrade.title"),
        description: trialSelectionMode
          ? i18n.t("billing:trialSelection.description")
          : highestPlan
            ? i18n.t("billing:upgrade.billingIntervalDescription")
            : i18n.t("billing:upgrade.description"),
      },
      !trialSelectionMode && highestPlan
        ? createElement(
            "p",
            { className: "account-highest-plan-note", role: "status" },
            i18n.t("billing:upgrade.highestPlan"),
          )
        : null,
      !stripeConfigured && !isApple
        ? createElement(
            "p",
            { className: "account-panel-note" },
            i18n.t("billing:upgrade.stripeNotConfigured"),
          )
        : null,
      isApple
        ? createElement(
            "p",
            { className: "account-panel-note" },
            i18n.t("billing:upgrade.appleNote"),
          )
        : null,
      pricingCatalogResolved
        ? createElement(PromotionalText, {
            catalog: billing?.catalog,
            className: "account-panel-note account-promotional-text",
          })
        : null,
      pricingCatalogResolved && isAcquisitionPromotion(billing?.catalog)
        ? createElement(
            "p",
            { className: "account-panel-note account-promo-banner", role: "status" },
            `${catalogPromo.label || "Promotion"}: ${catalogPromoSummary || ""}`,
          )
        : null,
      pricingCatalogResolved && checkoutPromoWarning
        ? createElement(
            "p",
            {
              className: "account-panel-note account-panel-note-warning",
              role: "note",
            },
            checkoutPromoWarning,
          )
        : null,
      !pricingCatalogResolved
        ? createElement(PricingCardsLoadingState, { cardCount: 2, compact: true })
        : upgradeOptions.length
        ? createElement(
            "div",
            {
              className: "account-plan-options account-plan-options-upgrade",
              "aria-label": trialSelectionMode
                ? i18n.t("billing:trialSelection.optionsAria")
                : highestPlan
                ? i18n.t("billing:upgrade.billingIntervalAria")
                : i18n.t("billing:upgrade.optionsAria"),
            },
            upgradeOptions.map((option) => renderUpgradeCard(option)),
          )
        : !highestPlan && !trialSelectionMode
          ? createElement(
              "p",
              { className: "account-panel-note" },
              i18n.t("billing:upgrade.noOptions"),
            )
          : null,
      renderScheduleConfirmationArea(),
      renderUpgradeConfirmationArea(),
    ),

    // 3. Usage & limits — always current effective plan
    createElement(
      PanelBlock,
      {
        title: i18n.t("billing:usage.title"),
        description: i18n.t("billing:usage.description"),
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
            createElement("p", null, i18n.t("billing:usage.unavailable")),
          ),
    ),

    // 4. Downgrade Plan (paid commercial only — never during built-in trial)
    !trialSelectionMode && downgradeOptions.length
      ? createElement(
          PanelBlock,
          {
            title: i18n.t("billing:downgrade.title"),
            description: i18n.t("billing:downgrade.description"),
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
            downgradeExpanded
              ? i18n.t("billing:downgrade.hideOptions")
              : i18n.t("billing:downgrade.showOptions"),
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
                      priceLabel: option.pricing?.firstPeriodWithInterval || i18n.t("billing:downgrade.free"),
                      isCurrent: false,
                      recommended: false,
                      templateClass,
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

    // 5. Plan actions — cancel selected future plan (trial) or cancel subscription
    hasPlanActionBlock
      ? createElement(
          PanelBlock,
          {
            title: trialSelectionMode
              ? i18n.t("billing:trialSelection.actionsTitle")
              : i18n.t("billing:planActions.title"),
            description: trialSelectionMode
              ? i18n.t("billing:trialSelection.actionsDescription")
              : i18n.t("billing:planActions.description"),
          },
          actions.can_cancel && !billing?.cancel_at_period_end
            ? createElement(
                "div",
                { className: "account-cancel-block" },
                downgradeTarget?.kind === "cancel_to_basic"
                  ? createElement(
                      "p",
                      { className: "account-panel-note" },
                      i18n.t("billing:downgrade.confirmInSection"),
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
                        trialSelectionMode
                          ? i18n.t("billing:trialSelection.cancelSelected")
                          : i18n.t("billing:planActions.cancelSubscription"),
                      )
                    : createElement(CancellationConfirmPanel, {
                        billing,
                        busyAction,
                        confirmLabel: trialSelectionMode
                          ? i18n.t("billing:trialSelection.confirmCancelSelected")
                          : undefined,
                        body: trialSelectionMode
                          ? i18n.t("billing:trialSelection.cancelSelectedBody")
                          : undefined,
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
