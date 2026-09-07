import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { ApiError, endpoints } from "@checkstation/api";
import { formatDateTime } from "@checkstation/i18n";
import { Alert, LoadingState, Screen } from "../../../src/components/ui";
import { ActionIcon, EmptyPanel, FilterTabs, PageHeader, SearchField } from "../../../src/components/mobile";
import { useApp } from "../../../src/lib/AppProvider";
import { colors, radii, space, type } from "../../../src/theme/tokens";

type ActionFilter = "all" | "check_in" | "check_out";
type HistoryRow = { id: number; action?: string; source?: string; group_name?: string; class_name?: string; performed_at?: string; person?: { name?: string; email?: string; check_in_identifier?: string } };
export default function HistoryScreen() {
  const { api, locale, t } = useApp(); const [rows, setRows] = useState<HistoryRow[]>([]); const [search, setSearch] = useState(""); const [action, setAction] = useState<ActionFilter>("all"); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async (refresh = false, term = search, nextAction = action) => { refresh ? setRefreshing(true) : setLoading(true); setError(""); const params = new URLSearchParams(); if (term.trim()) params.set("search", term.trim()); if (nextAction !== "all") params.set("action", nextAction); try { const data = await api.get<{ items?: HistoryRow[] }>(`${endpoints.history()}?${params.toString()}`); setRows(data.items || []); } catch (caught) { setError(caught instanceof ApiError ? caught.message : t("common.error")); } finally { setLoading(false); setRefreshing(false); } }, [action, api, search, t]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.blue} />}>
    <PageHeader title={t("history.title")} description={t("history.description")} />
    <FilterTabs onChange={(next) => { setAction(next); void load(false, search, next); }} options={[{ value: "all", label: t("history.all") }, { value: "check_in", label: t("history.checkIn") }, { value: "check_out", label: t("history.checkOut") }]} value={action} />
    <SearchField onChangeText={setSearch} onSubmitEditing={() => void load(false)} placeholder={t("history.search")} value={search} />
    <Alert message={error} />
    {loading ? <View style={styles.loading}><LoadingState label={t("history.loading")} /></View> : rows.length === 0 ? <EmptyPanel body={t("history.emptyBody")} icon="time-outline" title={t("history.emptyTitle")} /> : <View style={styles.timeline}>{rows.map((row) => <Pressable key={row.id} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}><ActionIcon action={row.action} /><View style={styles.main}><View style={styles.topLine}><Text numberOfLines={1} style={styles.name}>{row.person?.name || t("common.unknown")}</Text><Text style={styles.action}>{actionLabel(row.action, t)}</Text></View><Text numberOfLines={1} style={styles.meta}>{row.group_name || ""}{row.class_name ? ` · ${row.class_name}` : ""}{row.source ? ` · ${row.source}` : ""}</Text><Text style={styles.when}>{row.performed_at ? formatDateTime(row.performed_at, locale) : ""}</Text></View></Pressable>)}</View>}
  </ScrollView></Screen>;
}
function actionLabel(action: string | undefined, t: (key: string) => string) { if (action === "check_in") return t("history.checkedIn"); if (action === "check_out") return t("history.checkedOut"); if (action === "break_start") return t("history.breakStarted"); if (action === "break_end") return t("history.breakEnded"); return action?.replace(/_/g, " ") || t("history.action"); }
const styles = StyleSheet.create({ screen: { padding: 0 }, content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg }, loading: { minHeight: 260 }, timeline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: "hidden" }, row: { minHeight: 84, flexDirection: "row", alignItems: "flex-start", gap: space.md, padding: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, rowPressed: { backgroundColor: colors.surfaceMuted }, main: { flex: 1, gap: 3 }, topLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }, name: { ...type.bodyStrong, color: colors.text, flexShrink: 1 }, action: { ...type.captionStrong, color: colors.blue }, meta: { ...type.caption, color: colors.textSecondary }, when: { fontSize: 12, color: colors.textMuted } });
