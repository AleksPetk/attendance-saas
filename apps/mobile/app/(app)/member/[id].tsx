import { useEffect, useState } from "react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Alert as NativeAlert, ScrollView, StyleSheet, Text, View } from "react-native";
import { endpoints } from "@checkstation/api";
import { canManageWorkspace, canViewGlobalMembers } from "@checkstation/domain";
import { Alert, Button, LoadingState, Screen, TextLink } from "../../../src/components/ui";
import { PageHeader, SectionCard, StatusPill } from "../../../src/components/mobile";
import { Avatar } from "../../../src/components/Avatar";
import { MemberEditor, type MemberRecord } from "../../../src/components/MemberEditor";
import { useApp } from "../../../src/lib/AppProvider";
import { colors, space, type } from "../../../src/theme/tokens";

type Member = MemberRecord & { full_name?: string; check_in_identifier?: string };
export default function MemberDetailScreen() {
  const router = useRouter(); const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(false);
  const { id } = useLocalSearchParams<{ id: string }>(); const { api, authState, t } = useApp(); const [member, setMember] = useState<Member | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { let cancelled = false; void api.get<Member>(endpoints.member(id)).then((value) => { if (!cancelled) setMember(value); }).catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : t("common.error")); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [api, id, t]);
  if (!canViewGlobalMembers(authState.session)) return <Redirect href="/(app)/(tabs)/home" />;
  if (loading) return <Screen><LoadingState label={t("members.loading")} /></Screen>;
  async function mutate(action: "archive" | "restore" | "permanently-delete") {
    setBusy(true); setError("");
    try {
      const result = await api.post<Member>(endpoints.member(id) + action + "/", {});
      if (action === "permanently-delete") router.replace("/(app)/(tabs)/people");
      else setMember(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); }
    finally { setBusy(false); }
  }
  function confirm(action: "archive" | "permanently-delete") {
    NativeAlert.alert(t(action === "archive" ? "members.archive" : "members.delete"), t(action === "archive" ? "members.archiveConfirm" : "members.deleteConfirm", { name: member?.name || "" }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.confirm"), style: "destructive", onPress: () => void mutate(action) },
    ]);
  }
  const name = member?.name || member?.full_name || t("members.title");
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content}><View style={styles.hero}><Avatar name={name} size={72} url={member?.photo_url} /><View style={styles.heroCopy}><PageHeader title={name} />{member?.is_plan_locked ? <StatusPill label={t("members.planLocked")} tone="warning" /> : <StatusPill label={member?.status === "archived" ? t("members.archivedLabel") : t("members.active")} tone={member?.status === "archived" ? "neutral" : "green"} />}</View></View><Alert message={error} />{member ? <SectionCard title={t("members.contactDetails")}><Info label={t("auth.email")} value={member.email || "—"} /><Info label={t("members.phone")} value={member.phone || "—"} /><Info label={t("members.identifier")} value={member.check_in_identifier || "—"} /><Info label={t("members.birthday")} value={member.date_of_birth || "—"} /><Info label={t("members.address")} value={member.address || "—"} /><Info label={t("members.notes")} value={member.notes || "—"} /></SectionCard> : null}{member && canManageWorkspace(authState.session) ? <View style={{ gap: space.md }}>
    {member.status === "archived" ? <><Button label={t("members.restore")} loading={busy} onPress={() => void mutate("restore")} /><TextLink disabled={busy} label={t("members.delete")} onPress={() => confirm("permanently-delete")} /></> : !member.is_plan_locked ? <><Button label={t("members.edit")} disabled={busy} onPress={() => setEditing(true)} /><TextLink disabled={busy} label={t("members.archive")} onPress={() => confirm("archive")} /></> : null}
    </View> : null}</ScrollView>{editing && member ? <MemberEditor member={member} onClose={() => setEditing(false)} onSaved={(saved) => { setMember(saved); setEditing(false); }} /> : null}</Screen>;
}
function Info({ label, value }: { label: string; value: string }) { return <View style={styles.info}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>; }
const styles = StyleSheet.create({ screen: { padding: 0 }, content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg, width: "100%", maxWidth: 720, alignSelf: "center" }, hero: { flexDirection: "row", alignItems: "center", gap: space.lg }, heroCopy: { flex: 1, alignItems: "flex-start", gap: space.sm }, info: { minHeight: 52, justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, label: { ...type.caption, color: colors.textMuted }, value: { ...type.bodyStrong, color: colors.text } });
