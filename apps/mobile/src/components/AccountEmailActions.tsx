import { useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { ManagementSheet } from "./ManagementSheet";
import { Alert, Button, Field } from "./ui";
import { useApp } from "../lib/AppProvider";
import { requestNativeAppleCredential } from "../lib/appleNativeAuth";
import { requestNativeGoogleCredential } from "../lib/googleNativeAuth";
import { canConfirmSensitiveWithApple, canConfirmSensitiveWithGoogle } from "./accountDeleteReauth";
import { colors, space, type } from "../theme/tokens";

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
    genericUnavailable: "This action requires provider re-verification. Secure mobile provider re-verification is not available yet.",
    confirmHintApple: "Confirm your identity with Apple before changing this email.",
    confirmHintGoogle: "Confirm your identity with Google before changing this email.",
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
    genericUnavailable: "この操作にはプロバイダーによる再認証が必要です。安全なモバイル再認証はまだ利用できません。",
    confirmHintApple: "メールを変更する前に Apple で本人確認してください。",
    confirmHintGoogle: "メールを変更する前に Google で本人確認してください。",
  },
};

export function AccountEmailActions({
  kind,
  pending,
  configured,
  passwordEnabled,
  appleLinked = false,
  googleLinked = false,
  twoFactorEnabled = false,
  onSaved,
}: {
  kind: "primary" | "backup";
  pending?: string | null;
  configured?: boolean;
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
  const [action, setAction] = useState<"change" | "remove" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthReauthReady, setOauthReauthReady] = useState(false);
  const inFlight = useRef(false);

  async function pendingAction(operation: "resend" | "cancel") {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await api.post(endpoints.account() + kind + "-email/" + operation + "/", {});
      setMessage(t(operation === "resend" ? "account.verificationSent" : "manage.saved"));
      if (operation === "cancel") onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally {
      inFlight.current = false; setBusy(false);
    }
  }

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

  let oauthGate: ReactNode = null;
  if (!passwordEnabled) {
    if (appleVerify) {
      oauthGate = (
        <View style={styles.verifyBlock}>
          {oauthReauthReady ? (
            <Alert message={text.oauthReauthReadyApple} variant="info" />
          ) : (
            <>
              <Text style={styles.hint}>{text.confirmHintApple}</Text>
              <Button label={text.confirmWithApple} loading={busy} onPress={() => void confirmWithApple()} variant="secondary" />
            </>
          )}
        </View>
      );
    } else if (googleVerify) {
      oauthGate = (
        <View style={styles.verifyBlock}>
          {oauthReauthReady ? (
            <Alert message={text.oauthReauthReadyGoogle} variant="info" />
          ) : (
            <>
              <Text style={styles.hint}>{text.confirmHintGoogle}</Text>
              <Button label={text.confirmWithGoogle} loading={busy} onPress={() => void confirmWithGoogle()} variant="secondary" />
            </>
          )}
        </View>
      );
    } else {
      oauthGate = <Alert variant="info" message={text.genericUnavailable} />;
    }
  }

  const canOpenEmailActions = passwordEnabled || ((appleVerify || googleVerify) && oauthReauthReady);

  return (
    <View style={{ gap: space.md, marginTop: space.md }}>
      <Alert message={error} />
      <Alert message={message} variant="success" />
      {pending ? (
        <>
          <Text style={{ ...type.caption, color: colors.textMuted }}>{t("account.pendingEmail", { email: pending })}</Text>
          <Button label={t("account.resend")} variant="secondary" disabled={busy} onPress={() => void pendingAction("resend")} />
          <Button label={t("account.cancelEmail")} variant="secondary" disabled={busy} onPress={() => void pendingAction("cancel")} />
        </>
      ) : null}
      {oauthGate}
      {canOpenEmailActions ? (
        <>
          <Button
            label={t(kind === "primary" ? "account.changeEmail" : "account.setBackup")}
            variant="secondary"
            disabled={busy}
            onPress={() => setAction("change")}
          />
          {kind === "backup" && configured ? (
            <Button label={t("account.removeBackup")} variant="secondary" disabled={busy} onPress={() => setAction("remove")} />
          ) : null}
        </>
      ) : null}
      {action ? (
        <EmailForm
          kind={kind}
          remove={action === "remove"}
          passwordEnabled={passwordEnabled}
          twoFactorEnabled={twoFactorEnabled}
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

function EmailForm({
  kind,
  remove,
  passwordEnabled,
  twoFactorEnabled,
  onClose,
  onSaved,
}: {
  kind: "primary" | "backup";
  remove: boolean;
  passwordEnabled: boolean;
  twoFactorEnabled: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { api, t } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const title = t(remove ? "account.removeBackup" : kind === "primary" ? "account.changeEmail" : "account.setBackup");

  async function save() {
    if (lock.current) return;
    if (passwordEnabled && !password) return;
    lock.current = true; setBusy(true); setError(""); setFields({});
    const codeType = useRecovery ? "recovery_code" : "code";
    try {
      await api.post(endpoints.account() + kind + "-email/" + (remove ? "remove/" : ""), {
        ...(passwordEnabled ? { current_password: password } : {}),
        ...(!remove ? { email: email.trim() } : {}),
        ...(twoFactorEnabled && !passwordEnabled ? { [codeType]: code } : {}),
      });
      onSaved();
    } catch (caught) {
      if (caught instanceof ApiError) setFields(fieldErrorsFromBody(caught.data));
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally {
      lock.current = false; setBusy(false);
    }
  }

  return (
    <ManagementSheet title={title} busy={busy} dirty={Boolean(email || password || code)} onClose={onClose}>
      <Alert message={error} />
      {!remove ? (
        <>
          <Alert variant="info" message={t("account.emailVerifyHint")} />
          <Field label={t("auth.email")} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} error={fields.email} />
        </>
      ) : (
        <Alert variant="warning" message={t("account.removeBackupHint")} />
      )}
      {passwordEnabled ? (
        <Field label={t("security.currentPassword")} secureTextEntry textContentType="password" value={password} onChangeText={setPassword} autoCapitalize="none" error={fields.current_password} />
      ) : null}
      {twoFactorEnabled && !passwordEnabled ? (
        <>
          <Button
            label={useRecovery ? t("auth.authenticatorCode") : t("auth.recoveryCode")}
            onPress={() => {
              setUseRecovery((value) => !value);
              setCode("");
            }}
            variant="secondary"
          />
          <Field
            label={t(useRecovery ? "security.recoveryCode" : "security.code")}
            value={code}
            onChangeText={setCode}
            error={fields[useRecovery ? "recovery_code" : "code"]}
          />
        </>
      ) : null}
      <Button label={title} loading={busy} onPress={() => void save()} />
    </ManagementSheet>
  );
}

const styles = StyleSheet.create({
  verifyBlock: { gap: space.sm },
  hint: { ...type.caption, color: colors.textSecondary },
});
