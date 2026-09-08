import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { ApiError, endpoints, type ApiClient } from "@checkstation/api";
import { formatDateTime, type AppLocale } from "@checkstation/i18n";
import { Alert, LoadingState, Screen } from "../../../src/components/ui";
import { ActionIcon, EmptyPanel, FilterTabs, PageHeader, SearchField, SectionCard } from "../../../src/components/mobile";
import { AttendanceReportPanel } from "../../../src/features/history/AttendanceReportPanel";
import { DateField, SelectField, type PickerOption } from "../../../src/features/history/HistoryPicker";
import { useApp } from "../../../src/lib/AppProvider";
import { colors, radii, space, type } from "../../../src/theme/tokens";

type HistoryView = "activity" | "report";
type ActionFilter = "" | "check_in" | "check_out" | "break_start" | "break_end";
type HistoryRow = { id: number; action?: string; source?: string; group_name?: string; class_name?: string; performed_at?: string; person?: { name?: string; email?: string; check_in_identifier?: string } };
type Group = { id: number; name: string };

export default function HistoryScreen() {
  const { api, authState, locale, t } = useApp();
  const [view, setView] = useState<HistoryView>("activity");
  return <Screen style={styles.screen}>
    {view === "activity" ? <ActivityLog api={api} locale={locale} t={t} view={view} setView={setView} /> : <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"><HistoryHeader view={view} setView={setView} t={t} /><AttendanceReportPanel api={api} session={authState.session} locale={locale} t={t} /></ScrollView>}
  </Screen>;
}

function HistoryHeader({ view, setView, t }: { view: HistoryView; setView: (view: HistoryView) => void; t: (key: string) => string }) {
  return <><PageHeader title={t("history.title")} description={view === "activity" ? t("history.description") : t("history.reportDescription")} /><FilterTabs value={view} onChange={setView} options={[{ value: "activity", label: t("history.activityLog") }, { value: "report", label: t("history.attendanceReport") }]} /></>;
}

function ActivityLog({ api, locale, t, view, setView }: { api: ApiClient; locale: AppLocale; t: (key: string, vars?: Record<string, string | number>) => string; view: HistoryView; setView: (view: HistoryView) => void }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [action, setAction] = useState<ActionFilter>("");
  const [groupId, setGroupId] = useState("");
  const [day, setDay] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false, term = appliedSearch) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (term.trim()) params.set("search", term.trim());
    if (action) params.set("action", action);
    if (groupId) params.set("group_id", groupId);
    if (day) params.set("day", day);
    try {
      const data = await api.get<{ items?: HistoryRow[] }>(`${endpoints.history()}?${params.toString()}`);
      setRows(data.items || []);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("common.error"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [action, api, appliedSearch, day, groupId, t]);

  useEffect(() => {
    void api.get<Group[]>(`${endpoints.groups()}?status=active`).then(setGroups).catch(() => undefined);
  }, [api]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const groupOptions: PickerOption[] = [{ value: "", label: t("history.allGroups") }, ...groups.map((group) => ({ value: String(group.id), label: group.name }))];
  const actionOptions: PickerOption[] = [
    { value: "", label: t("history.anyAction") },
    { value: "check_in", label: t("history.checkedIn") },
    { value: "check_out", label: t("history.checkedOut") },
    { value: "break_start", label: t("history.breakStarted") },
    { value: "break_end", label: t("history.breakEnded") },
  ];
  const filtered = Boolean(search || appliedSearch || action || groupId || day);

  function clearFilters() {
    setSearch("");
    setAppliedSearch("");
    setAction("");
    setGroupId("");
    setDay("");
  }

  function applySearch() {
    const next = search.trim();
    setSearch(next);
    setAppliedSearch(next);
  }

  return <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.blue} />}>
    <HistoryHeader view={view} setView={setView} t={t} />
    <SectionCard title={t("history.filters")}>
      <View style={styles.activityFilters}>
        <View style={styles.filterRow}><View style={styles.filterHalf}><SelectField label={t("history.group")} placeholder={t("history.allGroups")} options={groupOptions} value={groupId} onChange={setGroupId} searchable t={t} /></View><View style={styles.filterHalf}><SelectField label={t("history.action")} placeholder={t("history.anyAction")} options={actionOptions} value={action} onChange={(value) => setAction(value as ActionFilter)} t={t} /></View></View>
        <SearchField onChangeText={setSearch} onSubmitEditing={applySearch} placeholder={t("history.searchPlaceholder")} value={search} />
        <View style={styles.dayRow}><View style={styles.dayField}><DateField label={t("history.day")} value={day} onChange={setDay} locale={locale} t={t} /></View>{filtered ? <Pressable accessibilityRole="button" onPress={clearFilters} style={styles.clearButton}><Text style={styles.clearText}>{t("history.clearFilters")}</Text></Pressable> : null}</View>
      </View>
    </SectionCard>
    <Alert message={error} />
    {loading ? <View style={styles.loading}><LoadingState label={t("history.loading")} /></View> : rows.length === 0 ? <EmptyPanel body={t("history.emptyBody")} icon="time-outline" title={t("history.emptyTitle")} /> : <View style={styles.timeline}>{rows.map((row) => <View key={row.id} style={styles.row}><ActionIcon action={row.action} /><View style={styles.main}><View style={styles.topLine}><Text numberOfLines={1} style={styles.name}>{row.person?.name || t("common.unknown")}</Text><Text style={styles.action}>{actionLabel(row.action, t)}</Text></View><Text numberOfLines={1} style={styles.meta}>{row.group_name || ""}{row.class_name ? ` · ${row.class_name}` : ""}{row.source ? ` · ${row.source}` : ""}</Text><Text style={styles.when}>{row.performed_at ? formatDateTime(row.performed_at, locale) : ""}</Text></View></View>)}</View>}
  </ScrollView>;
}

function actionLabel(action: string | undefined, t: (key: string) => string) {
  if (action === "check_in") return t("history.checkedIn");
  if (action === "check_out") return t("history.checkedOut");
  if (action === "break_start") return t("history.breakStarted");
  if (action === "break_end") return t("history.breakEnded");
  return action?.replace(/_/g, " ") || t("history.action");
}

const styles = StyleSheet.create({
  screen: { padding: 0 }, content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg }, loading: { minHeight: 220 }, activityFilters: { gap: space.md }, filterRow: { flexDirection: "row", gap: space.sm }, filterHalf: { flex: 1 }, dayRow: { flexDirection: "row", alignItems: "flex-end", gap: space.sm }, dayField: { flex: 1 }, clearButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: space.md, borderRadius: radii.sm, backgroundColor: colors.blueSoft }, clearText: { ...type.captionStrong, color: colors.bluePressed }, timeline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: "hidden" }, row: { minHeight: 84, flexDirection: "row", alignItems: "flex-start", gap: space.md, padding: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, main: { flex: 1, gap: 3 }, topLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }, name: { ...type.bodyStrong, color: colors.text, flexShrink: 1 }, action: { ...type.captionStrong, color: colors.blue }, meta: { ...type.caption, color: colors.textSecondary }, when: { fontSize: 12, color: colors.textMuted },
});
