import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redirect, useFocusEffect } from "expo-router";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { endpoints } from "@checkstation/api";
import { canViewBilling } from "@checkstation/domain";
import { formatDateTime } from "@checkstation/i18n";
import { Alert, Button, LoadingState, Screen } from "../../src/components/ui";
import { PageHeader, SectionCard, StatusPill } from "../../src/components/mobile";
import { PlanOptionCard, PlanPromoHeadline } from "../../src/components/PlanPresentation";
import { CapacityMeter } from "../../src/components/CapacityMeter";
import { useApp } from "../../src/lib/AppProvider";
import { useFormFactor } from "../../src/lib/formFactor";
import {
  shouldRunBillingRefresh,
  summarizeRestoreAttempts,
  type BillingRefreshGate,
  type RestoreAttemptResult,
} from "../../src/lib/mobileBillingRefresh";
import { useAppForegroundRefresh } from "../../src/lib/useAppForegroundRefresh";
import {
  billingTranslator,
  buildDowngradePlanOptions,
  buildUpgradePlanOptions,
  catalogListPriceWithInterval,
  effectivePlanKey,
  isBuiltinTrialSelectionMode,
  isEffectiveCurrentPlanOption,
  promotionSummary,
  statusLabelForBilling,
  usageRows,
  type PlanOption,
} from "../../src/lib/planOptions";
import {
  appleIapSupported,
  finishAppleTransaction,
  isUserCancelPurchaseError as isUserCancelApplePurchaseError,
  loadAppleStoreCatalogForPlan,
  loadAppleStorefrontCountryCode,
  openAppleManageSubscriptions,
  purchaseAppleSubscription,
  restoreApplePurchases,
  type AppleStoreProduct,
} from "../../src/billing/appleIap";
import { appleProductMeta, type AppleProductId } from "../../src/billing/appleProducts";
import {
  appleDisplayPriceForCard,
  appleStoreProductMap,
  buildApplePlanCards,
} from "../../src/billing/applePlanCards";
import {
  appleBlockedByOtherProvider,
  appleManaged,
  applePurchaseEligible,
  appleTrialFutureSelectionMode,
  futurePaidMatchesAppleProduct,
  isActiveApplePaidEntitlement,
  shouldLoadAppleStoreProducts,
  shouldShowStripePromoOnMobile,
  userFacingAppleBillingError,
} from "../../src/billing/applePlanUi";
import {
  finishGoogleTransaction,
  googleIapSupported,
  googleSkuForManagedBilling,
  isUserCancelPurchaseError as isUserCancelGooglePurchaseError,
  loadGoogleStoreOffers,
  openGoogleManageSubscriptions,
  purchaseGoogleSubscription,
  restoreGooglePurchases,
  type GoogleStoreOffer,
} from "../../src/billing/googleIap";
import { GOOGLE_PLAN_OPTIONS, type GooglePlanOption } from "../../src/billing/googleProducts";
import {
  futurePaidMatchesGoogleOption,
  googleBlockedByOtherProvider,
  googleManaged,
  googlePurchaseEligible,
  googleTrialFutureSelectionMode,
  isActiveGooglePaidEntitlement,
  shouldLoadGoogleStoreProducts,
  userFacingGoogleBillingError,
} from "../../src/billing/googlePlanUi";
import { shouldShowMobileCrossProviderBillingNotice } from "../../src/billing/mobilePlanProviderNotice";
import { colors, space, type } from "../../src/theme/tokens";

type Snapshot = Record<string, any>;

export default function PlanScreen() {
  const { api, authState, locale, revision, syncWorkspace, t } = useApp();
  const { tablet } = useFormFactor();
  const allowed = canViewBilling(authState.session);
  const [billing, setBilling] = useState<Snapshot | null>(null);
  const [entitlements, setEntitlements] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [restoreFeedback, setRestoreFeedback] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const [appleProducts, setAppleProducts] = useState<AppleStoreProduct[]>([]);
  const [appleStorefrontCountryCode, setAppleStorefrontCountryCode] = useState<string | null>(null);
  const [appleStorefrontPending, setAppleStorefrontPending] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const [appleStoreError, setAppleStoreError] = useState(false);
  const [appleStoreEpoch, setAppleStoreEpoch] = useState(0);
  const [googleOffers, setGoogleOffers] = useState<GoogleStoreOffer[]>([]);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleStoreError, setGoogleStoreError] = useState(false);
  const [googleStoreEpoch, setGoogleStoreEpoch] = useState(0);
  const billingGateRef = useRef<BillingRefreshGate>({ inFlight: false, lastRefreshAt: null });
  const billingRef = useRef<Snapshot | null>(null);
  billingRef.current = billing;
  const bt = useMemo(() => billingTranslator(locale === "ja" ? "ja" : "en"), [locale]);

  const reloadAppleStore = useCallback(() => {
    setAppleStoreEpoch((value) => value + 1);
  }, []);

  const reloadGoogleStore = useCallback(() => {
    setGoogleStoreEpoch((value) => value + 1);
  }, []);

  /**
   * Authoritative VPS billing refresh.
   * - pull: user RefreshControl (shows pull spinner)
   * - silent: focus / foreground / revision / post-restore (no full-screen spinner)
   * - initial: first paint when billing is still null
   */
  const load = useCallback(async (mode: boolean | "silent" = false) => {
    if (!allowed) return;
    const pull = mode === true;
    const silent = mode === "silent";
    const gate = billingGateRef.current;
    if (!shouldRunBillingRefresh({
      now: Date.now(),
      gate,
      force: pull || (!silent && !billingRef.current),
    })) {
      return;
    }
    gate.inFlight = true;
    if (pull) setRefreshing(true);
    else if (!silent && !billingRef.current) setLoading(true);
    if (!silent) setError("");
    try {
      const [snapshot, workspace] = await Promise.all([
        api.get<Snapshot>(endpoints.billing()),
        api.get<Snapshot>(endpoints.workspace()),
      ]);
      setBilling(snapshot);
      setEntitlements(workspace.entitlements);
      // Align shared auth entitlements with VPS without bumping revision (avoids loops).
      await syncWorkspace().catch(() => undefined);
      const refreshStore = pull || silent;
      if (refreshStore && appleIapSupported() && shouldLoadAppleStoreProducts(snapshot)) {
        reloadAppleStore();
      }
      if (refreshStore && googleIapSupported() && shouldLoadGoogleStoreProducts(snapshot)) {
        reloadGoogleStore();
      }
      gate.lastRefreshAt = Date.now();
    } catch (caught) {
      if (!silent) setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally {
      gate.inFlight = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [allowed, api, reloadAppleStore, reloadGoogleStore, syncWorkspace, t]);

  useEffect(() => { void load(); }, [load]);

  // More → Refresh bumps revision; refetch OwnerBillingView so provider/plan cannot stay stale.
  useEffect(() => {
    if (revision <= 0) return;
    void load("silent");
  }, [revision, load]);

  useFocusEffect(useCallback(() => {
    void load("silent");
  }, [load]));

  // Manage-subscription return and other background→active resumes while Plan is open.
  useAppForegroundRefresh(() => {
    void load("silent");
  }, { enabled: allowed });

  const showAppleShop = appleIapSupported() && applePurchaseEligible(billing);
  const showAppleManage = appleIapSupported() && appleManaged(billing);
  const showAppleTrialSelect = appleIapSupported() && appleTrialFutureSelectionMode(billing);
  const loadAppleProducts = appleIapSupported() && shouldLoadAppleStoreProducts(billing);
  const showGoogleShop = googleIapSupported() && googlePurchaseEligible(billing);
  const showGoogleManage = googleIapSupported() && googleManaged(billing);
  const showGoogleTrialSelect = googleIapSupported() && googleTrialFutureSelectionMode(billing);
  const loadGoogleProducts = googleIapSupported() && shouldLoadGoogleStoreProducts(billing);
  const blockedProvider = appleIapSupported()
    ? appleBlockedByOtherProvider(billing)
    : googleIapSupported()
      ? googleBlockedByOtherProvider(billing)
      : null;
  const showStripeCards = shouldShowStripePromoOnMobile(billing)
    && !showAppleShop && !showAppleManage && !showAppleTrialSelect
    && !showGoogleShop && !showGoogleManage && !showGoogleTrialSelect;

  useEffect(() => {
    if (!loadAppleProducts) {
      setAppleProducts([]);
      setAppleStorefrontCountryCode(null);
      setAppleStorefrontPending(false);
      setAppleStoreError(false);
      setAppleLoading(false);
      return;
    }
    let cancelled = false;
    setAppleLoading(true);
    setAppleStorefrontPending(true);
    setAppleStoreError(false);
    // Products first (warms StoreKit), then storefront — avoids iPad null-storefront USD lock-in.
    void loadAppleStoreCatalogForPlan()
      .then(({ products, storefrontCountryCode }) => {
        if (cancelled) return;
        setAppleProducts(products);
        setAppleStorefrontCountryCode(storefrontCountryCode);
        setAppleStorefrontPending(false);
        setAppleStoreError(products.length === 0);
      })
      .catch(() => {
        if (cancelled) return;
        setAppleProducts([]);
        setAppleStorefrontCountryCode(null);
        setAppleStorefrontPending(false);
        setAppleStoreError(true);
      })
      .finally(() => {
        if (!cancelled) setAppleLoading(false);
      });
    return () => { cancelled = true; };
  }, [loadAppleProducts, billing?.purchase_source, billing?.builtin_trial?.active, appleStoreEpoch]);

  // If storefront was still null after initial load, retry once when Plan is focused again.
  useFocusEffect(useCallback(() => {
    if (!loadAppleProducts || appleStorefrontPending || appleStorefrontCountryCode) return;
    let cancelled = false;
    void loadAppleStorefrontCountryCode().then((storefront) => {
      if (cancelled || !storefront) return;
      setAppleStorefrontCountryCode(storefront);
    });
    return () => { cancelled = true; };
  }, [loadAppleProducts, appleStorefrontCountryCode, appleStorefrontPending]));

  useEffect(() => {
    if (!loadGoogleProducts) {
      setGoogleOffers([]);
      setGoogleStoreError(false);
      setGoogleLoading(false);
      return;
    }
    let cancelled = false;
    setGoogleLoading(true);
    setGoogleStoreError(false);
    void loadGoogleStoreOffers()
      .then((offers) => {
        if (cancelled) return;
        setGoogleOffers(offers);
        setGoogleStoreError(offers.length === 0);
      })
      .catch(() => {
        if (cancelled) return;
        setGoogleOffers([]);
        setGoogleStoreError(true);
      })
      .finally(() => {
        if (!cancelled) setGoogleLoading(false);
      });
    return () => { cancelled = true; };
  }, [loadGoogleProducts, billing?.purchase_source, billing?.builtin_trial?.active, googleStoreEpoch]);

  const verifyWithBackend = useCallback(async (signedTransaction: string) => {
    const snapshot = await api.post<Snapshot>(endpoints.billingAppleVerify(), {
      signed_transaction: signedTransaction,
    });
    setBilling(snapshot);
    return snapshot;
  }, [api]);

  const onPurchase = useCallback(async (productId: AppleProductId) => {
    if (!billing?.apple_app_account_token) {
      setError(t("common.error"));
      return;
    }
    setAppleBusy(true);
    setError("");
    setInfo("");
    let purchaseToFinish: Awaited<ReturnType<typeof purchaseAppleSubscription>>["purchase"] | null = null;
    try {
      const fresh = await api.get<Snapshot>(endpoints.billing());
      setBilling(fresh);
      if (appleTrialFutureSelectionMode(fresh)) {
        setError(t("plan.appleTrialSelectHint"));
        return;
      }
      if (!applePurchaseEligible(fresh) && !appleManaged(fresh)) {
        setError(userFacingAppleBillingError({ code: "purchase_source_locked" }, t("common.error")));
        return;
      }
      const { purchase, signedTransaction } = await purchaseAppleSubscription({
        productId,
        appAccountToken: String(fresh.apple_app_account_token || billing.apple_app_account_token),
      });
      purchaseToFinish = purchase;
      const snapshot = await verifyWithBackend(signedTransaction);
      if (!isActiveApplePaidEntitlement(snapshot)) {
        setError(t("plan.appleActivationFailed"));
        await load(true);
        return;
      }
      setInfo(t("plan.applePurchaseSuccess"));
      await load(true);
    } catch (caught) {
      if (isUserCancelApplePurchaseError(caught)) return;
      setError(userFacingAppleBillingError(caught, t("plan.appleActivationFailed")));
      await load(true);
    } finally {
      if (purchaseToFinish) {
        await finishAppleTransaction(purchaseToFinish);
      }
      setAppleBusy(false);
    }
  }, [api, billing, load, t, verifyWithBackend]);

  const onSelectFuture = useCallback(async (productId: AppleProductId) => {
    const meta = appleProductMeta(productId);
    if (!meta) {
      setError(t("common.error"));
      return;
    }
    setAppleBusy(true);
    setError("");
    setInfo("");
    try {
      const snapshot = await api.post<Snapshot>(endpoints.billingFuturePlan(), {
        plan: meta.plan,
        interval: meta.interval,
      });
      setBilling(snapshot);
      setInfo(t("plan.appleTrialSelectSuccess"));
    } catch (caught) {
      setError(userFacingAppleBillingError(caught, t("common.error")));
    } finally {
      setAppleBusy(false);
    }
  }, [api, t]);

  const onClearFuture = useCallback(async () => {
    setAppleBusy(true);
    setError("");
    setInfo("");
    try {
      const snapshot = await api.post<Snapshot>(endpoints.billingFuturePlanClear(), {});
      setBilling(snapshot);
      setInfo(t("plan.appleTrialClearSuccess"));
    } catch (caught) {
      setError(userFacingAppleBillingError(caught, t("common.error")));
    } finally {
      setAppleBusy(false);
    }
  }, [api, t]);

  const onRestore = useCallback(async () => {
    setAppleBusy(true);
    setError("");
    setInfo("");
    setRestoreFeedback({ text: t("plan.appleRestoreChecking"), tone: "info" });
    try {
      const restored = await restoreApplePurchases();
      if (!restored.length) {
        const none = t("plan.appleRestoreNone");
        setInfo(none);
        setRestoreFeedback({ text: none, tone: "info" });
        return;
      }
      const attempts: RestoreAttemptResult[] = [];
      for (const item of restored) {
        try {
          const snapshot = await verifyWithBackend(item.signedTransaction);
          attempts.push({
            kind: isActiveApplePaidEntitlement(snapshot) ? "activated" : "inactive",
          });
        } catch (caught) {
          attempts.push({ kind: "error", error: caught });
        } finally {
          await finishAppleTransaction(item.purchase);
        }
      }
      await load("silent");
      const summary = summarizeRestoreAttempts(attempts);
      if (summary.outcome === "success") {
        const ok = t("plan.appleRestoreSynchronized");
        setInfo(ok);
        setRestoreFeedback({ text: ok, tone: "info" });
      } else {
        const message = userFacingAppleBillingError(
          summary.error,
          t("plan.appleActivationFailed"),
        );
        setError(message);
        setRestoreFeedback({ text: message, tone: "error" });
      }
    } catch (caught) {
      const message = userFacingAppleBillingError(caught, t("plan.appleActivationFailed"));
      setError(message);
      setRestoreFeedback({ text: message, tone: "error" });
    } finally {
      setAppleBusy(false);
    }
  }, [load, t, verifyWithBackend]);

  const verifyGoogleWithBackend = useCallback(async (purchaseToken: string) => {
    const snapshot = await api.post<Snapshot>(endpoints.billingGoogleVerify(), {
      purchase_token: purchaseToken,
    });
    setBilling(snapshot);
    return snapshot;
  }, [api]);

  const onGooglePurchase = useCallback(async (option: GooglePlanOption, offer: GoogleStoreOffer) => {
    setGoogleBusy(true);
    setError("");
    setInfo("");
    let purchaseToFinish: Awaited<ReturnType<typeof purchaseGoogleSubscription>>["purchase"] | null = null;
    try {
      const fresh = await api.get<Snapshot>(endpoints.billing());
      setBilling(fresh);
      if (googleTrialFutureSelectionMode(fresh)) {
        setError(t("plan.googleTrialSelectHint"));
        return;
      }
      if (!googlePurchaseEligible(fresh)) {
        // Do not allow a second independent purchase while Google-owned (manage instead).
        setError(userFacingGoogleBillingError({ code: "purchase_source_locked" }, t("common.error")));
        return;
      }
      const { purchase, purchaseToken } = await purchaseGoogleSubscription({
        productId: offer.productId,
        basePlanId: offer.basePlanId,
        offerToken: offer.offerToken,
      });
      purchaseToFinish = purchase;
      const snapshot = await verifyGoogleWithBackend(purchaseToken);
      if (!isActiveGooglePaidEntitlement(snapshot)) {
        setError(t("plan.googleActivationFailed"));
        await load(true);
        return;
      }
      setInfo(t("plan.googlePurchaseSuccess"));
      await load(true);
    } catch (caught) {
      if (isUserCancelGooglePurchaseError(caught)) return;
      setError(userFacingGoogleBillingError(caught, t("plan.googleActivationFailed")));
      await load(true);
    } finally {
      if (purchaseToFinish) {
        try { await finishGoogleTransaction(purchaseToFinish); } catch { /* hygiene */ }
      }
      setGoogleBusy(false);
    }
  }, [api, load, t, verifyGoogleWithBackend]);

  const onGoogleSelectFuture = useCallback(async (option: GooglePlanOption) => {
    setGoogleBusy(true);
    setError("");
    setInfo("");
    try {
      const snapshot = await api.post<Snapshot>(endpoints.billingFuturePlan(), {
        plan: option.plan,
        interval: option.interval,
      });
      setBilling(snapshot);
      setInfo(t("plan.googleTrialSelectSuccess"));
    } catch (caught) {
      setError(userFacingGoogleBillingError(caught, t("common.error")));
    } finally {
      setGoogleBusy(false);
    }
  }, [api, t]);

  const onGoogleClearFuture = useCallback(async () => {
    setGoogleBusy(true);
    setError("");
    setInfo("");
    try {
      const snapshot = await api.post<Snapshot>(endpoints.billingFuturePlanClear(), {});
      setBilling(snapshot);
      setInfo(t("plan.googleTrialClearSuccess"));
    } catch (caught) {
      setError(userFacingGoogleBillingError(caught, t("common.error")));
    } finally {
      setGoogleBusy(false);
    }
  }, [api, t]);

  const onGoogleRestore = useCallback(async () => {
    setGoogleBusy(true);
    setError("");
    setInfo("");
    setRestoreFeedback({ text: t("plan.googleRestoreChecking"), tone: "info" });
    try {
      const restored = await restoreGooglePurchases();
      if (!restored.length) {
        const none = t("plan.googleRestoreNone");
        setInfo(none);
        setRestoreFeedback({ text: none, tone: "info" });
        return;
      }
      const attempts: RestoreAttemptResult[] = [];
      for (const item of restored) {
        try {
          const snapshot = await verifyGoogleWithBackend(item.purchaseToken);
          attempts.push({
            kind: isActiveGooglePaidEntitlement(snapshot) ? "activated" : "inactive",
          });
        } catch (caught) {
          attempts.push({ kind: "error", error: caught });
        } finally {
          try { await finishGoogleTransaction(item.purchase); } catch { /* hygiene */ }
        }
      }
      // Silent VPS refresh — avoid RefreshControl / full-page jump after recovery.
      await load("silent");
      const summary = summarizeRestoreAttempts(attempts);
      if (summary.outcome === "success") {
        const ok = t("plan.googleRestoreSynchronized");
        setInfo(ok);
        setRestoreFeedback({ text: ok, tone: "info" });
      } else {
        const message = userFacingGoogleBillingError(
          summary.error,
          t("plan.googleActivationFailed"),
        );
        setError(message);
        setRestoreFeedback({ text: message, tone: "error" });
      }
    } catch (caught) {
      const message = userFacingGoogleBillingError(caught, t("plan.googleActivationFailed"));
      setError(message);
      setRestoreFeedback({ text: message, tone: "error" });
    } finally {
      setGoogleBusy(false);
    }
  }, [load, t, verifyGoogleWithBackend]);

  const onManage = useCallback(async () => {
    setError("");
    try {
      await openAppleManageSubscriptions();
    } catch (caught) {
      setError(userFacingAppleBillingError(caught, t("common.error")));
    }
  }, [t]);

  const onGoogleManage = useCallback(async () => {
    setError("");
    try {
      await openGoogleManageSubscriptions(googleSkuForManagedBilling(billing));
    } catch (caught) {
      setError(userFacingGoogleBillingError(caught, t("common.error")));
    }
  }, [billing, t]);

  if (!allowed) return <Redirect href="/(app)/(tabs)/more" />;
  if (loading) return <Screen><LoadingState label={t("plan.loading")} /></Screen>;
  if (!billing) return <Screen style={styles.screen}><Alert message={error || t("common.error")} /></Screen>;

  const key = effectivePlanKey(billing, entitlements?.plan?.key);
  const trial = isBuiltinTrialSelectionMode(billing);
  const upgrades = showStripeCards ? buildUpgradePlanOptions(billing, key, bt) : [];
  const downgrades = showStripeCards ? buildDowngradePlanOptions(billing, bt) : [];
  const usage = usageRows(entitlements, bt);
  const promo = billing.catalog?.promotion;
  const summary = showStripeCards && promo?.active && promo.group === "new_basic" ? promotionSummary(billing.catalog, bt) : "";
  const date = (value?: string | null) => value ? formatDateTime(value, locale) : "";
  const mobilePlanPlatform = Platform.OS === "android" ? "android" as const : "ios" as const;
  const showCrossProviderBillingNotice = shouldShowMobileCrossProviderBillingNotice(
    billing,
    mobilePlanPlatform,
  );
  const showAppleSection = showAppleShop || showAppleManage || showAppleTrialSelect;
  const showGoogleSection = showGoogleShop || showGoogleManage || showGoogleTrialSelect;
  const preferredFuture = billing.future_paid_plan;
  const appleCards = buildApplePlanCards(billing, bt);
  const appleStoreById = appleStoreProductMap(appleProducts);
  const applePriceUnavailable = t("plan.applePriceUnavailable");
  const googlePriceUnavailable = t("plan.googlePriceUnavailable");
  const googleOfferMap = new Map(
    googleOffers.map((offer) => [`${offer.productId}:${offer.basePlanId}`, offer] as const),
  );
  const googleCards = GOOGLE_PLAN_OPTIONS.map((option) => {
    const catalogName = billing.catalog?.plans?.[option.plan]?.display_name;
    const planName = (catalogName && String(catalogName).trim())
      || (option.plan === "business" ? "Business" : "Plus");
    const intervalLabel = bt(`billing:interval.${option.interval}`);
    return { ...option, title: `${planName} ${intervalLabel}` };
  });

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, tablet && styles.contentTablet]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.blue} />}>
        <PageHeader title={bt("billing:currentPlan.title")} description={t("plan.description")} />
        <Alert message={error} />
        {info ? <Alert message={info} variant="info" /> : null}
        <SectionCard>
          <View style={styles.planRow}>
            <View style={styles.copy}>
              <Text style={styles.label}>{bt("billing:currentPlan.effectivePlan")}</Text>
              <Text style={styles.plan}>{billing.effective_plan?.display_name || billing.catalog?.plans?.[key]?.display_name || key || t("common.unknown")}</Text>
            </View>
            <StatusPill label={statusLabelForBilling(billing, bt)} tone="blue" />
          </View>
          {trial && billing.builtin_trial?.ends_at ? <Info label={bt("billing:currentPlan.trialEnds")} value={date(billing.builtin_trial.ends_at)} /> : null}
          {(trial || preferredFuture) ? (
            <Info
              label={bt("billing:trialSelection.selectedPlan")}
              value={
                preferredFuture?.key
                  ? `${preferredFuture.display_name || preferredFuture.key} · ${bt(`billing:interval.${preferredFuture.interval}`)}`
                  : bt("billing:trialSelection.noneSelected")
              }
            />
          ) : null}
          {!trial && billing.interval ? <Info label={bt("billing:currentPlan.interval")} value={bt(`billing:interval.${billing.interval}`)} /> : null}
          {!trial && billing.interval && billing.subscribed_plan?.key && showStripeCards ? <Info label={bt("billing:currentPlan.price")} value={catalogListPriceWithInterval(billing, billing.subscribed_plan.key, billing.interval) || t("plan.notApplicable")} /> : null}
          {billing.trial_ends_at && !trial ? <Info label={bt("billing:currentPlan.paidPlanStarts")} value={date(billing.trial_ends_at)} /> : null}
          {!trial && !billing.trial_ends_at && billing.current_period_end ? <Info label={bt(`billing:currentPlan.${billing.cancel_at_period_end ? "ends" : "renews"}`)} value={date(billing.current_period_end)} /> : null}
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
          {billing.scheduled_change?.active ? <Alert message={`${bt("billing:scheduledChange.title")}${billing.pending_change_effective_at ? ` · ${bt("billing:scheduledChange.begins", { date: date(billing.pending_change_effective_at) })}` : ""}`} variant="info" /> : null}
          {billing.cancel_at_period_end ? <Alert message={bt("billing:cancellation.scheduled")} variant="warning" /> : null}
        </SectionCard>

        {showCrossProviderBillingNotice && blockedProvider === "stripe" ? (
          <SectionCard>
            <Alert message={googleIapSupported() ? t("plan.googleManagedByCheckStation") : t("plan.appleManagedByCheckStation")} variant="info" />
          </SectionCard>
        ) : null}
        {showCrossProviderBillingNotice && blockedProvider === "google" ? (
          <SectionCard>
            <Alert message={t("plan.appleManagedByGoogle")} variant="info" />
          </SectionCard>
        ) : null}
        {showCrossProviderBillingNotice && blockedProvider === "apple" ? (
          <SectionCard>
            <Alert message={t("plan.googleManagedByApple")} variant="info" />
          </SectionCard>
        ) : null}

        {showAppleSection ? (
          <SectionCard
            title={showAppleTrialSelect ? t("plan.appleTrialSelectTitle") : t("plan.appleSectionTitle")}
            description={showAppleTrialSelect ? t("plan.appleTrialSelectDescription") : t("plan.appleSectionDescription")}
          >
            {showAppleTrialSelect ? <Alert message={t("plan.appleTrialSelectHint")} variant="info" /> : null}
            {appleBusy ? <Text style={styles.summary}>{t("plan.appleWorking")}</Text> : null}
            {appleLoading ? <Text style={styles.summary}>{t("plan.appleLoadingProducts")}</Text> : null}
            {!appleLoading && appleStoreError ? <Alert message={t("plan.appleProductsUnavailable")} variant="info" /> : null}
            <View style={[styles.grid, tablet && styles.gridTablet]}>
              {appleCards.map((card) => {
                const store = appleStoreById.get(card.productId);
                const storeReady = Boolean(store?.displayPrice);
                const current = Boolean(
                  billing.subscribed_plan?.key === card.plan
                  && billing.interval === card.interval
                  && billing.purchase_source === "apple",
                );
                const selectedFuture = futurePaidMatchesAppleProduct(billing, card.plan, card.interval);
                const periodKey = card.interval === "yearly" ? "billing:currentPlan.perYear" : "billing:currentPlan.perMonth";
                let actionLabel = "";
                let onAction: (() => void) | undefined;
                let actionDisabled = appleBusy || appleLoading;
                if (showAppleTrialSelect) {
                  // Trial future-plan selection is catalog-backed — StoreKit is not required.
                  actionLabel = selectedFuture ? t("plan.appleTrialSelected") : t("plan.appleTrialSelect");
                  actionDisabled = actionDisabled || selectedFuture;
                  onAction = () => void onSelectFuture(card.productId);
                } else if (showAppleShop || (showAppleManage && !current)) {
                  actionLabel = showAppleManage ? t("plan.appleChange") : t("plan.appleBuy");
                  actionDisabled = actionDisabled || !storeReady;
                  onAction = storeReady ? () => void onPurchase(card.productId) : undefined;
                }
                const badge = selectedFuture && !current
                  ? bt("billing:trialSelection.selectedBadge")
                  : current
                    ? bt("billing:currentPlan.badge")
                    : "";
                return (
                  <PlanOptionCard
                    key={card.productId}
                    actionDisabled={actionDisabled}
                    actionLabel={actionLabel}
                    badge={badge}
                    catalog={billing.catalog}
                    flags={{ current, selectedFuture }}
                    listPrice=""
                    note=""
                    onAction={onAction}
                    period={bt(periodKey)}
                    price={appleDisplayPriceForCard(store, applePriceUnavailable, {
                      productId: card.productId,
                      storefrontCountryCode: appleStorefrontCountryCode,
                      storefrontPending: appleStorefrontPending || appleLoading,
                    })}
                    recommendedBadge={false}
                    renews=""
                    title={card.title}
                    wide={tablet}
                  />
                );
              })}
            </View>
            <View style={styles.appleActions}>
              {showAppleTrialSelect && preferredFuture?.key ? (
                <Button disabled={appleBusy} label={t("plan.appleTrialClear")} onPress={() => void onClearFuture()} variant="secondary" />
              ) : null}
              {showAppleManage ? (
                <Button disabled={appleBusy} label={t("plan.appleManage")} onPress={() => void onManage()} variant="secondary" />
              ) : null}
              {!showAppleTrialSelect ? (
                <View style={styles.restoreBlock}>
                  <Pressable
                    disabled={appleBusy}
                    onPress={() => void onRestore()}
                    style={[styles.restoreLink, appleBusy && styles.restoreLinkBusy]}
                  >
                    {appleBusy ? <ActivityIndicator color={colors.blue} size="small" /> : null}
                    <Text style={styles.restoreText}>{t("plan.appleRestore")}</Text>
                  </Pressable>
                  {restoreFeedback ? (
                    <Text
                      style={[
                        styles.restoreStatus,
                        restoreFeedback.tone === "error" && styles.restoreStatusError,
                      ]}
                    >
                      {restoreFeedback.text}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </SectionCard>
        ) : null}

        {showGoogleSection ? (
          <SectionCard
            title={showGoogleTrialSelect ? t("plan.googleTrialSelectTitle") : t("plan.googleSectionTitle")}
            description={showGoogleTrialSelect ? t("plan.googleTrialSelectDescription") : t("plan.googleSectionDescription")}
          >
            {showGoogleTrialSelect ? <Alert message={t("plan.googleTrialSelectHint")} variant="info" /> : null}
            {showGoogleManage && showCrossProviderBillingNotice ? (
              <Alert message={t("plan.googleManagedBillingNote")} variant="info" />
            ) : null}
            {googleBusy ? <Text style={styles.summary}>{t("plan.googleWorking")}</Text> : null}
            {googleLoading ? <Text style={styles.summary}>{t("plan.googleLoadingProducts")}</Text> : null}
            {!googleLoading && googleStoreError ? <Alert message={t("plan.googleProductsUnavailable")} variant="info" /> : null}
            <View style={[styles.grid, tablet && styles.gridTablet]}>
              {googleCards.map((card) => {
                const offer = googleOfferMap.get(`${card.productId}:${card.basePlanId}`);
                const storeReady = Boolean(offer?.displayPrice && offer?.offerToken);
                const current = Boolean(
                  billing.subscribed_plan?.key === card.plan
                  && billing.interval === card.interval
                  && billing.purchase_source === "google",
                );
                const selectedFuture = futurePaidMatchesGoogleOption(billing, card.plan, card.interval);
                const periodKey = card.interval === "yearly" ? "billing:currentPlan.perYear" : "billing:currentPlan.perMonth";
                let actionLabel = "";
                let onAction: (() => void) | undefined;
                let actionDisabled = googleBusy || googleLoading;
                if (showGoogleTrialSelect) {
                  actionLabel = selectedFuture ? t("plan.googleTrialSelected") : t("plan.googleTrialSelect");
                  actionDisabled = actionDisabled || selectedFuture;
                  onAction = () => void onGoogleSelectFuture(card);
                } else if (showGoogleShop) {
                  actionLabel = t("plan.googleBuy");
                  actionDisabled = actionDisabled || !storeReady;
                  onAction = storeReady && offer ? () => void onGooglePurchase(card, offer) : undefined;
                } else if (showGoogleManage) {
                  // Phase 1: no in-app plan replacement — manage in Google Play.
                  actionLabel = "";
                  onAction = undefined;
                  actionDisabled = true;
                }
                const badge = selectedFuture && !current
                  ? bt("billing:trialSelection.selectedBadge")
                  : current
                    ? bt("billing:currentPlan.badge")
                    : "";
                return (
                  <PlanOptionCard
                    key={`${card.productId}:${card.basePlanId}`}
                    actionDisabled={actionDisabled || !actionLabel}
                    actionLabel={actionLabel}
                    badge={badge}
                    catalog={billing.catalog}
                    flags={{ current, selectedFuture }}
                    listPrice=""
                    note=""
                    onAction={onAction}
                    period={bt(periodKey)}
                    price={offer?.displayPrice || googlePriceUnavailable}
                    recommendedBadge={false}
                    renews=""
                    title={card.title}
                    wide={tablet}
                  />
                );
              })}
            </View>
            <View style={styles.appleActions}>
              {showGoogleTrialSelect && preferredFuture?.key ? (
                <Button disabled={googleBusy} label={t("plan.googleTrialClear")} onPress={() => void onGoogleClearFuture()} variant="secondary" />
              ) : null}
              {showGoogleManage ? (
                <Button disabled={googleBusy} label={t("plan.googleManage")} onPress={() => void onGoogleManage()} variant="secondary" />
              ) : null}
              {!showGoogleTrialSelect ? (
                <View style={styles.restoreBlock}>
                  <Pressable
                    disabled={googleBusy}
                    onPress={() => void onGoogleRestore()}
                    style={[styles.restoreLink, googleBusy && styles.restoreLinkBusy]}
                  >
                    {googleBusy ? <ActivityIndicator color={colors.blue} size="small" /> : null}
                    <Text style={styles.restoreText}>{t("plan.googleRestore")}</Text>
                  </Pressable>
                  {restoreFeedback ? (
                    <Text
                      style={[
                        styles.restoreStatus,
                        restoreFeedback.tone === "error" && styles.restoreStatusError,
                      ]}
                    >
                      {restoreFeedback.text}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </SectionCard>
        ) : null}

        {upgrades.length ? (
          <SectionCard
            title={bt(trial ? "billing:trialSelection.title" : "billing:upgrade.title")}
            description={bt(trial ? "billing:trialSelection.description" : "billing:upgrade.description")}
          >
            {/* Stripe/Admin promo headline + offer summary — never on Apple paths (showStripeCards already false there). */}
            <PlanPromoHeadline catalog={billing.catalog} />
            {summary ? <Text style={styles.summary}>{promo?.label ? `${promo.label}: ` : ""}{summary}</Text> : null}
            <OptionGrid options={upgrades} billing={billing} planKey={key} tablet={tablet} bt={bt} />
          </SectionCard>
        ) : null}
        {downgrades.length ? <SectionCard title={bt("billing:downgrade.title")} description={bt("billing:downgrade.description")}><OptionGrid options={downgrades} billing={billing} planKey={key} tablet={tablet} bt={bt} /></SectionCard> : null}
        <SectionCard title={bt("billing:usage.title")} description={bt("billing:usage.description")}>
          {usage.length ? usage.map((row) => <CapacityMeter key={row.key} count={row.usage} label={row.label} limit={row.limit} remainingLabel={row.limitNote || row.display} />) : <Text style={styles.summary}>{bt("billing:usage.unavailable")}</Text>}
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}

function OptionGrid({ options, billing, planKey, tablet, bt }: { options: PlanOption[]; billing: Snapshot; planKey: string | null; tablet: boolean; bt: (key: string, vars?: Record<string, string | number>) => string }) {
  return (
    <View style={[styles.grid, tablet && styles.gridTablet]}>
      {options.map((option) => {
        const current = isEffectiveCurrentPlanOption(billing, option.plan, option.interval, planKey);
        const pending = Boolean(billing.scheduled_change?.active && billing.pending_plan === option.plan && billing.pending_interval === option.interval);
        const recommended = option.recommended && !current && !pending && !option.selectedFuture;
        const badge = option.selectedFuture ? bt("billing:trialSelection.selectedBadge") : current ? bt("billing:currentPlan.badge") : pending ? bt("billing:currentPlan.scheduled") : recommended ? bt("billing:currentPlan.recommended") : "";
        return (
          <PlanOptionCard
            key={option.id}
            actionLabel={option.actionLabel}
            badge={badge}
            catalog={billing.catalog}
            flags={{ current, recommended, scheduled: pending, selectedFuture: option.selectedFuture }}
            listPrice={option.pricing.promotional && option.pricing.listWithInterval ? bt("billing:currentPlan.normally", { price: option.pricing.listWithInterval }) : ""}
            note={option.pricing.label || ""}
            period={bt(`billing:currentPlan.${option.pricing.promotional ? option.interval === "yearly" ? "firstYear" : "firstMonth" : option.interval === "yearly" ? "perYear" : "perMonth"}`)}
            price={option.pricing.firstPeriodFormatted || option.pricing.listWithInterval || "—"}
            recommendedBadge={recommended}
            renews={option.pricing.promotional && option.pricing.renewsAtWithInterval ? bt("billing:currentPlan.thenRenews", { price: option.pricing.renewsAtWithInterval }) : ""}
            title={option.title}
            wide={tablet}
          />
        );
      })}
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return <View style={styles.info}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { padding: 0 },
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg, width: "100%", maxWidth: 720, alignSelf: "center" },
  contentTablet: { maxWidth: 1120 },
  planRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  copy: { flex: 1 },
  label: { ...type.caption, color: colors.textMuted },
  plan: { fontSize: 28, lineHeight: 34, fontWeight: "700", color: colors.text },
  info: { minHeight: 48, justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  value: { ...type.bodyStrong, color: colors.text },
  summary: { ...type.caption, color: colors.textSecondary, marginBottom: space.sm },
  grid: { gap: space.md },
  gridTablet: { flexDirection: "row", flexWrap: "wrap" },
  appleActions: { gap: space.md, marginTop: space.md },
  restoreBlock: { gap: space.xs },
  restoreLink: {
    paddingVertical: space.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  restoreLinkBusy: { opacity: 0.7 },
  restoreText: { ...type.bodyStrong, color: colors.blue, textAlign: "center" },
  restoreStatus: { ...type.caption, color: colors.textSecondary, textAlign: "center" },
  restoreStatusError: { color: colors.danger },
});
