import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ApiError, endpoints } from "@checkstation/api";
import { AuthScreen } from "../../src/components/AuthScreen";
import { Alert, Button, Field, TextLink } from "../../src/components/ui";
import { useApp } from "../../src/lib/AppProvider";
import { colors, space, type } from "../../src/theme/tokens";

export default function ForgotPasswordScreen() {
  const { api, locale, t } = useApp(); const [email, setEmail] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  async function submit() { if (!email.trim()) { setError(t("auth.emailRequired")); return; } setBusy(true); setError(""); setMessage(""); try { const result = await api.post<{ detail?: string }>(endpoints.forgotPassword(), { email: email.trim(), locale }); setMessage(result.detail || t("auth.resetSent")); } catch (caught) { setError(caught instanceof ApiError ? caught.message : t("common.error")); } finally { setBusy(false); } }
  return <AuthScreen title={t("auth.forgotTitle")} lead={t("auth.forgotLead")} footnote={<View style={styles.links}><Text style={styles.muted}>{t("auth.remembered")} </Text><TextLink label={t("auth.backToSignIn")} onPress={() => router.replace("/(auth)/sign-in")} /><TextLink label={t("auth.recoverAccount")} onPress={() => router.replace("/(auth)/recover-account")} /></View>}><View style={styles.form}><Field autoCapitalize="none" autoComplete="email" keyboardType="email-address" label={t("auth.email")} onChangeText={(v) => { setEmail(v); setError(""); }} onSubmitEditing={() => void submit()} returnKeyType="send" textContentType="emailAddress" value={email} /><Alert message={message} variant="success" /><Alert message={error} /><Button disabled={busy} label={busy ? t("auth.sending") : t("auth.sendResetLink")} loading={busy} onPress={() => void submit()} /></View></AuthScreen>;
}
const styles = StyleSheet.create({ form: { gap: space.lg }, links: { alignItems: "center", gap: space.xs }, muted: { ...type.caption, color: colors.textMuted } });
