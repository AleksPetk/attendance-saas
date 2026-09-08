import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { ApiError, endpoints, type ApiClient } from "@checkstation/api";
import { hasPlanFeature, type WorkspaceSession } from "@checkstation/domain";
import { Alert, LoadingState } from "../../components/ui";
import { EmptyPanel, FilterTabs, SectionCard, StatusPill } from "../../components/mobile";
import { colors, radii, shadows, space, touch, type } from "../../theme/tokens";
import { DateField, SelectField, type PickerOption } from "./HistoryPicker";
import { EXPORT_DETAILS, exportFilename, reportQuery, validCustomRange, type AttendanceReport, type DatePreset, type ExportFormat, type ReportGroup, type ReportMode, type ReportOptions } from "./report";

const EXPORTS: { format: ExportFormat; feature: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { format: "pdf", feature: "report_export_pdf", icon: "document-text-outline" },
  { format: "xlsx", feature: "report_export_excel", icon: "grid-outline" },
  { format: "csv", feature: "report_export_csv", icon: "code-slash-outline" },
];

export function AttendanceReportPanel({ api, session, locale, t }: { api: ApiClient; session: WorkspaceSession | null; locale: string; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<ReportMode>("group");
  const [options, setOptions] = useState<ReportOptions>({ groups: [], members: [] });
  const [groupId, setGroupId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [participant, setParticipant] = useState("");
  const [preset, setPreset] = useState<DatePreset | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const loadOptions = useCallback(async (params = "") => {
    try {
      const data = await api.get<ReportOptions>(`${endpoints.attendanceReportOptions()}${params}`);
      setOptions((current) => ({
        groups: data.groups || current.groups,
        members: data.members || current.members,
        member_groups: "member_groups" in data ? data.member_groups || [] : current.member_groups,
        participants: "participants" in data ? data.participants || [] : current.participants,
      }));
    } catch (caught) {
      setError(errorMessage(caught, t));
    } finally {
      setLoadingOptions(false);
    }
  }, [api, t]);

  useFocusEffect(useCallback(() => { void loadOptions(); }, [loadOptions]));

  const customValid = preset !== "custom" || validCustomRange(dateFrom, dateTo);
  const primaryReady = mode === "group" ? Boolean(groupId) : Boolean(memberId);
  const filtersReady = primaryReady && Boolean(preset) && customValid;
  const query = useMemo(() => filtersReady ? reportQuery({ mode, groupId, memberId, participant, preset, dateFrom, dateTo }) : "", [dateFrom, dateTo, filtersReady, groupId, memberId, mode, participant, preset]);

  useEffect(() => {
    if (!query) {
      requestId.current += 1;
      return;
    }
    const currentRequest = ++requestId.current;
    void (async () => {
      await Promise.resolve();
      setLoadingReport(true);
      setError("");
      try {
        const data = await api.get<AttendanceReport>(`${endpoints.attendanceReport()}?${query}`);
        if (currentRequest === requestId.current) setReport(data);
      } catch (caught) {
        if (currentRequest === requestId.current) {
          setReport(null);
          setError(errorMessage(caught, t));
        }
      } finally {
        if (currentRequest === requestId.current) setLoadingReport(false);
      }
    })();
  }, [api, query, t]);

  function clearReport() {
    requestId.current += 1;
    setReport(null);
    setLoadingReport(false);
  }

  function changeMode(next: ReportMode) {
    clearReport();
    setMode(next);
    setGroupId("");
    setMemberId("");
    setParticipant("");
    setOptions((current) => ({ groups: current.groups, members: current.members }));
  }

  function changePreset(next: DatePreset) {
    clearReport();
    setPreset(next);
    if (next !== "custom") {
      setDateFrom("");
      setDateTo("");
    }
  }

  async function exportReport(format: ExportFormat) {
    if (!report?.sections?.length || !filtersReady) return;
    setExporting(format);
    setError("");
    try {
      const exportQuery = reportQuery({ mode, groupId, memberId, participant, preset, dateFrom, dateTo, exportFormat: format });
      const response = await api.get<Response>(`${endpoints.attendanceReportExport()}?${exportQuery}`, { rawResponse: true, timeoutMs: 60_000 });
      const filename = exportFilename(response.headers.get("content-disposition"), format);
      const file = new File(Paths.cache, filename);
      if (file.exists) file.delete();
      file.create({ overwrite: true, intermediates: true });
      file.write(new Uint8Array(await response.arrayBuffer()));
      if (!await Sharing.isAvailableAsync()) throw new Error(t("history.shareUnavailable"));
      const details = EXPORT_DETAILS[format];
      await Sharing.shareAsync(file.uri, { dialogTitle: t("history.exportReport"), mimeType: details.mimeType, UTI: details.uti });
    } catch (caught) {
      setError(errorMessage(caught, t) || t("history.exportFailed"));
    } finally {
      setExporting(null);
    }
  }

  const groupOptions = options.groups.map((group) => ({ value: String(group.source_group_id), label: groupLabel(group, t), detail: group.group_type === "structured" ? t("groups.structured") : t("groups.standard") }));
  const memberOptions = options.members.map((member) => ({ value: String(member.id), label: member.status === "archived" ? `${member.name} (${t("history.archived")})` : member.name }));
  const memberGroupOptions: PickerOption[] = [{ value: "", label: t("history.allMemberGroups") }, ...(options.member_groups || []).map((group) => ({ value: String(group.source_group_id), label: groupLabel(group, t) }))];
  const participantOptions: PickerOption[] = [{ value: "", label: t("history.allParticipants") }, ...(options.participants || []).map((person) => ({ value: `${person.kind}:${person.id}`, label: person.name, detail: person.participant_code }))];
  const availableExports = EXPORTS.filter((item) => hasPlanFeature(session, item.feature));

  return <View style={styles.stack}>
    <Alert message={error} />
    <SectionCard title={t("history.reportFilters")} description={t("history.reportFiltersHint")}>
      <View style={[styles.filters, width >= 700 && styles.filtersTablet]}>
        <View style={width >= 700 ? styles.tabletField : undefined}>
          <Text style={styles.fieldLabel}>{t("history.reportBy")}</Text>
          <FilterTabs value={mode} onChange={changeMode} options={[{ value: "group", label: t("history.group") }, { value: "member", label: t("history.member") }]} />
        </View>
        {mode === "group" ? <>
          <View style={width >= 700 ? styles.tabletField : undefined}><SelectField label={t("history.group")} placeholder={t("history.selectGroup")} options={groupOptions} value={groupId} onChange={(next) => { clearReport(); setGroupId(next); setParticipant(""); if (next) void loadOptions(`?source_group_id=${encodeURIComponent(next)}`); }} searchable t={t} /></View>
          <View style={width >= 700 ? styles.tabletField : undefined}><SelectField label={t("history.participantOptional")} placeholder={t("history.allParticipants")} options={participantOptions} value={participant} onChange={(next) => { clearReport(); setParticipant(next); }} disabled={!groupId} searchable t={t} /></View>
        </> : <>
          <View style={width >= 700 ? styles.tabletField : undefined}><SelectField label={t("history.member")} placeholder={t("history.selectMember")} options={memberOptions} value={memberId} onChange={(next) => { clearReport(); setMemberId(next); setGroupId(""); if (next) void loadOptions(`?member_id=${encodeURIComponent(next)}`); }} searchable t={t} /></View>
          <View style={width >= 700 ? styles.tabletField : undefined}><SelectField label={t("history.groupOptional")} placeholder={t("history.allMemberGroups")} options={memberGroupOptions} value={groupId} onChange={(next) => { clearReport(); setGroupId(next); }} disabled={!memberId} searchable t={t} /></View>
        </>}
        <View style={styles.fullWidth}><Text style={styles.fieldLabel}>{t("history.dateRange")}</Text><View style={styles.presetGrid}>{(["today", "this_week", "this_month", "custom"] as DatePreset[]).map((value) => { const selected = preset === value; return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} key={value} onPress={() => changePreset(value)} style={[styles.preset, selected && styles.presetActive]}><Text style={[styles.presetText, selected && styles.presetTextActive]}>{t(`history.preset.${value}`)}</Text></Pressable>; })}</View></View>
        {preset === "custom" ? <View style={styles.dateRow}><View style={styles.dateField}><DateField label={t("history.from")} value={dateFrom} onChange={(next) => { clearReport(); setDateFrom(next); }} locale={locale} t={t} /></View><View style={styles.dateField}><DateField label={t("history.to")} value={dateTo} onChange={(next) => { clearReport(); setDateTo(next); }} locale={locale} t={t} /></View></View> : null}
        {preset === "custom" && dateFrom && dateTo && !customValid ? <Text style={styles.validation}>{t("history.invalidDateRange")}</Text> : null}
      </View>
    </SectionCard>

    <View style={styles.exportCard}>
      <View style={styles.exportCopy}><Text style={styles.exportTitle}>{t("history.exportReport")}</Text><Text style={styles.exportHint}>{availableExports.length ? t("history.exportHint") : t("history.exportPlanRequired")}</Text></View>
      <View style={styles.exportButtons}>{availableExports.map((item) => { const busy = exporting === item.format; const disabled = !report?.sections?.length || !filtersReady || Boolean(exporting); return <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled }} disabled={disabled} key={item.format} onPress={() => void exportReport(item.format)} style={({ pressed }) => [styles.exportButton, disabled && styles.exportDisabled, pressed && !disabled && styles.exportPressed]}><Ionicons color={colors.blue} name={busy ? "hourglass-outline" : item.icon} size={18} /><Text style={styles.exportButtonText}>{item.format === "xlsx" ? t("history.excel") : item.format.toUpperCase()}</Text></Pressable>; })}</View>
    </View>

    {loadingOptions ? <View style={styles.loading}><LoadingState label={t("history.loadingOptions")} /></View> : null}
    {!loadingOptions && mode === "group" && !options.groups.length ? <EmptyPanel icon="layers-outline" title={t("history.noGroupsTitle")} body={t("history.noGroupsBody")} /> : null}
    {!loadingOptions && mode === "member" && !options.members.length ? <EmptyPanel icon="people-outline" title={t("history.noMembersTitle")} body={t("history.noMembersBody")} /> : null}
    {!loadingOptions && primaryReady && !preset ? <EmptyPanel icon="calendar-outline" title={t("history.chooseRangeTitle")} body={t("history.chooseRangeBody")} /> : null}
    {loadingReport ? <View style={styles.loading}><LoadingState label={t("history.generatingReport")} /></View> : null}
    {!loadingReport && filtersReady && report && !report.sections.length ? <EmptyPanel icon="calendar-clear-outline" title={t("history.noAttendanceTitle")} body={t("history.noAttendanceBody")} /> : null}
    {!loadingReport && report?.sections?.length ? <ReportResults report={report} t={t} /> : null}
  </View>;
}

function ReportResults({ report, t }: { report: AttendanceReport; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const title = report.report_by === "member" ? report.member_name : report.group_name;
  const context = report.report_by === "member" ? (report.source_group_id ? t("history.groupContext", { name: report.group_name }) : t("history.allMemberGroups")) : (report.participant ? t("history.participantContext", { name: report.participant.name }) : t("history.allParticipants"));
  return <View style={styles.reportCard}>
    <View style={styles.reportHeader}><View style={styles.reportHeaderCopy}><Text style={styles.reportKicker}>{t("history.attendanceReport")}</Text><Text style={styles.reportTitle}>{title}</Text><Text style={styles.reportContext}>{context}</Text><Text style={styles.reportPeriod}>{report.date_label}</Text></View>{["archived", "deleted"].includes(report.group_status || report.member_status) ? <StatusPill label={(report.group_status || report.member_status) === "deleted" ? t("history.deleted") : t("history.archived")} /> : null}</View>
    {report.sections.map((section) => <View key={section.date} style={styles.reportSection}><Text style={styles.sectionDate}>{section.label}</Text>{section.rows.map((row) => <View key={`${section.date}-${row.participant_key}`} style={styles.reportRow}><View style={styles.reportRowHeader}><Text style={styles.personName}>{row.name}</Text>{report.show_group_column && row.group_name ? <Text numberOfLines={1} style={styles.rowMeta}>{row.group_name}</Text> : null}{report.show_class_column ? <Text numberOfLines={1} style={styles.rowMeta}>{row.class_name || t("history.unknownClass")}</Text> : null}</View><View style={styles.cells}>{report.columns.map((column) => <View key={column.key} style={styles.cell}><Text style={styles.cellLabel}>{column.label}</Text><Text style={styles.cellValue}>{row.cells?.[column.key] || "—"}</Text></View>)}</View></View>)}</View>)}
  </View>;
}

function groupLabel(group: ReportGroup, t: (key: string) => string) {
  if (group.status === "archived") return `${group.name} (${t("history.archived")})`;
  if (group.status === "deleted") return `${group.name} (${t("history.deleted")})`;
  return group.name;
}

function errorMessage(caught: unknown, t: (key: string) => string) {
  if (caught instanceof ApiError) return caught.message;
  if (caught instanceof Error) return caught.message;
  return t("common.error");
}

const styles = StyleSheet.create({
  stack: { gap: space.lg }, filters: { gap: space.lg }, filtersTablet: { flexDirection: "row", flexWrap: "wrap" }, tabletField: { width: "48%" }, fullWidth: { width: "100%", gap: space.xs }, fieldLabel: { ...type.label, color: colors.textSecondary }, presetGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm }, preset: { width: "48%", minHeight: touch.min, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted, paddingHorizontal: space.sm }, presetActive: { borderColor: colors.blue, backgroundColor: colors.blueSoft }, presetText: { ...type.captionStrong, color: colors.textSecondary }, presetTextActive: { color: colors.bluePressed }, dateRow: { width: "100%", flexDirection: "row", gap: space.sm }, dateField: { flex: 1 }, validation: { ...type.caption, color: colors.dangerText },
  exportCard: { padding: space.lg, gap: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface, ...shadows.sm }, exportCopy: { gap: 2 }, exportTitle: { ...type.bodyStrong, color: colors.text }, exportHint: { ...type.caption, color: colors.textMuted }, exportButtons: { flexDirection: "row", gap: space.sm }, exportButton: { flex: 1, minHeight: touch.min, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, borderWidth: 1, borderColor: colors.blue, borderRadius: radii.sm, backgroundColor: colors.blueSoft }, exportButtonText: { ...type.captionStrong, color: colors.bluePressed }, exportDisabled: { opacity: 0.42 }, exportPressed: { backgroundColor: colors.cyanSoft }, loading: { minHeight: 150 },
  reportCard: { overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface, ...shadows.sm }, reportHeader: { flexDirection: "row", alignItems: "flex-start", padding: space.lg, gap: space.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.navy }, reportHeaderCopy: { flex: 1, gap: 2 }, reportKicker: { ...type.eyebrow, color: colors.cyan }, reportTitle: { ...type.headline, color: colors.textInverse }, reportContext: { ...type.caption, color: colors.borderStrong }, reportPeriod: { ...type.captionStrong, color: colors.surface, marginTop: space.xs }, reportSection: { borderBottomWidth: 1, borderBottomColor: colors.border }, sectionDate: { ...type.label, color: colors.bluePressed, backgroundColor: colors.blueSoft, paddingHorizontal: space.lg, paddingVertical: space.sm }, reportRow: { padding: space.lg, gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, reportRowHeader: { gap: 1 }, personName: { ...type.bodyStrong, color: colors.text }, rowMeta: { ...type.caption, color: colors.textMuted }, cells: { flexDirection: "row", flexWrap: "wrap", gap: space.sm }, cell: { flexGrow: 1, flexBasis: 84, minWidth: 76, padding: space.sm, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted }, cellLabel: { fontSize: 11, fontWeight: "600", color: colors.textMuted }, cellValue: { ...type.captionStrong, color: colors.text, marginTop: 2 },
});
