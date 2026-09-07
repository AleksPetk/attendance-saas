import { useRef, useState } from "react";
import { Keyboard, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, router } from "expo-router";
import { AuthScreen } from "../../src/components/AuthScreen";
import { Alert, Button, Field, PasswordVisibilityButton, TextLink } from "../../src/components/ui";
import { signInErrorMessage } from "../../src/lib/authErrors";
import { openWorkspaceAuthUrl, workspaceAuthUrls } from "../../src/lib/authLinks";
import { useApp } from "../../src/lib/AppProvider";
import { colors, space, type } from "../../src/theme/tokens";

export default function SignInScreen() {
  const { auth, authState, t } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [twoFactorValue, setTwoFactorValue] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const emailRef = useRef<TextInput | null>(null);
  const passwordRef = useRef<TextInput | null>(null);
  const twoFactorRef = useRef<TextInput | null>(null);

  if (authState.status === "authenticated") return <Redirect href="/(app)/(tabs)/home" />;

  function clearErrorOnEdit() { if (error) setError(""); }

  function togglePasswordVisibility() {
    setPasswordVisible((current) => !current);
    requestAnimationFrame(() => passwordRef.current?.focus());
  }

  async function onOwnerSignIn() {
    if (!email.trim() || !password) {
      setError(t("auth.requiredOwnerFields"));
      (!email.trim() ? emailRef : passwordRef).current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await auth.loginOwner(email.trim(), password);
      if (result.kind === "two_factor_required") {
        requestAnimationFrame(() => twoFactorRef.current?.focus());
        return;
      }
      Keyboard.dismiss();
      router.replace("/(app)/(tabs)/home");
    } catch (caught) {
      setError(signInErrorMessage(caught, "owner", t));
    } finally {
      setBusy(false);
    }
  }

  async function onTwoFactor() {
    if (!twoFactorValue.trim()) {
      setError(t("auth.twoFactorRequired"));
      twoFactorRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await auth.completeOwnerTwoFactor(useRecoveryCode
        ? { recovery_code: twoFactorValue.trim() }
        : { code: twoFactorValue.trim() });
      Keyboard.dismiss();
      router.replace("/(app)/(tabs)/home");
    } catch (caught) {
      setError(signInErrorMessage(caught, "owner", t));
    } finally {
      setBusy(false);
    }
  }

  const twoFactor = authState.status === "needs_2fa";
  return (
    <AuthScreen
      title={twoFactor ? t("auth.twoFactorTitle") : t("auth.ownerTitle")}
      lead={twoFactor ? t("auth.twoFactorLead") : undefined}
      footnote={!twoFactor ? (
        <View style={styles.footnoteRow}>
          <Text style={styles.footnoteText}>{t("auth.staffPrompt")} </Text>
          <TextLink label={t("auth.staffSignIn")} onPress={() => router.push("/(auth)/staff-sign-in")} />
          <Text style={styles.footnoteText}> · {t("auth.newHere")} </Text>
          <TextLink label={t("auth.createAccount")} onPress={() => void openWorkspaceAuthUrl(workspaceAuthUrls.register)} />
        </View>
      ) : undefined}
    >
      {twoFactor ? (
        <View style={styles.form}>
          <Field
            ref={twoFactorRef}
            autoComplete="one-time-code"
            autoCorrect={false}
            keyboardType={useRecoveryCode ? "default" : "number-pad"}
            label={t("auth.twoFactor")}
            maxLength={useRecoveryCode ? undefined : 6}
            onChangeText={(value) => { setTwoFactorValue(value); clearErrorOnEdit(); }}
            onSubmitEditing={() => void onTwoFactor()}
            placeholder={useRecoveryCode ? t("auth.recoveryCodePlaceholder") : t("auth.authenticatorCodePlaceholder")}
            returnKeyType="done"
            textContentType={useRecoveryCode ? "none" : "oneTimeCode"}
            value={twoFactorValue}
          />
          <Alert message={error} />
          <Button label={useRecoveryCode ? t("auth.useAuthenticator") : t("auth.useRecovery")} onPress={() => { setUseRecoveryCode((current) => !current); setTwoFactorValue(""); setError(""); requestAnimationFrame(() => twoFactorRef.current?.focus()); }} variant="secondary" />
          <Button disabled={busy} label={busy ? t("auth.signingIn") : t("auth.verify")} loading={busy} onPress={() => void onTwoFactor()} />
        </View>
      ) : (
        <View style={styles.form}>
          <View style={styles.fields}>
            <Field ref={emailRef} autoCapitalize="none" autoComplete="email" autoCorrect={false} importantForAutofill="yes" keyboardType="email-address" label={t("auth.email")} onChangeText={(value) => { setEmail(value); clearErrorOnEdit(); }} onSubmitEditing={() => passwordRef.current?.focus()} returnKeyType="next" spellCheck={false} submitBehavior="submit" textContentType="emailAddress" value={email} />
            <Field ref={passwordRef} autoCapitalize="none" autoComplete="current-password" autoCorrect={false} importantForAutofill="yes" label={t("auth.password")} onChangeText={(value) => { setPassword(value); clearErrorOnEdit(); }} onSubmitEditing={() => void onOwnerSignIn()} returnKeyType="go" rightAccessory={<PasswordVisibilityButton visible={passwordVisible} onPress={togglePasswordVisibility} showLabel={t("auth.showPassword")} hideLabel={t("auth.hidePassword")} />} secureTextEntry={!passwordVisible} spellCheck={false} submitBehavior="blurAndSubmit" textContentType="password" value={password} />
          </View>
          <Alert message={error} />
          <Button disabled={busy} label={busy ? t("auth.signingIn") : t("auth.signIn")} loading={busy} onPress={() => void onOwnerSignIn()} />
          <View style={styles.recoveryLinks}>
            <TextLink label={t("auth.forgotPassword")} onPress={() => void openWorkspaceAuthUrl(workspaceAuthUrls.forgotPassword)} />
            <TextLink label={t("auth.recoverAccount")} onPress={() => void openWorkspaceAuthUrl(workspaceAuthUrls.recoverAccount)} />
          </View>
        </View>
      )}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg }, fields: { gap: space.lg }, recoveryLinks: { alignItems: "center", gap: 2 },
  footnoteRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center" },
  footnoteText: { ...type.caption, color: colors.textMuted },
});
