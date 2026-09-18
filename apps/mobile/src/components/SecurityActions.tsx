import { useRef, useState, type ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { useApp } from "../lib/AppProvider";
import { requestNativeAppleCredential } from "../lib/appleNativeAuth";
import { requestNativeGoogleCredential } from "../lib/googleNativeAuth";
import { canConfirmSensitiveWithApple, canConfirmSensitiveWithGoogle } from "./accountDeleteReauth";
import { ManagementSheet } from "./ManagementSheet";
import { Alert, Button, Field, TextLink } from "./ui";
import { colors, space, type } from "../theme/tokens";

type Action = "password" | "setPassword" | "setup" | "regenerate" | "disable";

type Methods = {
  password?: { enabled?: boolean };
  google?: { linked?: boolean };
  apple?: { linked?: boolean };
};

const copy = {
  en: {
    confirmWithApple: "Confirm with Apple",
    confirmWithGoogle: "Confirm with Google",
    oauthReauthReadyApple: "Identity confirmed with Apple",
    oauthReauthReadyGoogle: "Identity confirmed with Google",
    appleVerifyFailed: "Apple identity could not be confirmed. Try again.",
    googleVerifyFailed: "Google identity could not be confirmed. Try again.",
    appleUnavailable: "Sign in with Apple is not available on this device.",
    googleUnavailable: "Google sign-in is not available on this device.",
    googleMisconfigured: "Google sign-in is not configured for this build yet.",
    confirmHintApple: "Confirm your identity with Apple before continuing this security action.",
    confirmHintGoogle: "Confirm your identity with Google before continuing this security action.",
  },
  ja: {
    confirmWithApple: "Apple で確認",
    confirmWithGoogle: "Google で確認",
    oauthReauthReadyApple: "Apple で本人確認が完了しました",
    oauthReauthReadyGoogle: "Google で本人確認が完了しました",
    appleVerifyFailed: "Apple の本人確認に失敗しました。もう一度お試しください。",
    googleVerifyFailed: "Google の本人確認に失敗しました。もう一度お試しください。",
    appleUnavailable: "このデバイスでは Sign in with Apple を利用できません。",
    googleUnavailable: "このデバイスでは Google サインインを利用できません。",
    googleMisconfigured: "このビルドでは Google サインインがまだ設定されていません。",
    confirmHintApple: "このセキュリティ操作を続ける前に Apple で本人確認してください。",
    confirmHintGoogle: "このセキュリティ操作を続ける前に Google で本人確認してください。",
  },
};

export function SecurityActions({
  enabled,
  passwordEnabled,
  appleLinked = false,
  googleLinked = false,
  twoFactorEnabled = false,
  onSaved,
}: {
  enabled: boolean;
  passwordEnabled: boolean;
  appleLinked?: boolean;
  googleLinked?: boolean;
  twoFactorEnabled?: boolean;
  onSaved: () => void;
}) {
  const { api, auth, locale, t } = useApp();
  const text = locale === "ja" ? copy.ja : copy.en;
  const methods: Methods = {
    password: { enabled: passwordEnabled },
    apple: { linked: appleLinked },
    google: { linked: googleLinked },
  };
  const appleVerify = canConfirmSensitiveWithApple(methods);
  const googleVerify = canConfirmSensitiveWithGoogle(methods) && !appleVerify;
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [oauthReauthReady, setOauthReauthReady] = useState(false);

  async function confirmWithApple() {
    if (busy || oauthReauthReady) return;
    setBusy(true);
    setError("");
    try {
      const apple = await requestNativeAppleCredential();
      if (apple.kind === "cancelled") return;
      if (apple.kind === "unavailable") {
        setError(text.appleUnavailable);
        return;
      }
      if (apple.kind === "missing_token" || apple.kind === "error") {
        setError(apple.kind === "error" ? apple.message : text.appleVerifyFailed);
        return;
      }
      await auth.verifyAppleNative({
        identityToken: apple.credential.identityToken,
        nonce: apple.credential.nonce,
      });
      setOauthReauthReady(true);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(typeof caught.data?.detail === "string" ? caught.data.detail : text.appleVerifyFailed);
      } else {
        setError(caught instanceof Error ? caught.message : text.appleVerifyFailed);
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmWithGoogle() {
    if (busy || oauthReauthReady) return;
    setBusy(true);
    setError("");
    try {
      const google = await requestNativeGoogleCredential();
      if (google.kind === "cancelled") return;
      if (google.kind === "unavailable") {
        setError(text.googleUnavailable);
        return;
      }
      if (google.kind === "misconfigured") {
        setError(text.googleMisconfigured);
        return;
      }
      if (google.kind === "missing_token" || google.kind === "error") {
        setError(google.kind === "error" ? google.message : text.googleVerifyFailed);
        return;
      }
      await auth.verifyGoogleNative({
        identityToken: google.credential.identityToken,
      });
      setOauthReauthReady(true);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(typeof caught.data?.detail === "string" ? caught.data.detail : text.googleVerifyFailed);
      } else {
        setError(caught instanceof Error ? caught.message : text.googleVerifyFailed);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!passwordEnabled && !appleVerify && !googleVerify) {
    return <Alert variant="info" message={t("security.passwordUnavailable")} />;
  }

  const actionsUnlocked =
    passwordEnabled || ((appleVerify || googleVerify) && oauthReauthReady);

  let oauthGate: ReactNode = null;
  if (!passwordEnabled && appleVerify) {
    oauthGate = (
      <View style={styles.verifyBlock}>
        {oauthReauthReady ? (
          <Alert message={text.oauthReauthReadyApple} variant="info" />
        ) : (
          <>
            <Text style={styles.hint}>{text.confirmHintApple}</Text>
            <Button
              label={text.confirmWithApple}
              loading={busy}
              onPress={() => void confirmWithApple()}
              variant="secondary"
            />
          </>
        )}
      </View>
    );
  } else if (!passwordEnabled && googleVerify) {
    oauthGate = (
      <View style={styles.verifyBlock}>
        {oauthReauthReady ? (
          <Alert message={text.oauthReauthReadyGoogle} variant="info" />
        ) : (
          <>
            <Text style={styles.hint}>{text.confirmHintGoogle}</Text>
            <Button
              label={text.confirmWithGoogle}
              loading={busy}
              onPress={() => void confirmWithGoogle()}
              variant="secondary"
            />
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <Alert message={error} />
      {oauthGate}
      {actionsUnlocked ? (
        <>
          {passwordEnabled ? (
            <Button
              label={t("security.changePassword")}
              variant="secondary"
              onPress={() => setAction("password")}
            />
          ) : (
            <Button
              label={t("security.setPassword")}
              variant="secondary"
              onPress={() => setAction("setPassword")}
            />
          )}
          {enabled ? (
            <>
              <Button
                label={t("security.regenerate")}
                variant="secondary"
                onPress={() => setAction("regenerate")}
              />
              <TextLink label={t("security.disable")} onPress={() => setAction("disable")} />
            </>
          ) : (
            <Button label={t("security.setup")} onPress={() => setAction("setup")} />
          )}
        </>
      ) : null}
      {action ? (
        <SecurityForm
          action={action}
          passwordEnabled={passwordEnabled}
          twoFactorEnabled={twoFactorEnabled || enabled}
          onClose={() => setAction(null)}
          onSaved={() => {
            setAction(null);
            setOauthReauthReady(false);
            onSaved();
          }}
        />
      ) : null}
    </View>
  );
}

function SecurityForm({
  action,
  passwordEnabled,
  twoFactorEnabled,
  onClose,
  onSaved,
}: {
  action: Action;
  passwordEnabled: boolean;
  twoFactorEnabled: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { api, t } = useApp();
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [setup, setSetup] = useState<{ setup_key: string; qr_data_uri: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  const title = t(
    action === "password"
      ? "security.changePassword"
      : action === "setPassword"
        ? "security.setPassword"
        : "security." + action,
  );

  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setFields({});
    try {
      if (action === "password") {
        await api.post(endpoints.changePassword(), {
          current_password: password,
          new_password: newPassword,
          new_password_confirm: confirmation,
        });
        onSaved();
      } else if (action === "setPassword") {
        const payload: Record<string, string> = {
          new_password: newPassword,
          new_password_confirm: confirmation,
        };
        if (twoFactorEnabled) {
          if (useRecovery) payload.recovery_code = code;
          else payload.code = code;
        }
        await api.post(endpoints.setPassword(), payload);
        onSaved();
      } else if (action === "setup" && !setup) {
        const payload = passwordEnabled ? { current_password: password } : {};
        setSetup(await api.post(endpoints.ownerTwoFactorSetup(), payload));
        setPassword("");
      } else if (action === "setup") {
        const result = await api.post<{ recovery_codes: string[] }>(endpoints.ownerTwoFactorVerify(), {
          code,
        });
        setCodes(result.recovery_codes);
        setCode("");
        setSetup(null);
      } else {
        const payload: Record<string, string> = {
          ...(useRecovery ? { recovery_code: code } : { code }),
        };
        if (passwordEnabled) payload.current_password = password;
        const result = await api.post<{ recovery_codes?: string[] }>(
          action === "regenerate"
            ? endpoints.ownerTwoFactorRegenerate()
            : endpoints.ownerTwoFactorDisable(),
          payload,
        );
        setPassword("");
        setCode("");
        if (action === "regenerate") setCodes(result.recovery_codes || []);
        else onSaved();
      }
    } catch (caught) {
      if (caught instanceof ApiError) setFields(fieldErrorsFromBody(caught.data));
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const needsSecondFactor =
    (action === "setPassword" && twoFactorEnabled) ||
    action === "regenerate" ||
    action === "disable" ||
    Boolean(setup);

  return (
    <ManagementSheet
      title={codes ? t("security.recoveryCodes") : title}
      busy={busy}
      dirty={!!(password || newPassword || confirmation || code || setup || codes)}
      onClose={onClose}
    >
      <Alert message={error} />
      {codes ? (
        <>
          <Alert variant="warning" message={t("security.codesHint")} />
          <Text selectable style={styles.codes}>
            {codes.join("\n")}
          </Text>
          <Button label={t("security.done")} onPress={onSaved} />
        </>
      ) : (
        <>
          {passwordEnabled && !setup && action !== "setPassword" ? (
            <Field
              label={t("security.currentPassword")}
              secureTextEntry
              textContentType="password"
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
              error={fields.current_password}
            />
          ) : null}
          {action === "password" || action === "setPassword" ? (
            <>
              <Field
                label={t("security.newPassword")}
                secureTextEntry
                textContentType="newPassword"
                autoCapitalize="none"
                value={newPassword}
                onChangeText={setNewPassword}
                error={fields.new_password}
              />
              <Field
                label={t("security.confirmPassword")}
                secureTextEntry
                textContentType="newPassword"
                autoCapitalize="none"
                value={confirmation}
                onChangeText={setConfirmation}
                error={fields.new_password_confirm}
              />
            </>
          ) : null}
          {setup ? (
            <>
              <Text style={styles.body}>{t("security.setupHint")}</Text>
              <Image
                accessibilityLabel={t("security.setupKey")}
                source={{ uri: setup.qr_data_uri }}
                style={styles.qr}
              />
              <Text selectable style={styles.codes}>
                {setup.setup_key}
              </Text>
            </>
          ) : null}
          {needsSecondFactor ? (
            <>
              {action !== "setup" ? (
                <TextLink
                  label={t(useRecovery ? "auth.useAuthenticator" : "auth.useRecovery")}
                  onPress={() => {
                    setUseRecovery(!useRecovery);
                    setCode("");
                  }}
                />
              ) : null}
              <Field
                label={t(useRecovery && action !== "setup" ? "security.recoveryCode" : "security.code")}
                value={code}
                onChangeText={setCode}
                keyboardType={useRecovery && action !== "setup" ? "default" : "number-pad"}
                textContentType="oneTimeCode"
                autoCapitalize="none"
                autoCorrect={false}
                error={fields.code || fields.recovery_code}
              />
            </>
          ) : null}
          <Button
            label={setup ? t("auth.verify") : title}
            loading={busy}
            onPress={() => void submit()}
            variant={action === "disable" ? "danger" : "primary"}
          />
        </>
      )}
    </ManagementSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  verifyBlock: { gap: space.sm },
  hint: { ...type.caption, color: colors.textMuted },
  body: { ...type.body, color: colors.textSecondary },
  codes: { ...type.bodyStrong, color: colors.text, lineHeight: 30 },
  qr: { width: 220, height: 220, alignSelf: "center" },
});
