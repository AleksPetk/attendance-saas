import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Alert, Button, Screen } from "../../../src/components/ui";
import { PageHeader, SectionCard, StatusPill } from "../../../src/components/mobile";
import { fetchStatusSnapshot, statusPollDelay, type StatusComponent, type StatusIncident, type StatusSnapshot } from "../../../src/features/help/api";
import { useApp } from "../../../src/lib/AppProvider";
import { loadMobileConfig } from "../../../src/lib/config";
import { colors, radii, space, type } from "../../../src/theme/tokens";

function tone(state: string): "green" | "warning" | "danger" | "neutral" {
  if (state === "operational" || state === "all_operational" || state === "resolved") return "green";
  if (state === "degraded" || state === "some_degraded" || state === "partial_outage" || state === "maintenance" || state === "investigating") return "warning";
  if (state === "major_outage" || state === "outage") return "danger";
  return "neutral";
}
function formatTime(value: string | null | undefined, locale: string, fallback: string) {
  if (!value) return fallback; const date = new Date(value); if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
function ServiceRow({ service }: { service: StatusComponent }) {
  return <View style={styles.serviceRow}><View style={styles.serviceCopy}><Text style={styles.serviceName}>{service.name}</Text>{service.description ? <Text style={styles.detail}>{service.description}</Text> : null}</View><StatusPill label={service.label} tone={tone(service.state)} /></View>;
}
function IncidentCard({ incident, locale, updatedLabel }: { incident: StatusIncident; locale: string; updatedLabel: string }) {
  const lastUpdate = incident.updates.at(-1);
  return <View style={styles.incident}><View style={styles.incidentHead}><Text style={styles.incidentTitle}>{incident.title}</Text><StatusPill label={incident.status_label || incident.severity_label} tone={tone(incident.status === "resolved" ? "resolved" : incident.severity)} /></View>{incident.summary ? <Text style={styles.detail}>{incident.summary}</Text> : null}{lastUpdate ? <><Text style={styles.update}>{lastUpdate.message}</Text><Text style={styles.timestamp}>{updatedLabel} {formatTime(lastUpdate.at, locale, "")}</Text></> : null}</View>;
}

export default function NativeStatusScreen() {
  const { locale, t } = useApp(); const config = loadMobileConfig();
  const [snapshot, setSnapshot] = useState<StatusSnapshot | null>(null); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState("");
  const mounted = useRef(true);
  const load = useCallback(async (refresh = false) => { refresh ? setRefreshing(true) : setLoading(true); setError(""); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs); try { const result = await fetchStatusSnapshot(config.statusBaseUrl, locale, controller.signal); if (mounted.current) setSnapshot(result); } catch { if (mounted.current) setError(t("status.error")); } finally { clearTimeout(timer); if (mounted.current) { setLoading(false); setRefreshing(false); } } }, [config.requestTimeoutMs, config.statusBaseUrl, locale, t]);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);
  useEffect(() => { if (!snapshot) return; const timer = setTimeout(() => void load(true), statusPollDelay(snapshot)); return () => clearTimeout(timer); }, [load, snapshot]);
  const groups = useMemo(() => (["core", "supporting", "peripheral"] as const).map((layer) => ({ layer, rows: snapshot?.current.components.filter((item) => item.layer === layer) || [] })).filter((group) => group.rows.length), [snapshot]);
  const layerTitle = (layer: string) => layer === "core" ? t("status.layer.core") : layer === "supporting" ? t("status.layer.supporting") : layer === "peripheral" ? t("status.layer.peripheral") : t("status.layer.other");
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.blue} />}>
    <PageHeader title={t("status.title")} description={t("status.description")} />
    {error ? <Alert message={`${error}${snapshot ? ` ${t("status.staleNotice")}` : ""}`} variant="warning" /> : null}
    {loading && !snapshot ? <Text style={styles.loading}>{t("status.loading")}</Text> : null}
    {!snapshot && error ? <Button label={t("common.retry")} onPress={() => void load()} variant="secondary" /> : null}
    {snapshot ? <><View style={[styles.overall, { borderLeftColor: tone(snapshot.current.overall.state) === "green" ? colors.green : tone(snapshot.current.overall.state) === "danger" ? colors.danger : colors.warningText }]}><View style={styles.overallIcon}><Ionicons color={tone(snapshot.current.overall.state) === "green" ? colors.successText : colors.warningText} name="pulse" size={24} /></View><View style={styles.overallCopy}><Text style={styles.overallLabel}>{t("status.overall")}</Text><Text style={styles.overallValue}>{snapshot.current.overall.label}</Text><Text style={styles.timestamp}>{t("status.lastChecked")} {formatTime(snapshot.current.last_checked_at, locale, t("status.notChecked"))}</Text></View></View>
      {groups.map((group) => <SectionCard key={group.layer} title={layerTitle(group.layer)}>{group.rows.map((service) => <ServiceRow key={service.id} service={service} />)}</SectionCard>)}
      <SectionCard title={t("status.activeIncidents")} description={t("status.activeIncidentsDescription")}>{snapshot.incidents.active.length ? snapshot.incidents.active.map((incident) => <IncidentCard incident={incident} key={incident.id} locale={locale} updatedLabel={t("status.updated")} />) : <View style={styles.emptyRow}><Ionicons color={colors.successText} name="checkmark-circle" size={20} /><Text style={styles.emptyText}>{t("status.noActiveIncidents")}</Text></View>}</SectionCard>
      <SectionCard title={t("status.maintenance")}>{snapshot.maintenance.windows.length ? snapshot.maintenance.windows.map((window) => <View key={window.id} style={styles.incident}><View style={styles.incidentHead}><Text style={styles.incidentTitle}>{window.title}</Text><StatusPill label={window.active ? t("status.inProgress") : t("status.upcoming")} tone="warning" /></View><Text style={styles.detail}>{formatTime(window.starts_at, locale, "")} – {formatTime(window.ends_at, locale, "")}</Text>{window.note ? <Text style={styles.detail}>{window.note}</Text> : null}</View>) : <Text style={styles.emptyText}>{t("status.noMaintenance")}</Text>}</SectionCard>
      {snapshot.incidents.recent.length ? <SectionCard title={t("status.recentIncidents")}>{snapshot.incidents.recent.map((incident) => <IncidentCard incident={incident} key={incident.id} locale={locale} updatedLabel={t("status.updated")} />)}</SectionCard> : null}
      <Button label={t("status.refresh")} loading={refreshing} onPress={() => void load(true)} variant="secondary" />
    </> : null}
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({ screen: { padding: 0 }, content: { width: "100%", maxWidth: 820, alignSelf: "center", padding: space.lg, paddingBottom: space.xxxl, gap: space.lg }, loading: { ...type.body, color: colors.textMuted, textAlign: "center", padding: space.xl }, overall: { flexDirection: "row", gap: space.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderRadius: radii.lg, padding: space.lg }, overallIcon: { width: 44, height: 44, borderRadius: radii.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSubtle }, overallCopy: { flex: 1, gap: 2 }, overallLabel: { ...type.captionStrong, color: colors.textMuted }, overallValue: { ...type.headline, color: colors.text }, timestamp: { ...type.caption, color: colors.textMuted }, serviceRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: space.sm }, serviceCopy: { flex: 1, gap: 2 }, serviceName: { ...type.label, color: colors.text }, detail: { ...type.caption, color: colors.textSecondary }, incident: { gap: space.sm, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, incidentHead: { flexDirection: "row", alignItems: "flex-start", gap: space.sm }, incidentTitle: { ...type.bodyStrong, color: colors.text, flex: 1 }, update: { ...type.caption, color: colors.textSecondary, backgroundColor: colors.surfaceMuted, padding: space.sm, borderRadius: radii.sm }, emptyRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: space.sm }, emptyText: { ...type.body, color: colors.textMuted } });
