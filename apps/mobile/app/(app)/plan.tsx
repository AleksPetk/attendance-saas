import { useCallback, useEffect, useMemo, useState } from "react";
import { Redirect } from "expo-router";
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
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
  isUserCancelPurchaseError,
  loadAppleSubscriptionProducts,
  openAppleManageSubscriptions,
  purchaseAppleSubscription,
  restoreApplePurchases,
  type AppleStoreProduct,
} from "../../src/billing/appleIap";
import { appleProductMeta, type AppleProductId } from "../../src/billing/appleProducts";
import {
  appleBlockedByOtherProvider,
  appleManaged,
  applePurchaseEligible,
  appleTrialFutureSelectionMode,
  futurePaidMatchesAppleProduct,
  shouldLoadAppleStoreProducts,
  shouldShowStripePromoOnMobile,
  userFacingAppleBillingError,
} from "../../src/billing/applePlanUi";
import { colors, space, type } from "../../src/theme/tokens";

type Snapshot = Record<string, any>;

export default function PlanScreen() {
  const { api, authState, locale, t } = useApp();
  const { tablet } = useFormFactor();
  const allowed = canViewBilling(authState.session);
  const [billing, setBilling] = useState<Snapshot | null>(null);
  const [entitlements, setEntitlements] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [appleProducts, setAppleProducts] = useState<AppleStoreProduct[]>([]);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const bt = useMemo(() => billingTranslator(locale === "ja" ? "ja" : "en"), [locale]);

  const load = useCallback(async (refresh = false) => {
    if (!allowed) return;
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const [snapshot, workspace] = await Promise.all([
        api.get<Snapshot>(endpoints.billing()),
        api.get<Snapshot>(endpoints.workspace()),
      ]);
      setBilling(snapshot);
      setEntitlements(workspace.entitlements);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [allowed, api, t]);

  useEffect(() => { void load(); }, [load]);

  const showAppleShop = appleIapSupported() && applePurchaseEligible(billing);
  const showAppleManage = appleIapSupported() && appleManaged(billing);
  const showAppleTrialSelect = appleIapSupported() && appleTrialFutureSelectionMode(billing);
  const loadAppleProducts = appleIapSupported() && shouldLoadAppleStoreProducts(billing);
  const blockedProvider = appleIapSupported() ? appleBlockedByOtherProvider(billing) : null;
  const showStripeCards = shouldShowStripePromoOnMobile(billing) && !showAppleShop && !showAppleManage && !showAppleTrialSelect;

  useEffect(() => {
    if (!loadAppleProducts) {
      setAppleProducts([]);
      return;
    }
    let cancelled = false;
    setAppleLoading(true);
    void loadAppleSubscriptionProducts()
      .then((products) => {
        if (!cancelled) setAppleProducts(products);
      })
      .catch(() => {
        if (!cancelled) setAppleProducts([]);
      })
      .finally(() => {
        if (!cancelled) setAppleLoading(false);
      });
    return () => { cancelled = true; };
  }, [loadAppleProducts, billing?.purchase_source, billing?.builtin_trial?.active]);

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
      await verifyWithBackend(signedTransaction);
      await finishAppleTransaction(purchase);
      setInfo(t("plan.applePurchaseSuccess"));
      await load(true);
    } catch (caught) {
      if (isUserCancelPurchaseError(caught)) return;
      setError(userFacingAppleBillingError(caught, t("common.error")));
    } finally {
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
    try {
      const restored = await restoreApplePurchases();
      if (!restored.length) {
        setInfo(t("plan.appleRestoreNone"));
        return;
      }
      for (const item of restored) {
        await verifyWithBackend(item.signedTransaction);
        await finishAppleTransaction(item.purchase);
      }
      setInfo(t("plan.appleRestoreSuccess"));
      await load(true);
    } catch (caught) {
      setError(userFacingAppleBillingError(caught, t("common.error")));
    } finally {
      setAppleBusy(false);
    }
  }, [load, t, verifyWithBackend]);

  const onManage = useCallback(async () => {
    setError("");
    try {
      await openAppleManageSubscriptions();
    } catch (caught) {
      setError(userFacingAppleBillingError(caught, t("common.error")));
    }
  }, [t]);

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
  const showAppleSection = showAppleShop || showAppleManage || showAppleTrialSelect;
  const preferredFuture = billing.future_paid_plan;
  const appleCards = appleProducts;

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

        {blockedProvider === "stripe" ? (
          <SectionCard>
            <Alert message={t("plan.appleManagedByCheckStation")} variant="info" />
          </SectionCard>
        ) : null}
        {blockedProvider === "google" ? (
          <SectionCard>
            <Alert message={t("plan.appleManagedByGoogle")} variant="info" />
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
            {!appleLoading && !appleCards.length ? <Alert message={t("plan.appleProductsUnavailable")} /> : null}
            <View style={[styles.grid, tablet && styles.gridTablet]}>
              {appleCards.map((product) => {
                const meta = appleProductMeta(product.productId);
                const current = Boolean(
                  meta
                  && billing.subscribed_plan?.key === meta.plan
                  && billing.interval === meta.interval
                  && billing.purchase_source === "apple",
                );
                const selectedFuture = futurePaidMatchesAppleProduct(billing, meta?.plan, meta?.interval);
                return (
                  <View key={product.productId} style={[styles.appleCard, tablet && styles.appleCardWide]}>
                    <Text style={styles.appleTitle}>{meta?.titleKey || product.title}</Text>
                    <Text style={styles.applePrice}>{product.displayPrice || "—"}</Text>
                    {current ? <Text style={styles.appleBadge}>{bt("billing:currentPlan.badge")}</Text> : null}
                    {selectedFuture && !current ? <Text style={styles.appleBadge}>{bt("billing:trialSelection.selectedBadge")}</Text> : null}
                    {showAppleTrialSelect ? (
                      <Button
                        disabled={appleBusy || appleLoading || selectedFuture}
                        label={selectedFuture ? t("plan.appleTrialSelected") : t("plan.appleTrialSelect")}
                        onPress={() => void onSelectFuture(product.productId)}
                      />
                    ) : null}
                    {showAppleShop || (showAppleManage && !current) ? (
                      <Button
                        disabled={appleBusy || appleLoading}
                        label={showAppleManage ? t("plan.appleChange") : t("plan.appleBuy")}
                        onPress={() => void onPurchase(product.productId)}
                      />
                    ) : null}
                  </View>
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
                <Pressable disabled={appleBusy} onPress={() => void onRestore()} style={styles.restoreLink}>
                  <Text style={styles.restoreText}>{t("plan.appleRestore")}</Text>
                </Pressable>
              ) : null}
            </View>
          </SectionCard>
        ) : null}

        {upgrades.length ? <SectionCard title={bt(trial ? "billing:trialSelection.title" : "billing:upgrade.title")} description={bt(trial ? "billing:trialSelection.description" : "billing:upgrade.description")}><PlanPromoHeadline catalog={billing.catalog} />{summary ? <Text style={styles.summary}>{promo?.label ? `${promo.label}: ` : ""}{summary}</Text> : null}<OptionGrid options={upgrades} billing={billing} planKey={key} tablet={tablet} bt={bt} /></SectionCard> : null}
        {downgrades.length ? <SectionCard title={bt("billing:downgrade.title")} description={bt("billing:downgrade.description")}><OptionGrid options={downgrades} billing={billing} planKey={key} tablet={tablet} bt={bt} /></SectionCard> : null}
        <SectionCard title={bt("billing:usage.title")} description={bt("billing:usage.description")}>
          {usage.length ? usage.map((row) => <CapacityMeter key={row.key} count={row.usage} label={row.label} limit={row.limit} remainingLabel={row.limitNote || row.display} />) : <Text style={styles.summary}>{bt("billing:usage.unavailable")}</Text>}
        </SectionCard>
        {Platform.OS === "ios" ? <Text style={styles.note}>{t("plan.nativeBillingNote")}</Text> : <Text style={styles.note}>{t("plan.nativeBillingNote")}</Text>}
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
  note: { ...type.caption, color: colors.textMuted },
  appleCard: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 12, padding: space.md, gap: space.sm, backgroundColor: colors.surface },
  appleCardWide: { width: "48%", flexGrow: 1 },
  appleTitle: { ...type.bodyStrong, color: colors.text },
  applePrice: { fontSize: 22, fontWeight: "700", color: colors.text },
  appleBadge: { ...type.caption, color: colors.blue },
  appleActions: { gap: space.md, marginTop: space.md },
  restoreLink: { paddingVertical: space.sm },
  restoreText: { ...type.bodyStrong, color: colors.blue, textAlign: "center" },
});
