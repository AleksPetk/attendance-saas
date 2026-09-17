import { useEffect, useRef, useState } from "react";
import { Keyboard, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { AuthScreen } from "../../src/components/AuthScreen";
import { LegalDocumentModal } from "../../src/components/LegalDocumentModal";
import { Alert, Button, Field, OAuthProviderButtons, PasswordVisibilityButton, TextLink } from "../../src/components/ui";
import { requestNativeAppleCredential, isNativeAppleAuthAvailable } from "../../src/lib/appleNativeAuth";
import { requestNativeGoogleCredential, isNativeGoogleAuthAvailable } from "../../src/lib/googleNativeAuth";
import { signInErrorMessage } from "../../src/lib/authErrors";
import { useApp } from "../../src/lib/AppProvider";
import { colors, space, type } from "../../src/theme/tokens";

export default function RegisterScreen() {
  const { api, auth, locale, t } = useApp();
  const [values, setValues] = useState({ email: "", password: "", passwordConfirm: "", firstName: "", lastName: "" });
  const [visible, setVisible] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(true);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(true);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [legalSlug, setLegalSlug] = useState<string | null>(null);
  const passwordRef = useRef<TextInput | null>(null);
  const confirmRef = useRef<TextInput | null>(null);
  const firstRef = useRef<TextInput | null>(null);
  const lastRef = useRef<TextInput | null>(null);
  const set = (key: keyof typeof values, value: string) => { setValues((current) => ({ ...current, [key]: value })); setFieldErrors((current) => ({ ...current, [key]: "" })); setError(""); };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [appleOk, googleOk] = await Promise.all([
        isNativeAppleAuthAvailable(),
        isNativeGoogleAuthAvailable(),
      ]);
      if (!cancelled) {
        setAppleAvailable(appleOk);
        setGoogleAvailable(googleOk);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function onAppleRegister() {
    if (busy || appleBusy || googleBusy) return;
    if (!accepted) {
      setFieldErrors((current) => ({ ...current, legal: t("auth.legalRequired") }));
      return;
    }
    setAppleBusy(true);
    setError("");
    setFieldErrors({});
    try {
      const apple = await requestNativeAppleCredential();
      if (apple.kind === "cancelled") return;
      if (apple.kind === "unavailable") {
        setAppleAvailable(false);
        setError(t("auth.appleUnavailable"));
        return;
      }
      if (apple.kind === "missing_token") {
        setError(t("auth.appleMissingToken"));
        return;
      }
      if (apple.kind === "error") {
        setError(t("auth.appleFailed"));
        return;
      }
      const result = await auth.completeAppleNative({
        identityToken: apple.credential.identityToken,
        nonce: apple.credential.nonce,
        intent: "register",
        legalAcknowledgement: accepted,
        fullName: apple.credential.fullName,
      });
      if (result.kind === "two_factor_required") {
        router.replace("/(auth)/sign-in");
        return;
      }
      Keyboard.dismiss();
      router.replace("/(app)/(tabs)/home");
    } catch (caught) {
      setError(signInErrorMessage(caught, "owner", t));
    } finally {
      setAppleBusy(false);
    }
  }

  async function onGoogleRegister() {
    if (busy || appleBusy || googleBusy) return;
    if (!accepted) {
      setFieldErrors((current) => ({ ...current, legal: t("auth.legalRequired") }));
      return;
    }
    setGoogleBusy(true);
    setError("");
    setFieldErrors({});
    try {
      const google = await requestNativeGoogleCredential();
      if (google.kind === "cancelled") return;
      if (google.kind === "unavailable") {
        setGoogleAvailable(false);
        setError(t("auth.googleUnavailable"));
        return;
      }
      if (google.kind === "misconfigured") {
        setGoogleAvailable(false);
        setError(t("auth.googleMisconfigured"));
        return;
      }
      if (google.kind === "missing_token") {
        setError(t("auth.googleMissingToken"));
        return;
      }
      if (google.kind === "error") {
        setError(t("auth.googleFailed"));
        return;
      }
      const result = await auth.completeGoogleNative({
        identityToken: google.credential.identityToken,
        nonce: google.credential.nonce,
        intent: "register",
        legalAcknowledgement: accepted,
      });
      if (result.kind === "two_factor_required") {
        router.replace("/(auth)/sign-in");
        return;
      }
      Keyboard.dismiss();
      router.replace("/(app)/(tabs)/home");
    } catch (caught) {
      setError(signInErrorMessage(caught, "owner", t));
    } finally {
      setGoogleBusy(false);
    }
  }

  function openLegal(slug: string) {
    Keyboard.dismiss();
    setLegalSlug(slug);
  }

  return (
    <>
    <AuthScreen title={t("auth.registerTitle")}>
      <View style={styles.form}>
        <Field autoCapitalize="none" autoComplete="email" error={fieldErrors.email} keyboardType="email-address" label={t("auth.email")} onChangeText={(v) => set("email", v)} onSubmitEditing={() => passwordRef.current?.focus()} returnKeyType="next" textContentType="emailAddress" value={values.email} />
        <Field ref={passwordRef} autoComplete="new-password" error={fieldErrors.password} label={t("auth.password")} onChangeText={(v) => set("password", v)} onSubmitEditing={() => confirmRef.current?.focus()} returnKeyType="next" rightAccessory={<PasswordVisibilityButton hideLabel={t("auth.hidePassword")} onPress={() => { setVisible((v) => !v); requestAnimationFrame(() => passwordRef.current?.focus()); }} showLabel={t("auth.showPassword")} visible={visible} />} secureTextEntry={!visible} textContentType="newPassword" value={values.password} />
        <Field ref={confirmRef} autoComplete="new-password" error={fieldErrors.passwordConfirm} label={t("auth.confirmPassword")} onChangeText={(v) => set("passwordConfirm", v)} onSubmitEditing={() => firstRef.current?.focus()} returnKeyType="next" secureTextEntry={!visible} textContentType="newPassword" value={values.passwordConfirm} />
        <Field ref={firstRef} autoComplete="name-given" label={t("auth.firstNameOptional")} onChangeText={(v) => set("firstName", v)} onSubmitEditing={() => lastRef.current?.focus()} returnKeyType="next" textContentType="givenName" value={values.firstName} />
        <Field ref={lastRef} autoComplete="name-family" label={t("auth.lastNameOptional")} onChangeText={(v) => set("lastName", v)} onSubmitEditing={() => void submit()} returnKeyType="done" textContentType="familyName" value={values.lastName} />
        <View style={styles.legalRow}><Switch accessibilityLabel={t("auth.legalConsent")} onValueChange={(value) => { setAccepted(value); setFieldErrors((current) => ({ ...current, legal: "" })); }} trackColor={{ false: colors.borderStrong, true: colors.blue }} value={accepted} /><View style={styles.legalCopy}><Text style={styles.muted}>{t("auth.legalAgree")}</Text><View style={styles.inline}><TextLink label={t("auth.terms")} onPress={() => openLegal("terms-of-use")} /><Text style={styles.muted}> {t("auth.andPrivacy")} </Text><TextLink label={t("auth.privacy")} onPress={() => openLegal("privacy-policy")} /></View></View></View>
        {fieldErrors.legal ? <Text style={styles.fieldError}>{fieldErrors.legal}</Text> : null}
        <Alert message={error} />
        <Button disabled={busy || appleBusy || googleBusy || !accepted} label={busy ? t("auth.creatingAccount") : t("auth.createAccount")} loading={busy} onPress={() => void submit()} />
        <View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>{t("auth.or")}</Text><View style={styles.dividerLine} /></View>
        <OAuthProviderButtons
          appleAvailable={appleAvailable}
          appleBusy={appleBusy || busy || googleBusy}
          appleLabel={t("auth.continueApple")}
          dialogBody={t("auth.oauthComingBody")}
          dialogTitle={t("auth.oauthComingTitle")}
          googleAvailable={googleAvailable}
          googleBusy={googleBusy || busy || appleBusy}
          googleLabel={t("auth.continueGoogle")}
          okLabel={t("common.ok")}
          onApplePress={() => void onAppleRegister()}
          onGooglePress={() => void onGoogleRegister()}
        />
        <Text style={styles.verifyHint}>{t("auth.registrationVerifyHint")}</Text>
        <Button label={`${t("auth.alreadyAccount")} ${t("auth.signIn")}`} onPress={() => router.replace("/(auth)/sign-in")} variant="secondary" />
      </View>
    </AuthScreen>
    <LegalDocumentModal onClose={() => setLegalSlug(null)} onOpenSlug={setLegalSlug} slug={legalSlug} />
    </>
  );
}

const styles = StyleSheet.create({ form: { gap: space.lg }, inline: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center" }, muted: { ...type.caption, color: colors.textMuted }, legalRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md }, legalCopy: { flex: 1, gap: 2 }, fieldError: { ...type.caption, color: colors.dangerText }, divider: { flexDirection: "row", alignItems: "center", gap: space.md }, dividerLine: { height: StyleSheet.hairlineWidth, flex: 1, backgroundColor: colors.border }, dividerText: { ...type.caption, color: colors.textMuted }, verifyHint: { ...type.caption, color: colors.textMuted, textAlign: "center" } });
