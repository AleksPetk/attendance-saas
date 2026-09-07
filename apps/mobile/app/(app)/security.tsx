import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { endpoints } from "@checkstation/api";
import { canManageOwnerAccount } from "@checkstation/domain";
import { Alert, LoadingState, Screen } from "../../src/components/ui";
import { PageHeader, SectionCard, StatusPill } from "../../src/components/mobile";
import { useApp } from "../../src/lib/AppProvider";
import { colors, space, type } from "../../src/theme/tokens";

type Account = { two_factor_status?: string; sign_in_methods?: { password?: { enabled?: boolean }; google?: { linked?: boolean; provider_email?: string | null }; apple?: { linked?: boolean; provider_email?: string | null } } };
export default function SecurityScreen() {
  const { api, authState, t } = useApp(); const [account, setAccount] = useState<Account | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { let cancelled = false; void api.get<Account>(endpoints.account()).then((value) => { if (!cancelled) setAccount(value); }).catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : t("common.error")); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [api, t]);
  if (!canManageOwnerAccount(authState.session)) return <Redirect href="/(app)/(tabs)/more" />;
  if (loading) return <Screen><LoadingState label={t("security.loading")} /></Screen>;
  const methods = account?.sign_in_methods;
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content}><PageHeader title={t("nav.security")} description={t("security.description")} /><Alert message={error} /><SectionCard title={t("security.twoFactor")}><SecurityRow icon="shield-checkmark-outline" title={t("security.authenticator")} enabled={account?.two_factor_status === "enabled"} /></SectionCard><SectionCard title={t("security.signInMethods")}><SecurityRow icon="key-outline" title={t("security.password")} enabled={Boolean(methods?.password?.enabled)} /><SecurityRow icon="logo-google" title="Google" enabled={Boolean(methods?.google?.linked)} detail={methods?.google?.provider_email || undefined} /><SecurityRow icon="logo-apple" title="Apple" enabled={Boolean(methods?.apple?.linked)} detail={methods?.apple?.provider_email || undefined} /></SectionCard><Alert variant="info" message={t("security.nativeManagementGap")} /></ScrollView></Screen>;
}
function SecurityRow({ icon, title, enabled, detail }: { icon: keyof typeof Ionicons.glyphMap; title: string; enabled: boolean; detail?: string }) { const { t } = useApp(); return <View style={styles.row}><View style={styles.icon}><Ionicons color={colors.blue} name={icon} size={20} /></View><View style={styles.copy}><Text style={styles.title}>{title}</Text>{detail ? <Text style={styles.detail}>{detail}</Text> : null}</View><StatusPill label={enabled ? t("security.enabled") : t("security.notEnabled")} tone={enabled ? "green" : "neutral"} /></View>; }
const styles = StyleSheet.create({ screen: { padding: 0 }, content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg }, row: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }, copy: { flex: 1 }, title: { ...type.bodyStrong, color: colors.text }, detail: { ...type.caption, color: colors.textMuted } });
