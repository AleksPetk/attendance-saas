import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ApiError, endpoints } from "@checkstation/api";
import { canManageGroupConfiguration, canViewGlobalMembers } from "@checkstation/domain";
import { formatDateTime } from "@checkstation/i18n";
import { Alert, Button, LoadingState, Screen } from "../../../src/components/ui";
import { ActionIcon, EmptyPanel, PageHeader, SectionCard, StatCard } from "../../../src/components/mobile";
import { useApp } from "../../../src/lib/AppProvider";
import { colors, radii, space, type } from "../../../src/theme/tokens";

type Activity = { id: number; action?: string; source?: string; group_name?: string; performed_at?: string; person?: { name?: string } };
type Dashboard = { member_count?: number; group_count?: number; recent_activity?: Activity[] };

export default function HomeScreen() {
  const { api, authState, locale, t } = useApp();
  const [data, setData] = useState<Dashboard | null>(null); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState("");
  const session = authState.session;
  const showMembers = canViewGlobalMembers(session); const canConfigure = canManageGroupConfiguration(session);
  const load = useCallback(async (refresh = false) => { refresh ? setRefreshing(true) : setLoading(true); setError(""); try { setData(await api.get<Dashboard>(endpoints.dashboard())); } catch (caught) { setError(caught instanceof ApiError ? caught.message : t("common.error")); } finally { setLoading(false); setRefreshing(false); } }, [api, t]);
  useFocusEffect(useCallback(() => { void load(true); }, [load]));
  if (loading) return <Screen><LoadingState label={t("dashboard.loading")} /></Screen>;
  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.blue} />}>
        <PageHeader eyebrow={t("dashboard.eyebrow")} title={t("dashboard.title")} description={t("dashboard.description")} />
        <Alert message={error} />
        <View style={styles.stats}>
          {showMembers ? <StatCard color={colors.blue} hint={t("dashboard.membersHint")} icon="people-outline" label={t("nav.members")} onPress={() => router.push("/(app)/(tabs)/people")} value={data?.member_count || 0} /> : null}
          <StatCard color={colors.green} hint={showMembers ? t("dashboard.groupsHint") : t("dashboard.assignedGroupsHint")} icon="layers-outline" label={t("nav.groups")} onPress={() => router.push("/(app)/(tabs)/groups")} value={data?.group_count || 0} />
          <StatCard color={colors.cyan} hint={t("dashboard.recentHint")} icon="pulse-outline" label={t("dashboard.recentActions")} onPress={() => router.push("/(app)/(tabs)/history")} value={data?.recent_activity?.length || 0} />
        </View>
        <SectionCard title={t("dashboard.recentActivity")} description={t("dashboard.recentDescription")}>
          {data?.recent_activity?.length ? <View>{data.recent_activity.map((item, index) => <Pressable key={item.id} onPress={() => router.push("/(app)/(tabs)/history")} style={[styles.activityRow, index > 0 && styles.rowBorder]}><ActionIcon action={item.action} /><View style={styles.activityMain}><Text style={styles.activityName}>{item.person?.name || t("common.unknown")}</Text><Text numberOfLines={1} style={styles.activityMeta}>{item.group_name || ""}{item.source ? ` · ${item.source}` : ""}</Text></View><View style={styles.activityTime}><Text style={styles.activityWhen}>{item.performed_at ? formatDateTime(item.performed_at, locale) : ""}</Text><Ionicons color={colors.textMuted} name="chevron-forward" size={17} /></View></Pressable>)}</View> : <EmptyPanel body={t("dashboard.emptyBody")} icon="pulse-outline" title={t("dashboard.emptyTitle")} action={<Button label={t("dashboard.goGroups")} onPress={() => router.push("/(app)/(tabs)/groups")} variant="secondary" />} />}
        </SectionCard>
        <SectionCard title={t("dashboard.quickActions")}>
          <View style={styles.actions}>
            {showMembers ? <QuickAction icon="person-add-outline" label={t("dashboard.browseMembers")} onPress={() => router.push("/(app)/(tabs)/people")} /> : null}
            <QuickAction icon={canConfigure ? "add-circle-outline" : "layers-outline"} label={canConfigure ? t("dashboard.manageGroups") : t("dashboard.openGroups")} onPress={() => router.push("/(app)/(tabs)/groups")} />
            <QuickAction icon="time-outline" label={t("dashboard.viewHistory")} onPress={() => router.push("/(app)/(tabs)/history")} />
          </View>
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}><View style={styles.quickIcon}><Ionicons color={colors.blue} name={icon} size={21} /></View><Text style={styles.quickLabel}>{label}</Text><Ionicons color={colors.textMuted} name="chevron-forward" size={18} /></Pressable>; }
const styles = StyleSheet.create({ screen: { padding: 0 }, content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg, width: "100%", maxWidth: 1120, alignSelf: "center" }, stats: { flexDirection: "row", flexWrap: "wrap", gap: space.md }, activityRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md }, rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, activityMain: { flex: 1 }, activityName: { ...type.bodyStrong, color: colors.text }, activityMeta: { ...type.caption, color: colors.textMuted }, activityTime: { maxWidth: 115, flexDirection: "row", alignItems: "center", gap: 2 }, activityWhen: { ...type.caption, color: colors.textSecondary, textAlign: "right", flexShrink: 1 }, actions: { gap: space.xs }, quickAction: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radii.sm, paddingHorizontal: space.sm }, quickIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }, quickLabel: { ...type.bodyStrong, color: colors.text, flex: 1 }, pressed: { backgroundColor: colors.surfaceMuted } });
