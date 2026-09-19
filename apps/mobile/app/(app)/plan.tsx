import { useCallback, useEffect, useMemo, useState } from "react";
import { Redirect } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { endpoints } from "@checkstation/api";
import { canViewBilling } from "@checkstation/domain";
import { formatDateTime } from "@checkstation/i18n";
import { Alert, LoadingState, Screen } from "../../src/components/ui";
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
  const bt = useMemo(() => billingTranslator(locale === "ja" ? "ja" : "en"), [locale]);
  const load = useCallback(async (refresh = false) => {
    if (!allowed) return;
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const [snapshot, workspace] = await Promise.all([api.get<Snapshot>(endpoints.billing()), api.get<Snapshot>(endpoints.workspace())]);
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
  if (!allowed) return <Redirect href="/(app)/(tabs)/more" />;
  if (loading) return <Screen><LoadingState label={t("plan.loading")} /></Screen>;
  if (!billing) return <Screen style={styles.screen}><Alert message={error || t("common.error")} /></Screen>;

  const key = effectivePlanKey(billing, entitlements?.plan?.key);
  const trial = isBuiltinTrialSelectionMode(billing);
  const upgrades = buildUpgradePlanOptions(billing, key, bt);
  const downgrades = buildDowngradePlanOptions(billing, bt);
  const usage = usageRows(entitlements, bt);
  const promo = billing.catalog?.promotion;
  const summary = promo?.active && promo.group === "new_basic" ? promotionSummary(billing.catalog, bt) : "";
  const date = (value?: string | null) => value ? formatDateTime(value, locale) : "";

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, tablet && styles.contentTablet]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.blue} />}>
        <PageHeader title={bt("billing:currentPlan.title")} description={t("plan.description")} />
        <Alert message={error} />
        <SectionCard>
          <View style={styles.planRow}>
            <View style={styles.copy}>
              <Text style={styles.label}>{bt("billing:currentPlan.effectivePlan")}</Text>
              <Text style={styles.plan}>{billing.effective_plan?.display_name || billing.catalog?.plans?.[key]?.display_name || key || t("common.unknown")}</Text>
            </View>
            <StatusPill label={statusLabelForBilling(billing, bt)} tone="blue" />
          </View>
          {trial && billing.builtin_trial?.ends_at ? <Info label={bt("billing:currentPlan.trialEnds")} value={date(billing.builtin_trial.ends_at)} /> : null}
          {trial ? <Info label={bt("billing:trialSelection.selectedPlan")} value={billing.future_paid_plan?.key ? `${billing.future_paid_plan.display_name || billing.future_paid_plan.key} · ${bt(`billing:interval.${billing.future_paid_plan.interval}`)}` : bt("billing:trialSelection.noneSelected")} /> : null}
          {!trial && billing.interval ? <Info label={bt("billing:currentPlan.interval")} value={bt(`billing:interval.${billing.interval}`)} /> : null}
          {!trial && billing.interval && billing.subscribed_plan?.key ? <Info label={bt("billing:currentPlan.price")} value={catalogListPriceWithInterval(billing, billing.subscribed_plan.key, billing.interval) || t("plan.notApplicable")} /> : null}
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
        {upgrades.length ? <SectionCard title={bt(trial ? "billing:trialSelection.title" : "billing:upgrade.title")} description={bt(trial ? "billing:trialSelection.description" : "billing:upgrade.description")}><PlanPromoHeadline catalog={billing.catalog} />{summary ? <Text style={styles.summary}>{promo?.label ? `${promo.label}: ` : ""}{summary}</Text> : null}<OptionGrid options={upgrades} billing={billing} planKey={key} tablet={tablet} bt={bt} /></SectionCard> : null}
        {downgrades.length ? <SectionCard title={bt("billing:downgrade.title")} description={bt("billing:downgrade.description")}><OptionGrid options={downgrades} billing={billing} planKey={key} tablet={tablet} bt={bt} /></SectionCard> : null}
        <SectionCard title={bt("billing:usage.title")} description={bt("billing:usage.description")}>
          {usage.length ? usage.map((row) => <CapacityMeter key={row.key} count={row.usage} label={row.label} limit={row.limit} remainingLabel={row.limitNote || row.display} />) : <Text style={styles.summary}>{bt("billing:usage.unavailable")}</Text>}
        </SectionCard>
        <Text style={styles.note}>{t("plan.nativeBillingNote")}</Text>
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
});
