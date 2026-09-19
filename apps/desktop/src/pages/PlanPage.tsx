import { useCallback, useEffect, useState } from "react";
import { endpoints } from "@checkstation/api";
import { canViewBilling } from "@checkstation/domain";
import { formatDateTime } from "@checkstation/i18n";
import { Alert, Badge, Card, Loading, Page, formatError } from "../components/ui";
import { useApp } from "../lib/AppProvider";
import { useForegroundRefresh } from "../lib/useForegroundRefresh";
// Reuse production presentation rules rather than maintaining a desktop billing matrix.
// @ts-expect-error Canonical Workspace JavaScript helper.
import { buildUpgradePlanOptions, buildDowngradePlanOptions, effectivePlanKey, isEffectiveCurrentPlanOption, isBuiltinTrialSelectionMode, planDisplayName, catalogListPriceWithInterval } from "../../../../frontend/src/subscriptionPlanOptions.js";
// @ts-expect-error Canonical Workspace JavaScript helper.
import { statusLabelForBilling, scheduledChangeSummary } from "../../../../frontend/src/accountPanels.js";
// @ts-expect-error Canonical Workspace JavaScript helper.
import { subscriptionUsageRows } from "../../../../frontend/src/workspaceEntitlements.js";
// @ts-expect-error Canonical Workspace JavaScript helper.
import { PromotionalText } from "../../../../frontend/src/promotionalText.js";
// @ts-expect-error Canonical Workspace JavaScript helper.
import { pricingTemplateClass } from "../../../../frontend/src/pricingTemplates.js";
// @ts-expect-error Canonical Workspace JavaScript helper.
import { catalogPromotion, localizedPromotionSummary, isAcquisitionPromotion } from "../../../../frontend/src/promotionCatalog.js";
// @ts-expect-error Helper translations follow the existing desktop locale.
import workspaceI18n from "../../../../frontend/src/i18n/index.js";
import "./planPreview.css";

type Snapshot = Record<string, any>;
type Option = { id: string; plan: string; interval: string; title: string; actionLabel: string; recommended: boolean; selectedFuture?: boolean; pricing: Snapshot };
type Usage = { key: string; label: string; display: string; usage: number; limit: number; limitNote?: string };

export function PlanPage() {
  const { api, authState, locale, t } = useApp();
  const allowed = canViewBilling(authState.session);
  const [billing, setBilling] = useState<Snapshot | null>(null);
  const [entitlements, setEntitlements] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [helperLocale, setHelperLocale] = useState("");
  useEffect(() => { let active = true; void workspaceI18n.changeLanguage(locale).then(() => { if (active) setHelperLocale(locale); }); return () => { active = false; }; }, [locale]);
  const load = useCallback(async (silent = false) => {
    if (!allowed) return;
    if (!silent) setLoading(true); setError("");
    try {
      const [snapshot, workspace] = await Promise.all([api.get<Snapshot>(endpoints.billing()), api.get<Snapshot>(endpoints.workspace())]);
      setBilling(snapshot); setEntitlements(workspace.entitlements);
    } catch (caught) { setError(formatError(caught, t("common.error"))); }
    finally { if (!silent) setLoading(false); }
  }, [allowed, api, t]);
  useEffect(() => { void load(); }, [load]);
  useForegroundRefresh(() => load(true));
  if (!allowed) return <Page><Alert tone="warning">{t("more.staffRoleDescription")}</Alert></Page>;
  if (loading || helperLocale !== locale) return <Page><Loading label={t("plan.loading")} /></Page>;
  if (!billing) return <Page><Alert>{error}</Alert></Page>;
  const wt = workspaceI18n.getFixedT(locale);
  const key = effectivePlanKey(billing, entitlements?.plan?.key);
  const trial = isBuiltinTrialSelectionMode(billing);
  const upgrades: Option[] = buildUpgradePlanOptions(billing, key);
  const downgrades: Option[] = buildDowngradePlanOptions(billing, key);
  const usage: Usage[] = subscriptionUsageRows(entitlements);
  const promo = catalogPromotion(billing.catalog);
  const scheduled = scheduledChangeSummary(billing);
  const date = (value: string) => formatDateTime(value, locale);
  const renderOptions = (options: Option[]) => <div className="desktop-plan-grid">{options.map(option => {
    const current = isEffectiveCurrentPlanOption(billing, option.plan, option.interval, key);
    const pending = billing.scheduled_change?.active && billing.pending_plan === option.plan && billing.pending_interval === option.interval;
    const recommended = option.recommended && !current && !pending && !option.selectedFuture;
    const pricing = option.pricing || {};
    const badge = option.selectedFuture ? wt("billing:trialSelection.selectedBadge") : current ? wt("billing:currentPlan.badge") : pending ? wt("billing:currentPlan.scheduled") : recommended ? wt("billing:currentPlan.recommended") : "";
    return <article key={option.id} className={`account-plan-option ${pricingTemplateClass(billing.catalog)} ${current || option.selectedFuture ? "is-current" : ""} ${recommended ? "is-recommended" : ""} ${pending ? "is-scheduled" : ""}`} data-plan={option.plan}>
      <header className="account-plan-option-header"><h4>{option.title}</h4>{badge ? <span className={`account-plan-option-badge ${recommended ? "account-plan-option-badge-recommended" : ""}`}>{badge}</span> : null}</header>
      <p className="account-plan-option-price">{pricing.firstPeriodFormatted || pricing.listWithInterval}</p>
      <p className="account-plan-option-period">{wt(`billing:currentPlan.${pricing.promotional ? option.interval === "yearly" ? "firstYear" : "firstMonth" : option.interval === "yearly" ? "perYear" : "perMonth"}`)}</p>
      {pricing.promotional && pricing.listWithInterval ? <p className="account-plan-option-list-price">{wt("billing:currentPlan.normally", { price: pricing.listWithInterval })}</p> : null}
      {pricing.label ? <p className="account-plan-option-promo-note">{pricing.label}</p> : null}
      {pricing.promotional && pricing.renewsAtWithInterval ? <p className="account-plan-option-renews">{wt("billing:currentPlan.thenRenews", { price: pricing.renewsAtWithInterval })}</p> : null}
      <button type="button" className="button desktop-plan-purchase" disabled>{option.actionLabel}</button>
    </article>;
  })}</div>;
  return <Page><div className="desktop-plan-preview"><Alert>{error}</Alert>
    <Card title={wt("billing:currentPlan.title")}><div className="plan-hero"><div><span>{wt("billing:currentPlan.effectivePlan")}</span><strong>{planDisplayName(billing, key)}</strong></div><Badge tone="blue">{statusLabelForBilling(billing)}</Badge></div>
      <dl className="info-grid">
        {trial && billing.builtin_trial?.ends_at ? <Info label={wt("billing:currentPlan.trialEnds")} value={date(billing.builtin_trial.ends_at)} /> : null}
        {trial ? <Info label={wt("billing:trialSelection.selectedPlan")} value={billing.future_paid_plan?.key ? `${planDisplayName(billing, billing.future_paid_plan.key)} · ${wt(`billing:interval.${billing.future_paid_plan.interval}`)}` : wt("billing:trialSelection.noneSelected")} /> : null}
        {!trial && billing.interval ? <Info label={wt("billing:currentPlan.interval")} value={wt(`billing:interval.${billing.interval}`)} /> : null}
        {!trial && billing.interval && billing.subscribed_plan?.key ? <Info label={wt("billing:currentPlan.price")} value={catalogListPriceWithInterval(billing, billing.subscribed_plan.key, billing.interval)} /> : null}
        {billing.trial_ends_at && !trial ? <Info label={wt("billing:currentPlan.paidPlanStarts")} value={date(billing.trial_ends_at)} /> : null}
        {!trial && !billing.trial_ends_at && billing.current_period_end ? <Info label={wt(`billing:currentPlan.${billing.cancel_at_period_end ? "ends" : "renews"}`)} value={date(billing.current_period_end)} /> : null}
        {billing.purchase_source ? (
          <Info
            label={t("plan.management")}
            value={
              billing.managed_by_platform
                ? t("plan.platformManaged")
                : billing.purchase_source_display
                  || (billing.purchase_source === "stripe"
                    ? t("plan.billingProviderCheckStation")
                    : billing.purchase_source === "apple"
                      ? t("plan.billingProviderApple")
                      : billing.purchase_source === "google"
                        ? t("plan.billingProviderGoogle")
                        : t("plan.billingProviderNone"))
            }
          />
        ) : null}
      </dl>
      {scheduled ? <Alert tone="info">{scheduled.lead}{scheduled.bullets?.map((line: string) => <p key={line}>{line}</p>)}</Alert> : null}
      {billing.cancel_at_period_end ? <Alert tone="warning">{wt("billing:cancellation.scheduled")}</Alert> : null}
    </Card>
    {upgrades.length ? <Card title={wt(trial ? "billing:trialSelection.title" : "billing:upgrade.title")}>
      <PromotionalText catalog={billing.catalog} className="account-promotional-text" />
      {promo?.active && isAcquisitionPromotion(billing.catalog) ? <p className="desktop-plan-summary">{promo.label ? `${promo.label}: ` : ""}{localizedPromotionSummary(billing.catalog, (name: string, vars: Snapshot) => wt(`billing:promoDiscount.${name}`, vars))}</p> : null}
      {renderOptions(upgrades)}
    </Card> : null}
    {downgrades.length ? <Card title={wt("billing:downgrade.title")}>{renderOptions(downgrades)}</Card> : null}
    <Card title={wt("billing:usage.title")} description={wt("billing:usage.description")}>
      {usage.length ? <div className="desktop-plan-usage">{usage.map(row => <div key={row.key} className="desktop-plan-usage-item"><div><strong>{row.label}</strong><span>{row.display}</span></div><progress max={Math.max(row.limit, 1)} value={Math.min(row.usage, Math.max(row.limit, 1))} aria-label={`${row.label}: ${row.display}`} />{row.limitNote ? <small>{row.limitNote}</small> : null}</div>)}</div> : <p>{wt("billing:usage.unavailable")}</p>}
    </Card>
  </div></Page>;
}
function Info({ label, value }: { label: string; value: string }) { return value ? <div className="info-item"><dt>{label}</dt><dd>{value}</dd></div> : null; }
