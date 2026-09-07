import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ApiError, endpoints } from "@checkstation/api";
import { canManageWorkspace, canViewGlobalMembers } from "@checkstation/domain";
import { Alert, LoadingState, Screen } from "../../../src/components/ui";
import { AddButton, EmptyPanel, FilterTabs, PageHeader, SearchField, StatusPill } from "../../../src/components/mobile";
import { Avatar } from "../../../src/components/Avatar";
import { useApp } from "../../../src/lib/AppProvider";
import { colors, radii, space, type } from "../../../src/theme/tokens";

type Member = { id: number; name: string; email?: string; phone?: string; status?: string; photo_url?: string | null; is_plan_locked?: boolean };
type Status = "active" | "archived";

export default function MembersScreen() {
  const { api, authState, t } = useApp(); const [rows, setRows] = useState<Member[]>([]); const [status, setStatus] = useState<Status>("active"); const [search, setSearch] = useState(""); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState("");
  const allowed = canViewGlobalMembers(authState.session); const canManage = canManageWorkspace(authState.session);
  const load = useCallback(async (refresh = false, term = search, nextStatus = status) => { refresh ? setRefreshing(true) : setLoading(true); setError(""); const params = new URLSearchParams({ status: nextStatus }); if (term.trim()) params.set("search", term.trim()); try { setRows(await api.get<Member[]>(`${endpoints.members()}?${params.toString()}`)); } catch (caught) { setError(caught instanceof ApiError ? caught.message : t("common.error")); } finally { setLoading(false); setRefreshing(false); } }, [api, search, status, t]);
  useFocusEffect(useCallback(() => { if (allowed) void load(); }, [allowed, load]));
  if (!allowed) return <Redirect href="/(app)/(tabs)/home" />;
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.blue} />}>
    <PageHeader title={t("members.title")} description={t("members.description")} action={canManage ? <AddButton label={t("members.add")} onPress={() => router.push("/(app)/member/new")} /> : undefined} />
    <FilterTabs onChange={(next) => { setStatus(next); void load(false, search, next); }} options={[{ value: "active", label: t("members.active") }, { value: "archived", label: t("members.archived") }]} value={status} />
    <SearchField onChangeText={setSearch} onSubmitEditing={() => void load(false)} placeholder={t("members.search")} value={search} />
    <Alert message={error} />
    {loading ? <View style={styles.loading}><LoadingState label={t("members.loading")} /></View> : rows.length === 0 ? <EmptyPanel body={search ? t("members.emptyFilteredBody") : status === "active" ? t("members.emptyActiveBody") : t("members.emptyArchivedBody")} icon="people-outline" title={search ? t("members.emptyFilteredTitle") : status === "active" ? t("members.emptyActiveTitle") : t("members.emptyArchivedTitle")} /> : <View style={styles.list}>{rows.map((member) => <Pressable accessibilityRole="button" disabled={Boolean(member.is_plan_locked)} key={member.id} onPress={() => router.push(`/(app)/member/${member.id}`)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed, member.is_plan_locked && styles.locked]}><Avatar name={member.name} url={member.photo_url} /><View style={styles.rowMain}><View style={styles.rowTitleLine}><Text numberOfLines={1} style={styles.name}>{member.name}</Text>{member.is_plan_locked ? <StatusPill label={t("members.planLocked")} tone="warning" /> : status === "archived" ? <StatusPill label={t("members.archivedLabel")} /> : null}</View><Text numberOfLines={1} style={styles.secondary}>{member.email || member.phone || t("members.noContact")}</Text></View><Ionicons color={colors.textMuted} name={member.is_plan_locked ? "lock-closed-outline" : "chevron-forward"} size={18} /></Pressable>)}</View>}
  </ScrollView></Screen>;
}
const styles = StyleSheet.create({ screen: { padding: 0 }, content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg }, loading: { minHeight: 260 }, list: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: "hidden" }, row: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, rowPressed: { backgroundColor: colors.surfaceMuted }, locked: { opacity: 0.65 }, rowMain: { flex: 1, gap: 3 }, rowTitleLine: { flexDirection: "row", alignItems: "center", gap: space.sm }, name: { ...type.bodyStrong, color: colors.text, flexShrink: 1 }, secondary: { ...type.caption, color: colors.textMuted } });
