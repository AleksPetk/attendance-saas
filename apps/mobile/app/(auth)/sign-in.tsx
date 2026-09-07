import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { Redirect, router } from "expo-router";
import { ApiError, fieldErrorsFromBody } from "@checkstation/api";
import { Body, Button, Field, Screen, Title } from "../../src/components/ui";
import { useApp } from "../../src/lib/AppProvider";
import { space } from "../../src/theme/tokens";

export default function SignInScreen() {
  const { auth, authState, t } = useApp();
  const [mode, setMode] = useState<"owner" | "staff">("owner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [username, setUsername] = useState("");
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (authState.status === "authenticated") {
    return <Redirect href="/(app)/(tabs)/home" />;
  }

  async function onOwnerSignIn() {
    setBusy(true);
    setError("");
    try {
      const result = await auth.loginOwner(email.trim(), password);
      if (result.kind === "two_factor_required") return;
      router.replace("/(app)/(tabs)/home");
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = fieldErrorsFromBody(err.data);
        setError(fields.email || fields.password || err.message);
      } else {
        setError(t("common.error"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onTotp() {
    setBusy(true);
    setError("");
    try {
      await auth.completeOwnerTotp(totp.trim());
      router.replace("/(app)/(tabs)/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function onStaffSignIn() {
    setBusy(true);
    setError("");
    try {
      await auth.loginStaff(workspaceId.trim(), username.trim(), password);
      router.replace("/(app)/(tabs)/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>{mode === "owner" ? t("auth.ownerSignIn") : t("auth.staffSignIn")}</Title>
        <View style={{ flexDirection: "row", gap: space.sm, marginBottom: space.lg }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t("auth.ownerSignIn")}
              variant={mode === "owner" ? "primary" : "secondary"}
              onPress={() => setMode("owner")}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t("auth.staffSignIn")}
              variant={mode === "staff" ? "primary" : "secondary"}
              onPress={() => setMode("staff")}
            />
          </View>
        </View>

        {authState.status === "needs_2fa" ? (
          <>
            <Field label={t("auth.twoFactor")} value={totp} onChangeText={setTotp} keyboardType="number-pad" />
            {error ? <Body muted>{error}</Body> : null}
            <Button label={t("auth.continue")} onPress={() => void onTotp()} disabled={busy} />
          </>
        ) : mode === "owner" ? (
          <>
            <Field
              label={t("auth.email")}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Field
              label={t("auth.password")}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {error ? <Body muted>{error}</Body> : null}
            <Button label={t("auth.signIn")} onPress={() => void onOwnerSignIn()} disabled={busy} />
            <View style={{ height: space.md }} />
            <Button
              label="Google / Apple"
              variant="secondary"
              onPress={() => Alert.alert("OAuth", t("auth.oauthUnavailable"))}
            />
          </>
        ) : (
          <>
            <Field label={t("auth.workspaceId")} autoCapitalize="characters" value={workspaceId} onChangeText={setWorkspaceId} />
            <Field label={t("auth.username")} autoCapitalize="none" value={username} onChangeText={setUsername} />
            <Field label={t("auth.password")} secureTextEntry value={password} onChangeText={setPassword} />
            {error ? <Body muted>{error}</Body> : null}
            <Button label={t("auth.signIn")} onPress={() => void onStaffSignIn()} disabled={busy} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
