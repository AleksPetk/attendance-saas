import { useRef, useState } from "react";
import { Linking, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { AuthScreen } from "../../src/components/AuthScreen";
import { Alert, Button, Field, OAuthProviderButtons, PasswordVisibilityButton, TextLink } from "../../src/components/ui";
import { useApp } from "../../src/lib/AppProvider";
import { colors, space, type } from "../../src/theme/tokens";

export default function RegisterScreen() {
  const { api, locale, t } = useApp();
  const [values, setValues] = useState({ email: "", password: "", passwordConfirm: "", firstName: "", lastName: "" });
  const [visible, setVisible] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const passwordRef = useRef<TextInput | null>(null);
  const confirmRef = useRef<TextInput | null>(null);
  const firstRef = useRef<TextInput | null>(null);
  const lastRef = useRef<TextInput | null>(null);
  const set = (key: keyof typeof values, value: string) => { setValues((current) => ({ ...current, [key]: value })); setFieldErrors((current) => ({ ...current, [key]: "" })); setError(""); };

  async function submit() {
    if (!accepted) { setFieldErrors((current) => ({ ...current, legal: t("auth.legalRequired") })); return; }
    setBusy(true); setError(""); setFieldErrors({});
    try {
      const result = await api.post<{ email?: string; detail?: string; verification_email_sent?: boolean }>(endpoints.register(), {
        email: values.email.trim(), password: values.password, password_confirm: values.passwordConfirm,
        first_name: values.firstName.trim(), last_name: values.lastName.trim(), legal_acknowledgement: accepted, locale,
      });
      router.replace({ pathname: "/(auth)/check-email", params: { email: result.email || values.email.trim(), detail: result.detail || "", sent: result.verification_email_sent ? "1" : "0" } });
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fields = fieldErrorsFromBody(caught.data);
        setFieldErrors({ email: fields.email || "", password: fields.password || "", passwordConfirm: fields.password_confirm || "", legal: fields.legal_acknowledgement || "" });
        if (!Object.values(fields).some(Boolean)) setError(caught.message);
      } else setError(t("common.error"));
    } finally { setBusy(false); }
  }

  return (
    <AuthScreen title={t("auth.registerTitle")} footnote={<View style={styles.inline}><Text style={styles.muted}>{t("auth.alreadyAccount")} </Text><TextLink label={t("auth.signIn")} onPress={() => router.replace("/(auth)/sign-in")} /></View>}>
      <View style={styles.form}>
        <Field autoCapitalize="none" autoComplete="email" error={fieldErrors.email} keyboardType="email-address" label={t("auth.email")} onChangeText={(v) => set("email", v)} onSubmitEditing={() => passwordRef.current?.focus()} returnKeyType="next" textContentType="emailAddress" value={values.email} />
        <Field ref={passwordRef} autoComplete="new-password" error={fieldErrors.password} label={t("auth.password")} onChangeText={(v) => set("password", v)} onSubmitEditing={() => confirmRef.current?.focus()} returnKeyType="next" rightAccessory={<PasswordVisibilityButton hideLabel={t("auth.hidePassword")} onPress={() => { setVisible((v) => !v); requestAnimationFrame(() => passwordRef.current?.focus()); }} showLabel={t("auth.showPassword")} visible={visible} />} secureTextEntry={!visible} textContentType="newPassword" value={values.password} />
        <Field ref={confirmRef} autoComplete="new-password" error={fieldErrors.passwordConfirm} label={t("auth.confirmPassword")} onChangeText={(v) => set("passwordConfirm", v)} onSubmitEditing={() => firstRef.current?.focus()} returnKeyType="next" secureTextEntry={!visible} textContentType="newPassword" value={values.passwordConfirm} />
        <Field ref={firstRef} autoComplete="name-given" label={t("auth.firstNameOptional")} onChangeText={(v) => set("firstName", v)} onSubmitEditing={() => lastRef.current?.focus()} returnKeyType="next" textContentType="givenName" value={values.firstName} />
        <Field ref={lastRef} autoComplete="name-family" label={t("auth.lastNameOptional")} onChangeText={(v) => set("lastName", v)} onSubmitEditing={() => void submit()} returnKeyType="done" textContentType="familyName" value={values.lastName} />
        <View style={styles.legalRow}><Switch accessibilityLabel={t("auth.legalConsent")} onValueChange={(value) => { setAccepted(value); setFieldErrors((current) => ({ ...current, legal: "" })); }} trackColor={{ false: colors.borderStrong, true: colors.blue }} value={accepted} /><View style={styles.legalCopy}><Text style={styles.muted}>{t("auth.legalAgree")}</Text><View style={styles.inline}><TextLink label={t("auth.terms")} onPress={() => void Linking.openURL("https://checkstation.app/terms-of-use")} /><Text style={styles.muted}> {t("auth.andPrivacy")} </Text><TextLink label={t("auth.privacy")} onPress={() => void Linking.openURL("https://checkstation.app/privacy-policy")} /></View></View></View>
        {fieldErrors.legal ? <Text style={styles.fieldError}>{fieldErrors.legal}</Text> : null}
        <Alert message={error} />
        <Button disabled={busy || !accepted} label={busy ? t("auth.creatingAccount") : t("auth.createAccount")} loading={busy} onPress={() => void submit()} />
        <View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>{t("auth.or")}</Text><View style={styles.dividerLine} /></View>
        <OAuthProviderButtons appleLabel={t("auth.continueApple")} dialogBody={t("auth.oauthComingBody")} dialogTitle={t("auth.oauthComingTitle")} googleLabel={t("auth.continueGoogle")} okLabel={t("common.ok")} />
        <Text style={styles.verifyHint}>{t("auth.registrationVerifyHint")}</Text>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({ form: { gap: space.lg }, inline: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center" }, muted: { ...type.caption, color: colors.textMuted }, legalRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md }, legalCopy: { flex: 1, gap: 2 }, fieldError: { ...type.caption, color: colors.dangerText }, divider: { flexDirection: "row", alignItems: "center", gap: space.md }, dividerLine: { height: StyleSheet.hairlineWidth, flex: 1, backgroundColor: colors.border }, dividerText: { ...type.caption, color: colors.textMuted }, verifyHint: { ...type.caption, color: colors.textMuted, textAlign: "center" } });
