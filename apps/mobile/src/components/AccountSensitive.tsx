import { useState } from "react";
import { Alert as NativeAlert, StyleSheet, Text, View } from "react-native";
import { ApiError, fieldErrorsFromBody } from "@checkstation/api";
import { Alert, Button, Field } from "./ui";
import { SectionCard, StatusPill } from "./mobile";
import { ManagementSheet } from "./ManagementSheet";
import { useApp } from "../lib/AppProvider";
import { requestNativeAppleCredential } from "../lib/appleNativeAuth";
import { requestNativeGoogleCredential } from "../lib/googleNativeAuth";
import { colors, space, type } from "../theme/tokens";
import {
  canConfirmDeleteWithApple,
  canConfirmDeleteWithGoogle,
  remainingProviderForUnlink,
} from "./accountDeleteReauth";

type Methods = {
  password?: { enabled?: boolean };
  google?: { linked?: boolean; provider_email?: string };
  apple?: { linked?: boolean; provider_email?: string };
  can_unlink_google?: boolean;
  can_unlink_apple?: boolean;
};
type Account = { two_factor_status?: string; sign_in_methods?: Methods };
type Provider = "google" | "apple";
type Action = "delete" | { kind: "unlink"; provider: Provider };

const copy = {
  en: {
    connected: "Connected",
    notConnected: "Not connected",
    connect: "Connect",
    disconnect: "Disconnect",
    connecting: "Connecting…",
    confirmWithApple: "Confirm with Apple",
    confirmWithGoogle: "Confirm with Google",
    oauthReauthReadyApple: "Identity confirmed with Apple",
    oauthReauthReadyGoogle: "Identity confirmed with Google",
    appleVerifyFailed: "Apple identity could not be confirmed. Try again.",
    googleVerifyFailed: "Google identity could not be confirmed. Try again.",
    appleConnectFailed: "Apple could not be connected. Try again.",
    googleConnectFailed: "Google could not be connected. Try again.",
    appleUnavailable: "Sign in with Apple is not available on this device.",
    googleUnavailable: "Google sign-in is not available on this device.",
    googleMisconfigured: "Google sign-in is not configured for this build yet.",
    oauthSensitiveGeneric: "Confirm your identity with another linked sign-in provider before disconnecting.",
    unlinkAppleHint: "Confirm your identity with Apple to disconnect Google.",
    unlinkGoogleHint: "Confirm your identity with Google to disconnect Apple.",
    danger: "Danger zone",
    deleteAccount: "Delete account",
    permanentlyDelete: "Delete permanently",
    deleteWarning:
      "Permanently delete your owner account, workspace, and customer-created operational data. This cannot be undone. Existing subscription and provider safeguards apply; an active subscription may block deletion.",
    finalDeleteConfirmation: "Permanently delete your account and workspace? This cannot be undone.",
    confirmPhrase: "Type DELETE to confirm",
    disconnectHint:
      "Confirm your identity to disconnect this sign-in method. Your account must retain an available sign-in method.",
    lastMethod: "Your account must keep at least one sign-in method.",
  },
  ja: {
    connected: "接続済み",
    notConnected: "未接続",
    connect: "接続",
    disconnect: "接続を解除",
    connecting: "接続中…",
    confirmWithApple: "Apple で確認",
    confirmWithGoogle: "Google で確認",
    oauthReauthReadyApple: "Apple で本人確認が完了しました",
    oauthReauthReadyGoogle: "Google で本人確認が完了しました",
    appleVerifyFailed: "Apple の本人確認に失敗しました。もう一度お試しください。",
    googleVerifyFailed: "Google の本人確認に失敗しました。もう一度お試しください。",
    appleConnectFailed: "Apple を接続できませんでした。もう一度お試しください。",
    googleConnectFailed: "Google を接続できませんでした。もう一度お試しください。",
    appleUnavailable: "このデバイスでは Sign in with Apple を利用できません。",
    googleUnavailable: "このデバイスでは Google サインインを利用できません。",
    googleMisconfigured: "このビルドでは Google サインインがまだ設定されていません。",
    oauthSensitiveGeneric: "接続を解除する前に、別の連携サインイン方法で本人確認してください。",
    unlinkAppleHint: "Google の接続を解除するには Apple で本人確認してください。",
    unlinkGoogleHint: "Apple の接続を解除するには Google で本人確認してください。",
    danger: "危険な操作",
    deleteAccount: "アカウントを削除",
    permanentlyDelete: "アカウントを完全に削除",
    deleteWarning:
      "CheckStation アカウント、このワークスペース、およびお客様が作成した運用データを完全に削除します。この操作は元に戻せません。",
    finalDeleteConfirmation:
      "この操作は元に戻せません。CheckStation アカウントとワークスペースを完全に削除しますか？",
    confirmPhrase: "確認のためDELETEと入力",
    disconnectHint:
      "本人確認後にサインイン方法を解除します。利用可能なサインイン方法を少なくとも1つ残す必要があります。",
    lastMethod: "アカウントには利用可能なサインイン方法を少なくとも1つ残す必要があります。",
  },
};

export function AccountSensitive({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const { auth, locale, t } = useApp();
  const text = locale === "ja" ? copy.ja : copy.en;
  const [action, setAction] = useState<Action | null>(null);
  const [connectBusy, setConnectBusy] = useState<Provider | null>(null);
  const [connectError, setConnectError] = useState("");
  const methods = account.sign_in_methods;

  async function connectProvider(provider: Provider) {
    if (connectBusy) return;
    setConnectBusy(provider);
    setConnectError("");
    try {
      if (provider === "google") {
        const google = await requestNativeGoogleCredential();
        if (google.kind === "cancelled") return;
        if (google.kind === "unavailable") {
          setConnectError(text.googleUnavailable);
          return;
        }
        if (google.kind === "misconfigured") {
          setConnectError(text.googleMisconfigured);
          return;
        }
        if (google.kind === "missing_token" || google.kind === "error") {
          setConnectError(google.kind === "error" ? google.message : text.googleConnectFailed);
          return;
        }
        await auth.linkGoogleNative({ identityToken: google.credential.identityToken });
      } else {
        const apple = await requestNativeAppleCredential();
        if (apple.kind === "cancelled") return;
        if (apple.kind === "unavailable") {
          setConnectError(text.appleUnavailable);
          return;
        }
        if (apple.kind === "missing_token" || apple.kind === "error") {
          setConnectError(apple.kind === "error" ? apple.message : text.appleConnectFailed);
          return;
        }
        await auth.linkAppleNative({
          identityToken: apple.credential.identityToken,
          nonce: apple.credential.nonce,
        });
      }
      onSaved();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setConnectError(
          typeof caught.data?.detail === "string"
            ? caught.data.detail
            : provider === "google"
              ? text.googleConnectFailed
              : text.appleConnectFailed,
        );
      } else {
        setConnectError(
          caught instanceof Error
            ? caught.message
            : provider === "google"
              ? text.googleConnectFailed
              : text.appleConnectFailed,
        );
      }
    } finally {
      setConnectBusy(null);
    }
  }

  return (
    <>
      <SectionCard title={t("nav.security")}>
        {(["google", "apple"] as const).map((provider) => {
          const linked = Boolean(methods?.[provider]?.linked);
          const canUnlink = Boolean(methods?.[`can_unlink_${provider}`]);
          const busy = connectBusy === provider;
          return (
            <View key={provider} style={styles.method}>
              <View style={styles.copy}>
                <Text style={styles.name}>{provider === "google" ? "Google" : "Apple"}</Text>
                {methods?.[provider]?.provider_email ? (
                  <Text style={styles.note}>{methods[provider]?.provider_email}</Text>
                ) : null}
              </View>
              <StatusPill
                label={linked ? text.connected : text.notConnected}
                tone={linked ? "green" : "neutral"}
              />
              {linked ? (
                <Button
                  disabled={!canUnlink || Boolean(connectBusy)}
                  label={text.disconnect}
                  onPress={() => setAction({ kind: "unlink", provider })}
                  variant="secondary"
                />
              ) : (
                <Button
                  disabled={Boolean(connectBusy)}
                  label={busy ? text.connecting : text.connect}
                  loading={busy}
                  onPress={() => void connectProvider(provider)}
                  variant="secondary"
                />
              )}
            </View>
          );
        })}
        <Alert message={connectError} />
      </SectionCard>
      <SectionCard title={text.danger}>
        <Text style={styles.note}>{text.deleteWarning}</Text>
        <Button label={text.deleteAccount} onPress={() => setAction("delete")} variant="danger" />
      </SectionCard>
      {action ? (
        <SensitiveSheet
          account={account}
          action={action}
          onClose={() => setAction(null)}
          onSaved={onSaved}
        />
      ) : null}
    </>
  );
}

function SensitiveSheet({
  account,
  action,
  onClose,
  onSaved,
}: {
  account: Account;
  action: Action;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { api, auth, locale, t } = useApp();
  const text = locale === "ja" ? copy.ja : copy.en;
  const isDelete = action === "delete";
  const unlinkProvider = action === "delete" ? null : action.provider;
  const hasPassword = Boolean(account.sign_in_methods?.password?.enabled);
  const appleDeleteVerify = isDelete && canConfirmDeleteWithApple(account.sign_in_methods);
  const googleDeleteVerify =
    isDelete && canConfirmDeleteWithGoogle(account.sign_in_methods) && !appleDeleteVerify;
  const remainingUnlink = unlinkProvider
    ? remainingProviderForUnlink(account.sign_in_methods, unlinkProvider)
    : null;
  const appleUnlinkVerify = !isDelete && !hasPassword && remainingUnlink === "apple";
  const googleUnlinkVerify = !isDelete && !hasPassword && remainingUnlink === "google";

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [oauthReauthReady, setOauthReauthReady] = useState(false);

  const canSubmitDestructive =
    (hasPassword && Boolean(password)) ||
    (!hasPassword && (isDelete || Boolean(remainingUnlink)) && oauthReauthReady);

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

  async function submit() {
    if (busy) return;
    if (isDelete && confirmation.trim() !== "DELETE") return;
    if (hasPassword) {
      if (!password) return;
    } else if (!oauthReauthReady) {
      return;
    }
    if (isDelete) {
      const confirmed = await new Promise<boolean>((resolve) => {
        NativeAlert.alert(text.deleteAccount, text.finalDeleteConfirmation, [
          { text: t("common.cancel"), style: "cancel", onPress: () => resolve(false) },
          { text: text.permanentlyDelete, style: "destructive", onPress: () => resolve(true) },
        ]);
      });
      if (!confirmed) return;
    }
    setBusy(true);
    setError("");
    setFields({});
    const codeType = useRecovery ? "recovery_code" : "code";
    try {
      await api.post(isDelete ? "/auth/account/delete/" : `/auth/${unlinkProvider}/unlink/`, {
        ...(hasPassword ? { current_password: password } : {}),
        ...(isDelete ? { confirmation } : {}),
        ...(account.two_factor_status === "enabled" ? { [codeType]: code } : {}),
      });
      if (isDelete) await auth.logout();
      else onSaved();
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFields(fieldErrorsFromBody(caught.data));
        const codeValue = typeof caught.data?.code === "string" ? caught.data.code : "";
        if (codeValue === "last_sign_in_method") {
          setError(text.lastMethod);
        } else if (typeof caught.data?.detail === "string") {
          setError(caught.data.detail);
        } else {
          setError(caught.message || t("common.error"));
        }
      } else {
        setError(caught instanceof Error ? caught.message : t("common.error"));
      }
    } finally {
      setBusy(false);
    }
  }

  const title = isDelete
    ? text.deleteAccount
    : `${text.disconnect} ${unlinkProvider === "google" ? "Google" : "Apple"}`;

  let oauthHint: string | null = null;
  if (!hasPassword && isDelete && !appleDeleteVerify && !googleDeleteVerify) {
    oauthHint = text.oauthSensitiveGeneric;
  }
  if (!hasPassword && !isDelete && !remainingUnlink) {
    oauthHint = text.oauthSensitiveGeneric;
  }

  return (
    <ManagementSheet
      title={title}
      busy={busy}
      dirty={Boolean(password || confirmation || code || oauthReauthReady)}
      onClose={onClose}
    >
      <Text style={styles.note}>{isDelete ? text.deleteWarning : text.disconnectHint}</Text>
      {hasPassword ? (
        <Field
          label={t("security.currentPassword")}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          error={fields.current_password}
        />
      ) : appleDeleteVerify || appleUnlinkVerify ? (
        <View style={styles.verifyBlock}>
          {oauthReauthReady ? (
            <Alert message={text.oauthReauthReadyApple} variant="info" />
          ) : (
            <>
              <Text style={styles.note}>
                {isDelete
                  ? locale === "ja"
                    ? "削除を続行するには Apple で本人確認してください。"
                    : "Confirm your identity with Apple to continue deletion."
                  : text.unlinkAppleHint}
              </Text>
              <Button
                label={text.confirmWithApple}
                loading={busy}
                onPress={() => void confirmWithApple()}
                variant="secondary"
              />
            </>
          )}
        </View>
      ) : googleDeleteVerify || googleUnlinkVerify ? (
        <View style={styles.verifyBlock}>
          {oauthReauthReady ? (
            <Alert message={text.oauthReauthReadyGoogle} variant="info" />
          ) : (
            <>
              <Text style={styles.note}>
                {isDelete
                  ? locale === "ja"
                    ? "削除を続行するには Google で本人確認してください。"
                    : "Confirm your identity with Google to continue deletion."
                  : text.unlinkGoogleHint}
              </Text>
              <Button
                label={text.confirmWithGoogle}
                loading={busy}
                onPress={() => void confirmWithGoogle()}
                variant="secondary"
              />
            </>
          )}
        </View>
      ) : oauthHint ? (
        <Alert message={oauthHint} variant="info" />
      ) : null}
      {account.two_factor_status === "enabled" ? (
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
      {isDelete ? (
        <Field
          label={text.confirmPhrase}
          value={confirmation}
          onChangeText={setConfirmation}
          autoCapitalize="characters"
          error={fields.confirmation}
        />
      ) : null}
      <Alert message={error} />
      <Button
        disabled={!canSubmitDestructive || (isDelete && confirmation.trim() !== "DELETE")}
        label={isDelete ? text.permanentlyDelete : text.disconnect}
        loading={busy}
        onPress={() => void submit()}
        variant="danger"
      />
    </ManagementSheet>
  );
}

const styles = StyleSheet.create({
  note: { ...type.caption, color: colors.textSecondary },
  method: {
    gap: space.sm,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  copy: { gap: 2 },
  name: { ...type.bodyStrong, color: colors.text },
  verifyBlock: { gap: space.sm },
});
