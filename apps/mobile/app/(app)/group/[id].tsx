import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { endpoints } from "@checkstation/api";
import { canLaunchKiosk, canManageGroupConfiguration } from "@checkstation/domain";
import { Alert, Button, LoadingState, Screen } from "../../../src/components/ui";
import { PageHeader, SectionCard, StatusPill } from "../../../src/components/mobile";
import { useApp } from "../../../src/lib/AppProvider";
import { colors, space, type } from "../../../src/theme/tokens";

type Group = { name?: string; group_type?: string; status?: string; participant_count?: number; member_count?: number; group_only_participant_count?: number; is_plan_locked?: boolean; readiness?: { setup_complete?: boolean } };
export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { api, authState, t } = useApp(); const router = useRouter(); const [group, setGroup] = useState<Group | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => { let cancelled = false; void api.get<Group>(endpoints.group(id)).then((value) => { if (!cancelled) setGroup(value); }).catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : t("common.error")); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [api, id, t]);
  if (loading) return <Screen><LoadingState label={t("groups.loading")} /></Screen>;
  const total = group?.participant_count ?? ((group?.member_count || 0) + (group?.group_only_participant_count || 0)); const locked = Boolean(group?.is_plan_locked); const canConfigure = canManageGroupConfiguration(authState.session); const canKiosk = canLaunchKiosk(authState.session) && !locked && group?.status !== "archived";
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content}><PageHeader title={group?.name || t("groups.title")} description={group?.group_type === "structured" ? t("groups.structured") : t("groups.standard")} /><Alert message={error} />{group ? <><SectionCard><View style={styles.summary}><View><Text style={styles.count}>{total}</Text><Text style={styles.label}>{t("groups.participantLabel")}</Text></View><View style={styles.badges}>{locked ? <StatusPill label={t("groups.planLocked")} tone="warning" /> : <StatusPill label={group.status === "archived" ? t("groups.archivedLabel") : t("groups.activeLabel")} tone={group.status === "archived" ? "neutral" : "green"} />}{group.readiness && !group.readiness.setup_complete ? <StatusPill label={t("groups.setupIncomplete")} tone="warning" /> : null}</View></View></SectionCard><SectionCard title={t("groups.actions")}><View style={styles.actions}>{canKiosk ? <Button label={t("kiosk.open")} onPress={() => router.push(`/kiosk/${id}`)} /> : null}{canConfigure && !locked ? <Button label={t("kiosk.settings")} variant="secondary" onPress={() => router.push(`/(app)/group/${id}/kiosk-settings`)} /> : null}</View></SectionCard></> : null}</ScrollView></Screen>;
}
const styles = StyleSheet.create({ screen: { padding: 0 }, content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg }, summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }, count: { fontSize: 30, lineHeight: 36, fontWeight: "700", color: colors.text }, label: { ...type.caption, color: colors.textMuted }, badges: { alignItems: "flex-end", gap: space.xs }, actions: { gap: space.sm } });
