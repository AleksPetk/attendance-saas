import { useRef, useState } from "react";
import { Keyboard, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, router } from "expo-router";
import { AuthScreen } from "../../src/components/AuthScreen";
import { Alert, Button, Field, PasswordVisibilityButton, TextLink } from "../../src/components/ui";
import { signInErrorMessage } from "../../src/lib/authErrors";
import { useApp } from "../../src/lib/AppProvider";
import { colors, space, type } from "../../src/theme/tokens";

export default function StaffSignInScreen() {
  const { auth, authState, t } = useApp();
  const [workspaceId, setWorkspaceId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const workspaceIdRef = useRef<TextInput | null>(null);
  const usernameRef = useRef<TextInput | null>(null);
  const passwordRef = useRef<TextInput | null>(null);

  if (authState.status === "authenticated") return <Redirect href="/(app)/(tabs)/home" />;
  function clearErrorOnEdit() { if (error) setError(""); }
  function togglePasswordVisibility() { setPasswordVisible((current) => !current); requestAnimationFrame(() => passwordRef.current?.focus()); }

  async function onSignIn() {
    if (!workspaceId.trim() || !username.trim() || !password) {
      setError(t("auth.requiredStaffFields"));
      if (!workspaceId.trim()) workspaceIdRef.current?.focus(); else if (!username.trim()) usernameRef.current?.focus(); else passwordRef.current?.focus();
      return;
    }
    setBusy(true); setError("");
    try {
      await auth.loginStaff(workspaceId.trim(), username.trim(), password);
      Keyboard.dismiss(); router.replace("/(app)/(tabs)/home");
    } catch (caught) { setError(signInErrorMessage(caught, "staff", t)); }
    finally { setBusy(false); }
  }

  return (
    <AuthScreen title={t("auth.staffTitle")} lead={t("auth.staffLead")} footnote={<View style={styles.footnoteRow}><Text style={styles.footnoteText}>{t("auth.ownerPrompt")} </Text><TextLink label={t("auth.customerLogin")} onPress={() => router.replace("/(auth)/sign-in")} /></View>}>
      <View style={styles.form}>
        <Field ref={workspaceIdRef} autoCapitalize="characters" autoCorrect={false} hint={t("auth.workspaceIdHint")} label={t("auth.workspaceId")} onChangeText={(value) => { setWorkspaceId(value); clearErrorOnEdit(); }} onSubmitEditing={() => usernameRef.current?.focus()} returnKeyType="next" spellCheck={false} submitBehavior="submit" value={workspaceId} />
        <Field ref={usernameRef} autoCapitalize="none" autoComplete="username" autoCorrect={false} importantForAutofill="yes" label={t("auth.username")} onChangeText={(value) => { setUsername(value); clearErrorOnEdit(); }} onSubmitEditing={() => passwordRef.current?.focus()} returnKeyType="next" spellCheck={false} submitBehavior="submit" textContentType="username" value={username} />
        <Field ref={passwordRef} autoCapitalize="none" autoComplete="current-password" autoCorrect={false} importantForAutofill="yes" label={t("auth.password")} onChangeText={(value) => { setPassword(value); clearErrorOnEdit(); }} onSubmitEditing={() => void onSignIn()} returnKeyType="go" rightAccessory={<PasswordVisibilityButton visible={passwordVisible} onPress={togglePasswordVisibility} showLabel={t("auth.showPassword")} hideLabel={t("auth.hidePassword")} />} secureTextEntry={!passwordVisible} spellCheck={false} submitBehavior="blurAndSubmit" textContentType="password" value={password} />
        <Alert message={error} />
        <Button disabled={busy} label={busy ? t("auth.signingIn") : t("auth.enterWorkspace")} loading={busy} onPress={() => void onSignIn()} />
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg }, footnoteRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center" }, footnoteText: { ...type.caption, color: colors.textMuted },
});
