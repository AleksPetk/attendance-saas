import { useCallback, useEffect, useState } from "react";
import { Redirect, router } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { endpoints } from "@checkstation/api";
import { canManageOwnerAccount } from "@checkstation/domain";
import { Alert, Button, LoadingState, Screen } from "../../src/components/ui";
import { PageHeader, SectionCard, StatusPill } from "../../src/components/mobile";
import { AccountEmailActions } from "../../src/components/AccountEmailActions";
import { useApp } from "../../src/lib/AppProvider";
import { colors, space, type } from "../../src/theme/tokens";

type Account = { pending_primary_email?: string | null; email?: string; email_verified?: boolean; backup_email_status?: string; backup_email?: string | null; pending_backup_email?: string | null; two_factor_status?: string; preferred_language?: "en" | "ja"; sign_in_methods?: { password?: { enabled?: boolean }; google?: { linked?: boolean }; apple?: { linked?: boolean } } };

export default function AccountScreen() {
  const { api, authState, t, setLocale } = useApp();
  const [account, setAccount] = useState<Account | null>(null); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async (refresh = false) => { refresh ? setRefreshing(true) : setLoading(true); setError(""); try { setAccount(await api.get<Account>(endpoints.account())); } catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); } finally { setLoading(false); setRefreshing(false); } }, [api, t]);
  useEffect(() => { void load(); }, [load]);
  if (!canManageOwnerAccount(authState.session)) return <Redirect href="/(app)/(tabs)/more" />;
  if (loading) return <Screen><LoadingState label={t("account.loading")} /></Screen>;
  const changeLanguage = async (preferred_language: "en" | "ja") => { setError(""); try { const updated = await api.patch<Account>(endpoints.account(), { preferred_language }); setAccount(updated); setLocale(preferred_language); } catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); } };
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.blue} />}><PageHeader title={t("account.title")} description={t("account.description")} /><Alert message={error} /><SectionCard title={t("account.loginEmail")}><Detail label={t("auth.email")} value={account?.email || "—"} badge={<StatusPill label={account?.email_verified ? t("account.verified") : t("account.unverified")} tone={account?.email_verified ? "green" : "warning"} />} /><AccountEmailActions kind="primary" pending={account?.pending_primary_email} passwordEnabled={!!account?.sign_in_methods?.password?.enabled} onSaved={() => void load(true)} /></SectionCard><SectionCard title={t("account.recovery")}><Detail label={t("account.backupEmail")} value={account?.backup_email || account?.pending_backup_email || t("account.notConfigured")} badge={account?.backup_email_status === "verified" ? <StatusPill label={t("account.verified")} tone="green" /> : undefined} /><AccountEmailActions kind="backup" pending={account?.pending_backup_email} configured={!!account?.backup_email} passwordEnabled={!!account?.sign_in_methods?.password?.enabled} onSaved={() => void load(true)} /></SectionCard><SectionCard title={t("more.language")}><View style={styles.actions}><Button label="English" variant={account?.preferred_language === "en" ? "primary" : "secondary"} onPress={() => void changeLanguage("en")} /><Button label="日本語" variant={account?.preferred_language === "ja" ? "primary" : "secondary"} onPress={() => void changeLanguage("ja")} /></View></SectionCard><Button label={t("account.openSecurity")} variant="secondary" onPress={() => router.push("/(app)/security")} /><Button label={t("accountLink.open")} variant="secondary" onPress={() => router.push("/(auth)/email-link")} /></ScrollView></Screen>;
}

function Detail({ label, value, badge }: { label: string; value: string; badge?: React.ReactNode }) { return <View style={styles.detail}><View style={styles.copy}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>{badge}</View>; }
const styles = StyleSheet.create({ screen: { padding: 0 }, content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg, width: "100%", maxWidth: 720, alignSelf: "center" }, detail: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: space.sm }, copy: { flex: 1 }, label: { ...type.caption, color: colors.textMuted }, value: { ...type.bodyStrong, color: colors.text }, actions: { gap: space.sm } });
