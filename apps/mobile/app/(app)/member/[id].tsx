import { useEffect, useState } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { endpoints } from "@checkstation/api";
import { canViewGlobalMembers } from "@checkstation/domain";
import { Alert, LoadingState, Screen } from "../../../src/components/ui";
import { PageHeader, SectionCard, StatusPill } from "../../../src/components/mobile";
import { useApp } from "../../../src/lib/AppProvider";
import { colors, space, type } from "../../../src/theme/tokens";

type Member = { name?: string; full_name?: string; email?: string; phone?: string; status?: string; photo_url?: string | null; check_in_identifier?: string; is_plan_locked?: boolean };
export default function MemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { api, authState, t } = useApp(); const [member, setMember] = useState<Member | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { let cancelled = false; void api.get<Member>(endpoints.member(id)).then((value) => { if (!cancelled) setMember(value); }).catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : t("common.error")); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [api, id, t]);
  if (!canViewGlobalMembers(authState.session)) return <Redirect href="/(app)/(tabs)/home" />;
  if (loading) return <Screen><LoadingState label={t("members.loading")} /></Screen>;
  const name = member?.name || member?.full_name || t("members.title");
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content}><View style={styles.hero}>{member?.photo_url ? <Image source={{ uri: member.photo_url }} style={styles.avatar} /> : <View style={styles.fallback}><Text style={styles.initial}>{name.slice(0, 1).toUpperCase()}</Text></View>}<View style={styles.heroCopy}><PageHeader title={name} />{member?.is_plan_locked ? <StatusPill label={t("members.planLocked")} tone="warning" /> : <StatusPill label={member?.status === "archived" ? t("members.archivedLabel") : t("members.active")} tone={member?.status === "archived" ? "neutral" : "green"} />}</View></View><Alert message={error} />{member ? <SectionCard title={t("members.contactDetails")}><Info label={t("auth.email")} value={member.email || "—"} /><Info label={t("members.phone")} value={member.phone || "—"} /><Info label={t("members.identifier")} value={member.check_in_identifier || "—"} /></SectionCard> : null}</ScrollView></Screen>;
}
function Info({ label, value }: { label: string; value: string }) { return <View style={styles.info}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>; }
const styles = StyleSheet.create({ screen: { padding: 0 }, content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg }, hero: { flexDirection: "row", alignItems: "center", gap: space.lg }, heroCopy: { flex: 1, alignItems: "flex-start", gap: space.sm }, avatar: { width: 72, height: 72, borderRadius: 22, backgroundColor: colors.surfaceSubtle }, fallback: { width: 72, height: 72, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.blueSoft }, initial: { fontSize: 28, fontWeight: "700", color: colors.bluePressed }, info: { minHeight: 52, justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, label: { ...type.caption, color: colors.textMuted }, value: { ...type.bodyStrong, color: colors.text } });
