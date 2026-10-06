import { useCallback, useEffect, useState } from "react";
import { endpoints } from "@checkstation/api";
import { canViewBilling } from "@checkstation/domain";
import { formatDateTime } from "@checkstation/i18n";
import { Alert, Badge, Button, Card, Loading, Page, formatError } from "../components/ui";
import { useApp } from "../lib/AppProvider";
import {
  desktopBillingMode,
  resolveDesktopDistribution,
} from "../lib/desktopDistribution";
import {
  appleBlockedByOtherProvider,
  appleManaged,
  applePurchaseEligible,
  appleStorePurchaseAllowed,
  appleTrialFutureSelectionMode,
  futurePaidMatchesAppleProduct,
  isCurrentAppleSubscriptionProduct,
  shouldLoadAppleStoreProducts,
  shouldShowStripePromoOnMas,
  userFacingAppleBillingError,
} from "../billing/applePlanUi";
import {
  buildApplePlanCards,
  shouldShowApplePlanCards,
} from "../billing/applePlanCards";
import {
  appleProductIdFor,
  type AppleIntervalKey,
  type ApplePlanKey,
} from "../billing/appleProducts";
import { storeKitDisplayPriceOnly } from "../billing/storeKitDisplayPrice";
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
type Option = {
  id: string;
  kind?: string;
  plan: string;
  interval: string;
  title: string;
  actionLabel: string;
  recommended: boolean;
  enabled?: boolean;
  selectedFuture?: boolean;
  pricing: Snapshot;
};
type Usage = { key: string; label: string; display: string; usage: number; limit: number; limitNote?: string };
type StoreProduct = { productId: string; displayPrice: string; title: string; description: string };

export function PlanPage() {
  const { api, auth, authState, locale, t } = useApp();
  const allowed = canViewBilling(authState.session);
  const billingMode = desktopBillingMode(resolveDesktopDistribution());
  const stripeEnabled = billingMode === "stripe_web";
  const appleIapEnabled = billingMode === "apple_iap";
  const [billing, setBilling] = useState<Snapshot | null>(null);
  const [entitlements, setEntitlements] = useState<Snapshot | null>(null);
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [storeStatus, setStoreStatus] = useState<"idle" | "loading" | "ready" | "signing_required" | "error">("idle");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [helperLocale, setHelperLocale] = useState("");
  useEffect(() => {
    let active = true;
    void workspaceI18n.changeLanguage(locale).then(() => {
      if (active) setHelperLocale(locale);
    });
    return () => {
      active = false;
    };
  }, [locale]);

  const load = useCallback(async (silent = false) => {
    if (!allowed) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const [snapshot, workspace] = await Promise.all([
        api.get<Snapshot>(endpoints.billing()),
        api.get<Snapshot>(endpoints.workspace()),
      ]);
      setBilling(snapshot);
      setEntitlements(workspace.entitlements);
      await auth.refreshWorkspace().catch(() => undefined);
    } catch (caught) {
      setError(formatError(caught, t("common.error")));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [allowed, api, auth, t]);

  useEffect(() => {
    void load();
  }, [load]);
  useForegroundRefresh(() => load(true));

  useEffect(() => {
    if (!appleIapEnabled || !billing || !shouldLoadAppleStoreProducts(billing)) {
      setStoreProducts([]);
      setStoreStatus("idle");
      return;
    }
    let cancelled = false;
    setStoreStatus("loading");
    void (async () => {
      const bridge = window.checkstationDesktop;
      if (!bridge?.loadStoreKitProducts) {
        if (!cancelled) setStoreStatus("signing_required");
        return;
      }
      const result = await bridge.loadStoreKitProducts();
      if (cancelled) return;
      if (result.kind === "signing_required" || result.kind === "unavailable") {
        setStoreStatus("signing_required");
        setStoreProducts([]);
        return;
      }
      if (result.kind === "error") {
        setStoreStatus("error");
        setStoreProducts([]);
        return;
      }
      setStoreProducts(
        (Array.isArray(result.products) ? result.products : []).map((row) => ({
          productId: String(row.productId || ""),
          displayPrice: String(row.displayPrice || ""),
          title: String(row.title || ""),
          description: String(row.description || ""),
        })),
      );
      setStoreStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [appleIapEnabled, billing]);

  function storePriceFor(plan: string, interval: string): string {
    try {
      const productId = appleProductIdFor(plan as ApplePlanKey, interval as AppleIntervalKey);
      const product = storeProducts.find((row) => row.productId === productId);
      return storeKitDisplayPriceOnly(product || {});
    } catch {
      return "";
    }
  }

  async function runBrowserBilling(url: string, prepared: { id: string; desktopReturnUrl: string }) {
    const bridge = window.checkstationDesktop;
    if (!bridge?.openBillingReturn) {
      throw new Error(t("common.error"));
    }
    return bridge.openBillingReturn({
      id: prepared.id,
      url,
      title: "Billing complete",
      body: "Returning to CheckStation…",
    });
  }

  async function prepareReturn() {
    const bridge = window.checkstationDesktop;
    if (!bridge?.prepareBillingReturn) {
      throw new Error(t("common.error"));
    }
    const prepared = await bridge.prepareBillingReturn();
    if (prepared.kind !== "ready") {
      throw new Error(t("common.error"));
    }
    return prepared;
  }

  async function purchaseAppleOption(option: Option) {
    if (!appleIapEnabled || busy) return;
    const bridge = window.checkstationDesktop;
    if (!bridge?.purchaseStoreKitSubscription) {
      setError(t("auth.appleSigningRequired"));
      return;
    }
    if (appleTrialFutureSelectionMode(billing)) {
      setBusy("future-plan");
      setError("");
      try {
        const next = await api.post<Snapshot>(endpoints.billingFuturePlan(), {
          plan: option.plan,
          interval: option.interval,
        });
        setBilling(next);
        await auth.refreshWorkspace().catch(() => undefined);
      } catch (caught) {
        setError(userFacingAppleBillingError(caught, t("common.error")));
      } finally {
        setBusy("");
      }
      return;
    }
    // Allow first Apple subscribe (purchase_source none) or Apple-managed plan switch.
    // Never allow StoreKit purchase for Stripe / Google / other ownership.
    if (!appleStorePurchaseAllowed(billing) || appleBlockedByOtherProvider(billing)) return;
    if (isCurrentAppleSubscriptionProduct(billing, option.plan, option.interval)) return;
    const displayPrice = storePriceFor(option.plan, option.interval);
    if (!displayPrice) {
      setError(t("plan.applePriceUnavailable"));
      return;
    }
    const appAccountToken = String(billing?.apple_app_account_token || "").trim();
    if (!appAccountToken) {
      setError(t("common.error"));
      return;
    }
    setBusy("apple-purchase");
    setError("");
    try {
      const productId = appleProductIdFor(option.plan as ApplePlanKey, option.interval as AppleIntervalKey);
      const purchased = await bridge.purchaseStoreKitSubscription({
        productId,
        appAccountToken,
      });
      if (purchased.kind === "cancelled") return;
      if (purchased.kind === "signing_required" || purchased.kind === "unavailable") {
        setError(t("auth.appleSigningRequired"));
        return;
      }
      if (purchased.kind !== "success" || !purchased.signedTransaction) {
        setError(purchased.kind === "error" ? (purchased.message || t("common.error")) : t("common.error"));
        return;
      }
      const next = await api.post<Snapshot>(endpoints.billingAppleVerify(), {
        signed_transaction: purchased.signedTransaction,
      });
      setBilling(next);
      await auth.refreshWorkspace().catch(() => undefined);
    } catch (caught) {
      setError(userFacingAppleBillingError(caught, t("common.error")));
    } finally {
      setBusy("");
    }
  }

  async function restoreApple() {
    if (!appleIapEnabled || busy) return;
    const bridge = window.checkstationDesktop;
    if (!bridge?.restoreStoreKitPurchases) {
      setError(t("auth.appleSigningRequired"));
      return;
    }
    setBusy("apple-restore");
    setError("");
    try {
      const restored = await bridge.restoreStoreKitPurchases();
      if (restored.kind === "signing_required" || restored.kind === "unavailable") {
        setError(t("auth.appleSigningRequired"));
        return;
      }
      if (restored.kind === "error") {
        setError(restored.message || t("common.error"));
        return;
      }
      const transactions = restored.transactions || [];
      if (!transactions.length) {
        setError(t("plan.appleRestoreNone"));
        return;
      }
      let next: Snapshot | null = null;
      for (const row of transactions) {
        next = await api.post<Snapshot>(endpoints.billingAppleVerify(), {
          signed_transaction: row.signedTransaction,
        });
      }
      if (next) setBilling(next);
      await auth.refreshWorkspace().catch(() => undefined);
    } catch (caught) {
      setError(userFacingAppleBillingError(caught, t("common.error")));
    } finally {
      setBusy("");
    }
  }

  async function manageApple() {
    if (!appleIapEnabled || busy) return;
    const bridge = window.checkstationDesktop;
    if (!bridge?.openAppleManageSubscriptions) {
      setError(t("auth.appleSigningRequired"));
      return;
    }
    setBusy("apple-manage");
    setError("");
    try {
      const opened = await bridge.openAppleManageSubscriptions();
      if (opened.kind === "signing_required" || opened.kind === "unavailable") {
        setError(t("auth.appleSigningRequired"));
        return;
      }
      if (opened.kind === "error") {
        setError(opened.message || t("common.error"));
        return;
      }
      await load(true);
    } catch (caught) {
      setError(userFacingAppleBillingError(caught, t("common.error")));
    } finally {
      setBusy("");
    }
  }

  async function startCheckout(plan: string, interval: string) {
    if (!stripeEnabled || busy) return;
    setBusy("checkout");
    setError("");
    let prepared: { id: string; desktopReturnUrl: string } | null = null;
    try {
      prepared = await prepareReturn();
      const result = await api.post<{
        mode?: string;
        checkout_url?: string | null;
        billing?: Snapshot;
      }>(endpoints.billingCheckout(), {
        plan,
        interval,
        desktop_return_url: prepared.desktopReturnUrl,
      });
      if (result.checkout_url) {
        setBusy("checkout-browser");
        const returned = await runBrowserBilling(result.checkout_url, prepared);
        prepared = null;
        if (returned.kind === "returned" && returned.checkout === "cancelled") {
          setError(t("plan.checkoutCancelled"));
          return;
        }
        setBusy("checkout-confirm");
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const [snapshot, workspace] = await Promise.all([
            api.get<Snapshot>(endpoints.billing()),
            api.get<Snapshot>(endpoints.workspace()),
          ]);
          setBilling(snapshot);
          setEntitlements(workspace.entitlements);
          await auth.refreshWorkspace().catch(() => undefined);
          const status = String(snapshot.status || "");
          if (status === "active" || status === "trialing" || status === "past_due") {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        return;
      }
      if (result.billing) {
        setBilling(result.billing);
        await auth.refreshWorkspace().catch(() => undefined);
        return;
      }
      throw new Error(t("common.error"));
    } catch (caught) {
      setError(formatError(caught, t("common.error")));
    } finally {
      if (prepared?.id) {
        void window.checkstationDesktop?.cancelBillingReturn?.({ id: prepared.id });
      }
      setBusy("");
    }
  }

  async function openPortal() {
    if (!stripeEnabled || busy) return;
    setBusy("portal");
    setError("");
    let prepared: { id: string; desktopReturnUrl: string } | null = null;
    try {
      prepared = await prepareReturn();
      const result = await api.post<{ portal_url?: string }>(endpoints.billingPortal(), {
        desktop_return_url: prepared.desktopReturnUrl,
      });
      if (!result.portal_url) throw new Error(t("common.error"));
      const returned = await runBrowserBilling(result.portal_url, prepared);
      prepared = null;
      if (returned.kind === "error") {
        setError(returned.message || t("common.error"));
      }
      await load(true);
    } catch (caught) {
      setError(formatError(caught, t("common.error")));
    } finally {
      if (prepared?.id) {
        void window.checkstationDesktop?.cancelBillingReturn?.({ id: prepared.id });
      }
      setBusy("");
    }
  }

  async function cancelSubscription() {
    if (!stripeEnabled || busy) return;
    setBusy("cancel");
    setError("");
    try {
      const next = await api.post<Snapshot>(endpoints.billingCancel(), {});
      setBilling(next);
      setConfirmCancel(false);
      await auth.refreshWorkspace().catch(() => undefined);
    } catch (caught) {
      setError(formatError(caught, t("common.error")));
    } finally {
      setBusy("");
    }
  }

  async function resumeSubscription() {
    if (!stripeEnabled || busy) return;
    setBusy("resume");
    setError("");
    try {
      const next = await api.post<Snapshot>(endpoints.billingResume(), {});
      setBilling(next);
      await auth.refreshWorkspace().catch(() => undefined);
    } catch (caught) {
      setError(formatError(caught, t("common.error")));
    } finally {
      setBusy("");
    }
  }

  async function applyOption(option: Option) {
    if (busy) return;
    if (appleIapEnabled) {
      await purchaseAppleOption(option);
      return;
    }
    if (!stripeEnabled) return;
    const kind = option.kind || "checkout";
    if (kind === "checkout") {
      await startCheckout(option.plan, option.interval);
      return;
    }
    if (kind === "immediate_upgrade") {
      setBusy("upgrade");
      setError("");
      try {
        await api.post(endpoints.billingUpgradePreview(), {});
        const next = await api.post<Snapshot>(endpoints.billingUpgrade(), {});
        setBilling(next);
        await auth.refreshWorkspace().catch(() => undefined);
      } catch (caught) {
        setError(formatError(caught, t("common.error")));
      } finally {
        setBusy("");
      }
      return;
    }
    if (kind === "schedule") {
      setBusy("schedule");
      setError("");
      try {
        const next = await api.post<Snapshot>(endpoints.billingChangeSchedule(), {
          plan: option.plan,
          interval: option.interval,
        });
        setBilling(next);
        await auth.refreshWorkspace().catch(() => undefined);
      } catch (caught) {
        setError(formatError(caught, t("common.error")));
      } finally {
        setBusy("");
      }
      return;
    }
    if (kind === "downgrade_plus") {
      setBusy("downgrade");
      setError("");
      try {
        const next = await api.post<Snapshot>(endpoints.billingDowngrade(), {
          interval: option.interval,
        });
        setBilling(next);
        await auth.refreshWorkspace().catch(() => undefined);
      } catch (caught) {
        setError(formatError(caught, t("common.error")));
      } finally {
        setBusy("");
      }
      return;
    }
    if (kind === "cancel_to_basic") {
      setConfirmCancel(true);
    }
  }

  if (!allowed) {
    return (
      <Page>
        <Alert tone="warning">{t("more.staffRoleDescription")}</Alert>
      </Page>
    );
  }
  if (loading || helperLocale !== locale) {
    return (
      <Page>
        <Loading label={t("plan.loading")} />
      </Page>
    );
  }
  if (!billing) {
    return (
      <Page>
        <Alert>{error}</Alert>
      </Page>
    );
  }

  const wt = workspaceI18n.getFixedT(locale);
  const key = effectivePlanKey(billing, entitlements?.plan?.key);
  const trial = isBuiltinTrialSelectionMode(billing);
  const upgrades: Option[] = buildUpgradePlanOptions(billing, key);
  const downgrades: Option[] = buildDowngradePlanOptions(billing, key);
  const usage: Usage[] = subscriptionUsageRows(entitlements);
  const promo = catalogPromotion(billing.catalog);
  const scheduled = scheduledChangeSummary(billing);
  const date = (value: string) => formatDateTime(value, locale);
  const directAppleManaged = stripeEnabled && billing.purchase_source === "apple";
  const canPortal = Boolean(stripeEnabled && !directAppleManaged && billing.actions?.can_open_portal);
  const canCancel = Boolean(
    stripeEnabled && !directAppleManaged && billing.actions?.can_cancel && !billing.cancel_at_period_end,
  );
  const canResume = Boolean(
    stripeEnabled && !directAppleManaged && billing.actions?.can_resume_subscription,
  );
  const showStripePromo = stripeEnabled && !shouldShowStripePromoOnMas(billing) && !directAppleManaged;
  const appleBlocked = appleIapEnabled ? appleBlockedByOtherProvider(billing) : null;
  const appleTrialSelect = appleIapEnabled && appleTrialFutureSelectionMode(billing);
  const appleShop = appleIapEnabled && (applePurchaseEligible(billing) || appleTrialSelect);
  const appleIsManaged = appleIapEnabled && appleManaged(billing);
  const appleShowProductGrid = appleIapEnabled && (
    shouldShowApplePlanCards(billing) || appleTrialSelect
  );
  // MAS Apple path: always the four App Store SKUs — never Stripe upgrade matrix.
  const appleOptions: Option[] = appleShowProductGrid
    ? buildApplePlanCards(billing, (name) => wt(name)).map((card) => ({
      id: card.productId,
      kind: "apple_storekit",
      plan: card.plan,
      interval: card.interval,
      title: card.title,
      actionLabel: "",
      recommended: false,
      pricing: {},
    }))
    : [];
  const visibleUpgrades = appleIapEnabled
    ? appleOptions
    : (directAppleManaged ? [] : upgrades);
  const visibleDowngrades = appleIapEnabled || directAppleManaged ? [] : downgrades;
  const currentAppleStorePrice = appleIsManaged && billing.subscribed_plan?.key && billing.interval
    ? storePriceFor(String(billing.subscribed_plan.key), String(billing.interval))
    : "";

  const renderOptions = (options: Option[]) => (
    <div className="desktop-plan-grid">
      {options.map((option) => {
        const current = appleIapEnabled
          ? isCurrentAppleSubscriptionProduct(billing, option.plan, option.interval)
          : isEffectiveCurrentPlanOption(billing, option.plan, option.interval, key);
        const pending =
          billing.scheduled_change?.active
          && billing.pending_plan === option.plan
          && billing.pending_interval === option.interval;
        const selectedFuture = appleIapEnabled
          ? futurePaidMatchesAppleProduct(billing, option.plan, option.interval)
          : Boolean(option.selectedFuture);
        const recommended = option.recommended && !current && !pending && !selectedFuture;
        const pricing = option.pricing || {};
        const applePrice = appleIapEnabled ? storePriceFor(option.plan, option.interval) : "";
        const badge = selectedFuture
          ? wt("billing:trialSelection.selectedBadge")
          : current
            ? wt("billing:currentPlan.badge")
            : pending
              ? wt("billing:currentPlan.scheduled")
              : recommended
                ? wt("billing:currentPlan.recommended")
                : "";
        const purchaseDisabled = appleIapEnabled
          ? Boolean(busy)
            || current
            || selectedFuture
            || (!appleTrialSelect && !applePrice)
            || storeStatus === "signing_required"
            || Boolean(appleBlocked)
          : !stripeEnabled
            || Boolean(busy)
            || option.enabled === false
            || Boolean(option.selectedFuture)
            || current;
        const actionLabel = appleIapEnabled
          ? (appleTrialSelect
            ? (selectedFuture ? t("plan.appleTrialSelected") : t("plan.appleTrialSelect"))
            : !applePrice
              ? (storeStatus === "loading" ? t("plan.appleLoadingProducts") : t("plan.applePriceUnavailable"))
              : appleIsManaged
                ? t("plan.appleChange")
                : t("plan.appleBuy"))
          : option.actionLabel;
        return (
          <article
            key={option.id}
            className={`account-plan-option ${pricingTemplateClass(billing.catalog)} ${current || selectedFuture ? "is-current" : ""} ${recommended ? "is-recommended" : ""} ${pending ? "is-scheduled" : ""}`}
            data-plan={option.plan}
            data-interval={option.interval}
            data-product-id={appleIapEnabled ? option.id : undefined}
          >
            <header className="account-plan-option-header">
              <h4>{option.title}</h4>
              {badge ? (
                <span className={`account-plan-option-badge ${recommended ? "account-plan-option-badge-recommended" : ""}`}>
                  {badge}
                </span>
              ) : null}
            </header>
            <p className="account-plan-option-price">
              {appleIapEnabled
                ? (applePrice
                  || (storeStatus === "loading" ? t("plan.appleLoadingProducts") : t("plan.applePriceUnavailable")))
                : (pricing.firstPeriodFormatted || pricing.listWithInterval)}
            </p>
            {!appleIapEnabled ? (
              <>
                <p className="account-plan-option-period">
                  {wt(
                    `billing:currentPlan.${
                      pricing.promotional
                        ? option.interval === "yearly"
                          ? "firstYear"
                          : "firstMonth"
                        : option.interval === "yearly"
                          ? "perYear"
                          : "perMonth"
                    }`,
                  )}
                </p>
                {pricing.promotional && pricing.listWithInterval ? (
                  <p className="account-plan-option-list-price">
                    {wt("billing:currentPlan.normally", { price: pricing.listWithInterval })}
                  </p>
                ) : null}
                {pricing.label ? <p className="account-plan-option-promo-note">{pricing.label}</p> : null}
                {pricing.promotional && pricing.renewsAtWithInterval ? (
                  <p className="account-plan-option-renews">
                    {wt("billing:currentPlan.thenRenews", { price: pricing.renewsAtWithInterval })}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="account-plan-option-period">
                {wt(`billing:currentPlan.${option.interval === "yearly" ? "perYear" : "perMonth"}`)}
              </p>
            )}
            {appleIapEnabled && current ? null : (
              <button
                type="button"
                className="button desktop-plan-purchase"
                disabled={purchaseDisabled}
                onClick={() => void applyOption(option)}
              >
                {actionLabel}
              </button>
            )}
          </article>
        );
      })}
    </div>
  );

  return (
    <Page>
      <div className="desktop-plan-preview">
        <Alert>{error}</Alert>
        {busy ? <Alert tone="info">{t("plan.billingBusy")}</Alert> : null}
        {appleIapEnabled && storeStatus === "signing_required" ? (
          <Alert tone="warning">{t("auth.appleSigningRequired")}</Alert>
        ) : null}
        {appleBlocked === "stripe" ? (
          <Alert tone="info">{t("plan.appleManagedByCheckStation")}</Alert>
        ) : null}
        {appleBlocked === "google" ? (
          <Alert tone="info">{t("plan.appleManagedByGoogle")}</Alert>
        ) : null}
        <Card title={wt("billing:currentPlan.title")}>
          <div className="plan-hero">
            <div>
              <span>{wt("billing:currentPlan.effectivePlan")}</span>
              <strong>{planDisplayName(billing, key)}</strong>
            </div>
            <Badge tone="blue">{statusLabelForBilling(billing)}</Badge>
          </div>
          <dl className="info-grid">
            {trial && billing.builtin_trial?.ends_at ? (
              <Info label={wt("billing:currentPlan.trialEnds")} value={date(billing.builtin_trial.ends_at)} />
            ) : null}
            {trial ? (
              <Info
                label={wt("billing:trialSelection.selectedPlan")}
                value={
                  billing.future_paid_plan?.key
                    ? `${planDisplayName(billing, billing.future_paid_plan.key)} · ${wt(`billing:interval.${billing.future_paid_plan.interval}`)}`
                    : wt("billing:trialSelection.noneSelected")
                }
              />
            ) : null}
            {!trial && billing.interval ? (
              <Info label={wt("billing:currentPlan.interval")} value={wt(`billing:interval.${billing.interval}`)} />
            ) : null}
            {!trial && billing.interval && billing.subscribed_plan?.key ? (
              <Info
                label={wt("billing:currentPlan.price")}
                value={
                  appleIsManaged && currentAppleStorePrice
                    ? `${currentAppleStorePrice} · ${wt(`billing:interval.${billing.interval}`)}`
                    : catalogListPriceWithInterval(billing, billing.subscribed_plan.key, billing.interval)
                }
              />
            ) : null}
            {billing.trial_ends_at && !trial ? (
              <Info label={wt("billing:currentPlan.paidPlanStarts")} value={date(billing.trial_ends_at)} />
            ) : null}
            {!trial && !billing.trial_ends_at && billing.current_period_end ? (
              <Info
                label={wt(`billing:currentPlan.${billing.cancel_at_period_end ? "ends" : "renews"}`)}
                value={date(billing.current_period_end)}
              />
            ) : null}
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
          {directAppleManaged ? (
            <Alert tone="info">{t("plan.appleManagedBillingNote")}</Alert>
          ) : null}
          {scheduled ? (
            <Alert tone="info">
              {scheduled.lead}
              {scheduled.bullets?.map((line: string) => <p key={line}>{line}</p>)}
            </Alert>
          ) : null}
          {billing.cancel_at_period_end ? (
            <Alert tone="warning">{wt("billing:cancellation.scheduled")}</Alert>
          ) : null}
          {stripeEnabled && (canPortal || canCancel || canResume || confirmCancel) ? (
            <div className="desktop-plan-actions" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {canPortal ? (
                <Button disabled={Boolean(busy)} onClick={() => void openPortal()} type="button" variant="secondary">
                  {t("plan.manageBilling")}
                </Button>
              ) : null}
              {canResume ? (
                <Button disabled={Boolean(busy)} onClick={() => void resumeSubscription()} type="button">
                  {t("plan.resumeSubscription")}
                </Button>
              ) : null}
              {canCancel && !confirmCancel ? (
                <Button disabled={Boolean(busy)} onClick={() => setConfirmCancel(true)} type="button" variant="secondary">
                  {wt("billing:planActions.cancelSubscription")}
                </Button>
              ) : null}
            </div>
          ) : null}
          {appleIapEnabled && (appleShop || appleIsManaged) ? (
            <div className="desktop-plan-actions" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {appleIsManaged ? (
                <Button disabled={Boolean(busy)} onClick={() => void manageApple()} type="button" variant="secondary">
                  {t("plan.appleManage")}
                </Button>
              ) : null}
              <Button disabled={Boolean(busy)} onClick={() => void restoreApple()} type="button" variant="secondary">
                {t("plan.appleRestore")}
              </Button>
            </div>
          ) : null}
          {confirmCancel ? (
            <Alert tone="warning">
              <p>{t("plan.cancelConfirm")}</p>
              <p>{t("plan.cancelConfirmBody")}</p>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Button disabled={Boolean(busy)} onClick={() => setConfirmCancel(false)} type="button" variant="secondary">
                  {t("common.cancel")}
                </Button>
                <Button disabled={Boolean(busy)} onClick={() => void cancelSubscription()} type="button" variant="danger">
                  {wt("billing:planActions.cancelSubscription")}
                </Button>
              </div>
            </Alert>
          ) : null}
          {canPortal ? <p className="desktop-plan-summary">{t("plan.manageBillingHint")}</p> : null}
        </Card>
        {visibleUpgrades.length ? (
          <Card
            title={
              appleShowProductGrid
                ? (appleTrialSelect ? t("plan.appleTrialSelectTitle") : t("plan.appleSectionTitle"))
                : wt(trial ? "billing:trialSelection.title" : "billing:upgrade.title")
            }
            description={
              appleShowProductGrid
                ? (appleTrialSelect ? t("plan.appleTrialSelectDescription") : t("plan.appleSectionDescription"))
                : undefined
            }
          >
            {showStripePromo ? (
              <>
                <PromotionalText catalog={billing.catalog} className="account-promotional-text" />
                {promo?.active && isAcquisitionPromotion(billing.catalog) ? (
                  <p className="desktop-plan-summary">
                    {promo.label ? `${promo.label}: ` : ""}
                    {localizedPromotionSummary(billing.catalog, (name: string, vars: Snapshot) =>
                      wt(`billing:promoDiscount.${name}`, vars))}
                  </p>
                ) : null}
              </>
            ) : null}
            {renderOptions(visibleUpgrades)}
          </Card>
        ) : null}
        {visibleDowngrades.length ? <Card title={wt("billing:downgrade.title")}>{renderOptions(visibleDowngrades)}</Card> : null}
        <Card title={wt("billing:usage.title")} description={wt("billing:usage.description")}>
          {usage.length ? (
            <div className="desktop-plan-usage">
              {usage.map((row) => (
                <div key={row.key} className="desktop-plan-usage-item">
                  <div>
                    <strong>{row.label}</strong>
                    <span>{row.display}</span>
                  </div>
                  <progress
                    max={Math.max(row.limit, 1)}
                    value={Math.min(row.usage, Math.max(row.limit, 1))}
                    aria-label={`${row.label}: ${row.display}`}
                  />
                  {row.limitNote ? <small>{row.limitNote}</small> : null}
                </div>
              ))}
            </div>
          ) : (
            <p>{wt("billing:usage.unavailable")}</p>
          )}
        </Card>
      </div>
    </Page>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return value ? (
    <div className="info-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  ) : null;
}
