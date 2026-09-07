import { useCallback, useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { endpoints } from "@checkstation/api";
import { canViewBilling } from "@checkstation/domain";
import { Alert, LoadingState, Screen } from "../../src/components/ui";
import { PageHeader, SectionCard, StatusPill } from "../../src/components/mobile";
import { useApp } from "../../src/lib/AppProvider";
import { colors, space, type } from "../../src/theme/tokens";

type Billing = { effective_plan?: { key?: string; display_name?: string }; subscribed_plan?: { display_name?: string }; status?: string; interval?: string | null; trial_ends_at?: string | null; current_period_end?: string | null; cancel_at_period_end?: boolean; managed_by_platform?: boolean };
export default function PlanScreen() {
  const { api, authState, t } = useApp(); const [billing, setBilling] = useState<Billing | null>(null); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async (refresh = false) => { refresh ? setRefreshing(true) : setLoading(true); setError(""); try { setBilling(await api.get<Billing>(endpoints.billing())); } catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); } finally { setLoading(false); setRefreshing(false); } }, [api, t]); useEffect(() => { void load(); }, [load]);
  if (!canViewBilling(authState.session)) return <Redirect href="/(app)/(tabs)/more" />;
  if (loading) return <Screen><LoadingState label={t("plan.loading")} /></Screen>;
  const plan = billing?.effective_plan?.display_name || billing?.effective_plan?.key || t("common.unknown");
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.blue} />}><PageHeader title={t("plan.title")} description={t("plan.description")} /><Alert message={error} />{billing ? <><SectionCard><View style={styles.planRow}><View><Text style={styles.label}>{t("plan.current")}</Text><Text style={styles.plan}>{plan}</Text></View><StatusPill label={billing.status || t("plan.available")} tone="blue" /></View></SectionCard><SectionCard title={t("plan.subscription")}><Info label={t("plan.billingInterval")} value={billing.interval || t("plan.notApplicable")} /><Info label={t("plan.renewsEnds")} value={billing.trial_ends_at || billing.current_period_end || t("plan.notApplicable")} /><Info label={t("plan.management")} value={billing.managed_by_platform ? t("plan.platformManaged") : t("plan.workspaceManaged")} />{billing.cancel_at_period_end ? <StatusPill label={t("plan.cancellationScheduled")} tone="warning" /> : null}</SectionCard></> : null}</ScrollView></Screen>;
}
function Info({ label, value }: { label: string; value: string }) { return <View style={styles.info}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
const styles = StyleSheet.create({ screen: { padding: 0 }, content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg }, planRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }, label: { ...type.caption, color: colors.textMuted }, plan: { fontSize: 28, lineHeight: 34, fontWeight: "700", color: colors.text }, info: { minHeight: 48, justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, value: { ...type.bodyStrong, color: colors.text, textTransform: "capitalize" } });
