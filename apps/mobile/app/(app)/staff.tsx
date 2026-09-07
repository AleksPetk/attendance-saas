import { useCallback, useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { endpoints } from "@checkstation/api";
import { canManageStaffAccounts } from "@checkstation/domain";
import { Alert, LoadingState, Screen } from "../../src/components/ui";
import { EmptyPanel, PageHeader, SectionCard, StatusPill } from "../../src/components/mobile";
import { useApp } from "../../src/lib/AppProvider";
import { colors, space, type } from "../../src/theme/tokens";

type StaffRow = { id: number; username?: string; email?: string; role?: string; status?: string; is_plan_locked?: boolean; group_access?: Array<{ group_id?: number; name?: string }> };
export default function StaffScreen() {
  const { api, authState, t } = useApp(); const [rows, setRows] = useState<StaffRow[]>([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async (refresh = false) => { refresh ? setRefreshing(true) : setLoading(true); setError(""); try { setRows(await api.get<StaffRow[]>(endpoints.workspaceStaff())); } catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); } finally { setLoading(false); setRefreshing(false); } }, [api, t]);
  useEffect(() => { void load(); }, [load]);
  if (!canManageStaffAccounts(authState.session)) return <Redirect href="/(app)/(tabs)/more" />;
  if (loading) return <Screen><LoadingState label={t("staff.loading")} /></Screen>;
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.blue} />}><PageHeader title={t("nav.staff")} description={t("staff.description")} /><Alert message={error} />{!error && !rows.length ? <SectionCard><EmptyPanel icon="id-card-outline" title={t("staff.emptyTitle")} body={t("staff.emptyBody")} /></SectionCard> : <SectionCard>{rows.map((staff, index) => <View key={staff.id} style={[styles.row, index > 0 && styles.border]}><View style={styles.avatar}><Text style={styles.initial}>{(staff.username || "?").slice(0, 1).toUpperCase()}</Text></View><View style={styles.copy}><Text style={styles.name}>{staff.username || t("common.unknown")}</Text><Text style={styles.meta}>{staff.email || t("staff.noEmail")}</Text><Text numberOfLines={2} style={styles.groups}>{staff.group_access?.length ? staff.group_access.map((group) => group.name).filter(Boolean).join(", ") : t("staff.noGroupAccess")}</Text></View><View style={styles.badges}><StatusPill label={staff.role === "admin" ? t("staff.admin") : t("nav.staff")} tone="blue" />{staff.status !== "active" ? <StatusPill label={t("staff.inactive")} tone="neutral" /> : null}{staff.is_plan_locked ? <StatusPill label={t("members.planLocked")} tone="warning" /> : null}</View></View>)}</SectionCard>}</ScrollView></Screen>;
}
const styles = StyleSheet.create({ screen: { padding: 0 }, content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg }, row: { minHeight: 80, flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md }, border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, avatar: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.navy }, initial: { ...type.bodyStrong, color: colors.textInverse }, copy: { flex: 1 }, name: { ...type.bodyStrong, color: colors.text }, meta: { ...type.caption, color: colors.textMuted }, groups: { ...type.caption, color: colors.textSecondary, marginTop: 2 }, badges: { alignItems: "flex-end", gap: 4 } });
