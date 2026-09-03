import { createElement } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { visibleAccountSections } from "./accountNavigation.js";
import { externalLinkProps } from "./billingExternalLinks.js";
import { formatDate, formatDateTime } from "./i18n/format.js";
import i18n from "./i18n/index.js";
import { translatePlanName } from "./i18n/plans.js";
import { promotionPriceNote } from "./promotionCatalog.js";
import {
  catalogListPriceWithInterval,
  planDisplayName,
  targetOfferPricing,
} from "./subscriptionPlanOptions.js";

const ACCOUNT_SECTION_LABEL_KEYS = {
  security: "accountSections.security",
  subscription: "accountSections.subscription",
  billing: "accountSections.billing",
  info: "accountSections.info",
  tutorial: "accountSections.tutorial",
  status: "accountSections.status",
};

export function AccountSubNav({ session = null }) {
  const { t } = useTranslation(["workspace", "account"]);
  const sections = visibleAccountSections(session);
  return createElement(
    "nav",
    {
      className: "account-subnav",
      "aria-label": t("account:subNavAriaLabel"),
      "data-tutorial-target": "account-navigation",
    },
    sections.map((section) =>
      createElement(
        NavLink,
        {
          key: section.id,
          to: section.path,
          end: true,
          className: ({ isActive }) =>
            isActive ? "account-subnav-link is-active" : "account-subnav-link",
        },
        t(ACCOUNT_SECTION_LABEL_KEYS[section.id] || section.id, {
          defaultValue: section.label,
        }),
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
  const periodEnd = effectiveAt || i18n.t("billing:scheduledChange.periodEnd");
  const targetPlan = billing.pending_plan || billing.subscribed_plan?.key;
  const targetInterval = billing.pending_interval || billing.interval;
  const currentPlan = billing.subscribed_plan?.key || billing.effective_plan?.key;
  const currentInterval = billing.interval;
  const targetPlanName = translatePlan(billing, targetPlan);
  const currentPlanName =
    translatePlan(billing, currentPlan) || i18n.t("billing:currentPlan.badge");
  const targetIntervalLabel =
    targetInterval === "yearly"
      ? i18n.t("billing:interval.yearly")
      : i18n.t("billing:interval.monthly");
  const currentIntervalLabel =
    currentInterval === "yearly"
      ? i18n.t("billing:interval.yearly")
      : i18n.t("billing:interval.monthly");
  const pricing = targetOfferPricing(billing, targetPlan, targetInterval);
  const kind = billing.scheduled_change?.kind;
  const periodWord =
    targetInterval === "yearly"
      ? i18n.t("billing:interval.year")
      : i18n.t("billing:interval.period");
  const chargeLines = pricing.promotional
    ? [
        i18n.t("billing:scheduledChange.firstPeriod", {
          period: periodWord,
          amount: pricing.firstPeriodFormatted,
        }),
        i18n.t("billing:scheduledChange.futureRenewals", {
          amount:
            pricing.renewsAtWithInterval?.replace("/", ` ${i18n.t("billing:perUnit")} `) ||
            pricing.listWithInterval,
        }),
      ]
    : [
        pricing.listWithInterval
          ? i18n.t("billing:scheduledChange.chargedThen", {
              amount: pricing.listWithInterval.replace("/", ` ${i18n.t("billing:perUnit")} `),
            })
          : null,
      ];
  if (kind === "interval") {
    const switchInterval =
      targetInterval === "yearly"
        ? i18n.t("billing:scheduledChange.switchYearly")
        : i18n.t("billing:scheduledChange.switchMonthly");
    return {
      title: switchInterval,
      lead: i18n.t("billing:scheduledChange.remainsActiveUntil", {
        plan: currentPlanName,
        interval: currentIntervalLabel,
        date: periodEnd,
      }),
      bullets: [
        i18n.t("billing:scheduledChange.yearlyBegins", {
          interval: targetIntervalLabel,
          date: periodEnd,
        }),
        ...chargeLines,
        i18n.t("billing:scheduledChange.newPeriodStarts"),
      ].filter(Boolean),
      pendingLabel: `${i18n.t("billing:scheduledChange.remainsActiveUntil", {
        plan: currentPlanName,
        interval: currentIntervalLabel,
        date: periodEnd,
      })} ${i18n.t("billing:scheduledChange.planBeginsThen", {
        plan: targetPlanName,
        interval: targetIntervalLabel,
        date: periodEnd,
      })}`,
      targetPlan,
      targetInterval,
      effectiveAt,
    };
  }
  return {
    title: i18n.t("billing:scheduledChange.title"),
    lead: i18n.t("billing:scheduledChange.remainsActiveUntil", {
      plan: currentPlanName,
      interval: currentIntervalLabel,
      date: periodEnd,
    }),
    bullets: [
      i18n.t("billing:scheduledChange.planBeginsOn", {
        plan: targetPlanName,
        interval: targetIntervalLabel,
        date: periodEnd,
      }),
      ...chargeLines,
      i18n.t("billing:scheduledChange.noChangeBefore"),
    ].filter(Boolean),
    pendingLabel: `${i18n.t("billing:scheduledChange.planBeginsThen", {
      plan: targetPlanName,
      interval: targetIntervalLabel,
      date: periodEnd,
    })} ${i18n.t("billing:scheduledChange.currentRemains")}`,
    targetPlan,
    targetInterval,
    effectiveAt,
  };
}

export function scheduleChangePreviewCopy(billing, planKey, interval) {
  const effectiveAt = formatWhenDate(billing?.current_period_end || billing?.trial_ends_at);
  const periodEnd = effectiveAt || i18n.t("billing:scheduledChange.periodEnd");
  const currentPlan = billing?.subscribed_plan?.key || billing?.effective_plan?.key;
  const currentInterval = billing?.interval;
  const currentPlanName = translatePlan(billing, currentPlan) || i18n.t("billing:currentPlan.badge");
  const targetPlanName = translatePlan(billing, planKey);
  const targetIntervalLabel =
    interval === "yearly" ? i18n.t("billing:interval.yearly") : i18n.t("billing:interval.monthly");
  const currentIntervalLabel =
    currentInterval === "yearly"
      ? i18n.t("billing:interval.yearly")
      : i18n.t("billing:interval.monthly");
  const pricing = targetOfferPricing(billing, planKey, interval);
  const intervalOnly = planKey === currentPlan && interval !== currentInterval;
  const title = intervalOnly
    ? interval === "yearly"
      ? i18n.t("billing:upgrade.switchYearly")
      : i18n.t("billing:upgrade.switchMonthly")
    : planKey === "business" && interval === "yearly"
      ? i18n.t("billing:upgrade.upgradeBusinessYearly")
      : planKey === "plus" && interval === "yearly"
        ? i18n.t("billing:upgrade.upgradePlusYearly")
        : i18n.t("billing:upgrade.switchToPlan", {
            plan: targetPlanName,
            interval: targetIntervalLabel,
          });
  const lead = i18n.t("billing:scheduledChange.remainsActiveUntil", {
    plan: currentPlanName,
    interval: currentIntervalLabel,
    date: periodEnd,
  });
  const periodWord =
    interval === "yearly" ? i18n.t("billing:interval.year") : i18n.t("billing:interval.period");
  const chargeBullets = pricing.promotional
    ? [
        i18n.t("billing:scheduledChange.firstPeriod", {
          period: periodWord,
          amount: pricing.firstPeriodFormatted,
        }),
        i18n.t("billing:scheduledChange.futureRenewals", {
          amount:
            pricing.renewsAtWithInterval?.replace("/", ` ${i18n.t("billing:perUnit")} `) ||
            pricing.listWithInterval,
        }),
      ]
    : [
        pricing.listWithInterval
          ? i18n.t("billing:scheduledChange.charged", {
              amount: pricing.listWithInterval.replace("/", ` ${i18n.t("billing:perUnit")} `),
            })
          : null,
      ];
  const bullets = intervalOnly
    ? [
        i18n.t("billing:scheduledChange.yearlyBeginsThen", {
          date: periodEnd,
          interval: targetIntervalLabel,
        }),
        ...chargeBullets,
        i18n.t("billing:scheduledChange.newPeriodStartsThen"),
      ]
    : [
        i18n.t("billing:scheduledChange.planBegins", {
          date: periodEnd,
          plan: targetPlanName,
          interval: targetIntervalLabel,
        }),
        ...chargeBullets,
        i18n.t("billing:scheduledChange.staysActiveUntil", {
          plan: currentPlanName,
          interval: currentIntervalLabel,
        }),
      ];
  return {
    title,
    lead,
    bullets: bullets.filter(Boolean),
  };
}

/** Workspace that may start a paid checkout (Stripe may still be off).

Entitlement may be Basic or built-in Business; commercial status is the gate.
*/
export function isBasicPaidCheckoutCandidate(billing, planKey) {
  if (!billing || billing.purchase_source === "apple") return false;
  if (billing.managed_by_platform) return false;
  const status = billing.status;
  return !status || status === "none" || status === "canceled";
}

export function statusLabelForBilling(billing) {
  if (!billing) return i18n.t("billing:status.loading");
  if (billing.payment_issue?.active) return i18n.t("billing:status.paymentGrace");
  if (billing.cancel_at_period_end) return i18n.t("billing:status.cancellationScheduled");
  if (billing.scheduled_change?.active) return i18n.t("billing:status.changeScheduled");
  if (billing.pending_plan === "plus" && billing.subscribed_plan?.key === "business") {
    return i18n.t("billing:status.downgradeScheduled");
  }
  if (billing.builtin_trial?.active) return i18n.t("billing:status.builtinTrial");
  if (billing.status === "trialing") return i18n.t("billing:status.trialing");
  if (billing.status === "active") return i18n.t("billing:status.active");
  if (billing.status === "canceled") return i18n.t("billing:status.ended");
  return i18n.t("billing:status.noPaidSubscription");
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
      i18n.t("billing:cancellation.title"),
    ),
    createElement(
      "p",
      { className: "account-cancel-confirm-lead" },
      i18n.t("billing:cancellation.activeUntil"),
    ),
    createElement(
      "p",
      { className: "account-cancel-confirm-date" },
      accessEnd || i18n.t("billing:cancellation.scheduledEnd"),
    ),
    createElement(
      "div",
      { className: "account-cancel-confirm-after" },
      createElement("p", { className: "account-cancel-confirm-after-label" }, i18n.t("billing:cancellation.afterThat")),
      createElement(
        "ul",
        { className: "account-cancel-confirm-list" },
        createElement("li", null, i18n.t("billing:cancellation.movesToBasic")),
        createElement("li", null, i18n.t("billing:cancellation.dataPreserved")),
        createElement("li", null, i18n.t("billing:cancellation.basicLimits")),
        createElement("li", null, i18n.t("billing:cancellation.notDeleted")),
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
        i18n.t("billing:cancellation.keep"),
      ),
      createElement(
        "button",
        {
          type: "button",
          className: "btn-danger btn-sm",
          disabled: Boolean(busyAction),
          onClick: onConfirm,
        },
        busyAction === "cancel"
          ? i18n.t("billing:cancellation.canceling")
          : i18n.t("billing:cancellation.confirm"),
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
  const intervalLabel =
    interval === "yearly" ? i18n.t("billing:interval.yearly") : i18n.t("billing:interval.monthly");
  const targetPrice = catalogPriceWithInterval(billing, "plus", interval);
  const when = formatWhen(billing?.current_period_end) || i18n.t("billing:scheduledChange.periodEnd");
  return createElement(
    "div",
    {
      id: "account-downgrade-confirmation",
      className: "account-upgrade-preview",
      role: "region",
      "aria-label": i18n.t("billing:scheduledChange.downgradeAria"),
    },
    createElement(
      "p",
      null,
      i18n.t("billing:scheduledChange.keepUntilPlus", { date: when, interval: intervalLabel }),
    ),
    targetPrice
      ? createElement(
          "p",
          { className: "account-panel-note" },
          i18n.t("billing:scheduledChange.chargedThen", {
            amount: targetPrice.replace("/", ` ${i18n.t("billing:perUnit")} `),
          }),
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
        i18n.t("billing:scheduledChange.keepBusiness"),
      ),
      createElement(
        "button",
        {
          type: "button",
          className: "btn-primary btn-sm",
          disabled: Boolean(busyAction),
          onClick: onConfirm,
        },
        busyAction === "downgrade"
          ? i18n.t("billing:upgrade.scheduling")
          : i18n.t("billing:downgrade.confirm"),
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
      ? createElement("p", { className: "account-panel-note" }, i18n.t("billing:billingPanel.loadingInvoices"))
      : invoicesError
        ? createElement(
            "p",
            { className: "account-panel-note account-panel-note-warning", role: "alert" },
            invoicesError,
          )
        : invoices.length === 0
          ? createElement("p", { className: "account-panel-note" }, i18n.t("billing:billingPanel.noInvoices"))
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
                          i18n.t("billing:billingPanel.viewInvoice"),
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
                i18n.t("billing:billingPanel.viewAllStripe"),
              ),
            )
    : null;

  return createElement(
    "div",
    { className: "account-panel account-panel-billing", "data-tutorial-target": "account-billing" },
    createElement(
      "p",
      { className: "account-panel-intro" },
      isApple
        ? i18n.t("billing:billingPanel.introApple")
        : i18n.t("billing:billingPanel.introStripe"),
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
          createElement("strong", null, i18n.t("billing:paymentIssue.title")),
          createElement(
            "p",
            null,
            i18n.t("billing:paymentIssue.graceBilling", {
              deadline: formatWhen(billing.payment_issue.grace_deadline) || i18n.t("billing:paymentIssue.pending"),
            }),
          ),
        )
      : null,
    createElement(
      PanelBlock,
      { title: i18n.t("billing:billingPanel.subscriptionSummary") },
      billingLoading
        ? createElement("p", { className: "account-panel-note" }, i18n.t("billing:billingPanel.loading"))
        : MetaPairs([
            [
              i18n.t("billing:billingPanel.purchaseSource"),
              billing?.purchase_source === "stripe"
                ? i18n.t("billing:billingPanel.sourceStripe")
                : billing?.purchase_source === "apple"
                  ? i18n.t("billing:billingPanel.sourceApple")
                  : i18n.t("billing:billingPanel.sourceNone"),
            ],
            [i18n.t("billing:billingPanel.status"), statusLabel(billing)],
            [
              i18n.t("billing:billingPanel.subscribedPlan"),
              billing?.subscribed_plan?.key
                ? translatePlan(billing, billing.subscribed_plan.key, billing.subscribed_plan.display_name)
                : null,
            ],
          ]),
    ),
    showStripeBilling
      ? createElement(
          PanelBlock,
          { title: i18n.t("billing:billingPanel.recentInvoices") },
          invoiceRows,
        )
      : null,
    isApple
      ? createElement(
          PanelBlock,
          { title: i18n.t("billing:billingPanel.billingPortal") },
          createElement(
            "p",
            { className: "account-panel-note" },
            i18n.t("billing:billingPanel.applePortalNote"),
          ),
        )
      : isStripe && canPortal
        ? createElement(
            PanelBlock,
            { title: i18n.t("billing:billingPanel.billingPortal") },
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
                busyAction === "portal"
                  ? i18n.t("billing:billingPanel.opening")
                  : i18n.t("billing:billingPanel.openPortal"),
              ),
            ),
          )
        : isStripe
          ? createElement(
              PanelBlock,
              { title: i18n.t("billing:billingPanel.billingPortal") },
              createElement(
                "p",
                { className: "account-panel-note" },
                billingLoading
                  ? i18n.t("billing:status.loading")
                  : i18n.t("billing:billingPanel.portalUnavailable"),
              ),
            )
          : null,
  );
}
