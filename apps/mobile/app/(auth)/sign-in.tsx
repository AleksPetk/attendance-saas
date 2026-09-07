import { useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import {
  Alert,
  BrandWordmark,
  Button,
  Card,
  Field,
  SegmentedControl,
} from "../../src/components/ui";
import { signInErrorMessage, type SignInMode } from "../../src/lib/authErrors";
import { useApp } from "../../src/lib/AppProvider";
import { colors, layout, space, type } from "../../src/theme/tokens";

export default function SignInScreen() {
  const { auth, authState, t } = useApp();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const [mode, setMode] = useState<SignInMode>("owner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [username, setUsername] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const emailRef = useRef<TextInput | null>(null);
  const passwordRef = useRef<TextInput | null>(null);
  const workspaceIdRef = useRef<TextInput | null>(null);
  const usernameRef = useRef<TextInput | null>(null);
  const staffPasswordRef = useRef<TextInput | null>(null);
  const totpRef = useRef<TextInput | null>(null);

  if (authState.status === "authenticated") {
    return <Redirect href="/(app)/(tabs)/home" />;
  }

  function clearErrorOnEdit() {
    if (error) setError("");
  }

  function changeMode(next: SignInMode) {
    Keyboard.dismiss();
    setMode(next);
    setError("");
  }

  async function onOwnerSignIn() {
    if (!email.trim() || !password) {
      setError(t("auth.requiredOwnerFields"));
      if (!email.trim()) emailRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await auth.loginOwner(email.trim(), password);
      if (result.kind === "two_factor_required") {
        setTimeout(() => totpRef.current?.focus(), 0);
        return;
      }
      Keyboard.dismiss();
      router.replace("/(app)/(tabs)/home");
    } catch (err) {
      setError(signInErrorMessage(err, "owner", t));
    } finally {
      setBusy(false);
    }
  }

  async function onTotp() {
    if (!totp.trim()) {
      setError(t("auth.twoFactorLead"));
      totpRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await auth.completeOwnerTotp(totp.trim());
      Keyboard.dismiss();
      router.replace("/(app)/(tabs)/home");
    } catch (err) {
      setError(signInErrorMessage(err, "owner", t));
    } finally {
      setBusy(false);
    }
  }

  async function onStaffSignIn() {
    if (!workspaceId.trim() || !username.trim() || !staffPassword) {
      setError(t("auth.requiredStaffFields"));
      if (!workspaceId.trim()) workspaceIdRef.current?.focus();
      else if (!username.trim()) usernameRef.current?.focus();
      else staffPasswordRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await auth.loginStaff(workspaceId.trim(), username.trim(), staffPassword);
      Keyboard.dismiss();
      router.replace("/(app)/(tabs)/home");
    } catch (err) {
      setError(signInErrorMessage(err, "staff", t));
    } finally {
      setBusy(false);
    }
  }

  const twoFactor = authState.status === "needs_2fa";
  const title = twoFactor
    ? t("auth.twoFactorTitle")
    : mode === "owner"
      ? t("auth.ownerTitle")
      : t("auth.staffTitle");
  const lead = twoFactor
    ? t("auth.twoFactorLead")
    : mode === "owner"
      ? t("auth.ownerLead")
      : t("auth.staffLead");

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
          style={styles.scroll}
        >
          <View style={styles.authWrap}>
            <BrandWordmark />
            <Card style={[styles.authCard, isTablet && styles.authCardTablet]}>
              {!twoFactor ? (
                <SegmentedControl
                  accessibilityLabel={t("auth.signInType")}
                  onChange={changeMode}
                  options={[
                    { label: t("auth.customerTab"), value: "owner" },
                    { label: t("auth.staffTab"), value: "staff" },
                  ]}
                  value={mode}
                />
              ) : null}

              <View style={styles.header}>
                <Text accessibilityRole="header" style={styles.title}>{title}</Text>
                <Text style={styles.lead}>{lead}</Text>
              </View>

              {twoFactor ? (
                <View style={styles.form}>
                  <Field
                    ref={totpRef}
                    autoComplete="one-time-code"
                    autoCorrect={false}
                    keyboardType="number-pad"
                    label={t("auth.twoFactor")}
                    maxLength={6}
                    onChangeText={(value) => {
                      setTotp(value);
                      clearErrorOnEdit();
                    }}
                    returnKeyType="done"
                    textContentType="oneTimeCode"
                    value={totp}
                  />
                  <Alert message={error} />
                  <Button
                    disabled={busy}
                    label={busy ? t("auth.signingIn") : t("auth.continue")}
                    loading={busy}
                    onPress={() => void onTotp()}
                  />
                </View>
              ) : mode === "owner" ? (
                <View style={styles.form}>
                  <Field
                    ref={emailRef}
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    importantForAutofill="yes"
                    keyboardType="email-address"
                    label={t("auth.email")}
                    onChangeText={(value) => {
                      setEmail(value);
                      clearErrorOnEdit();
                    }}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    returnKeyType="next"
                    spellCheck={false}
                    submitBehavior="submit"
                    textContentType="emailAddress"
                    value={email}
                  />
                  <Field
                    ref={passwordRef}
                    autoCapitalize="none"
                    autoComplete="current-password"
                    autoCorrect={false}
                    importantForAutofill="yes"
                    label={t("auth.password")}
                    onChangeText={(value) => {
                      setPassword(value);
                      clearErrorOnEdit();
                    }}
                    onSubmitEditing={() => void onOwnerSignIn()}
                    returnKeyType="go"
                    secureTextEntry
                    spellCheck={false}
                    submitBehavior="blurAndSubmit"
                    textContentType="password"
                    value={password}
                  />
                  <Alert message={error} />
                  <Button
                    disabled={busy}
                    label={busy ? t("auth.signingIn") : t("auth.signIn")}
                    loading={busy}
                    onPress={() => void onOwnerSignIn()}
                  />
                </View>
              ) : (
                <View style={styles.form}>
                  <Field
                    ref={workspaceIdRef}
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect={false}
                    hint={t("auth.workspaceIdHint")}
                    label={t("auth.workspaceId")}
                    onChangeText={(value) => {
                      setWorkspaceId(value);
                      clearErrorOnEdit();
                    }}
                    onSubmitEditing={() => usernameRef.current?.focus()}
                    returnKeyType="next"
                    spellCheck={false}
                    submitBehavior="submit"
                    value={workspaceId}
                  />
                  <Field
                    ref={usernameRef}
                    autoCapitalize="none"
                    autoComplete="username"
                    autoCorrect={false}
                    importantForAutofill="yes"
                    label={t("auth.username")}
                    onChangeText={(value) => {
                      setUsername(value);
                      clearErrorOnEdit();
                    }}
                    onSubmitEditing={() => staffPasswordRef.current?.focus()}
                    returnKeyType="next"
                    spellCheck={false}
                    submitBehavior="submit"
                    textContentType="username"
                    value={username}
                  />
                  <Field
                    ref={staffPasswordRef}
                    autoCapitalize="none"
                    autoComplete="current-password"
                    autoCorrect={false}
                    importantForAutofill="yes"
                    label={t("auth.password")}
                    onChangeText={(value) => {
                      setStaffPassword(value);
                      clearErrorOnEdit();
                    }}
                    onSubmitEditing={() => void onStaffSignIn()}
                    returnKeyType="go"
                    secureTextEntry
                    spellCheck={false}
                    submitBehavior="blurAndSubmit"
                    textContentType="password"
                    value={staffPassword}
                  />
                  <Alert message={error} />
                  <Button
                    disabled={busy}
                    label={busy ? t("auth.signingIn") : t("auth.enterWorkspace")}
                    loading={busy}
                    onPress={() => void onStaffSignIn()}
                  />
                </View>
              )}
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  keyboardView: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.xl,
  },
  authWrap: { width: "100%", maxWidth: layout.authMaxWidth, gap: space.md },
  authCard: { marginBottom: 0, padding: space.xl, gap: space.xl },
  authCardTablet: { padding: space.xxl },
  header: { gap: space.sm },
  title: { ...type.title, color: colors.text },
  lead: { ...type.caption, color: colors.textMuted, lineHeight: 22 },
  form: { gap: space.lg },
});
