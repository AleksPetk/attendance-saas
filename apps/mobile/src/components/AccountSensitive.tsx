import { useState } from "react";
import { Alert as NativeAlert, StyleSheet, Text, View } from "react-native";
import { ApiError, fieldErrorsFromBody } from "@checkstation/api";
import { Alert, Button, Field } from "./ui";
import { SectionCard, StatusPill } from "./mobile";
import { ManagementSheet } from "./ManagementSheet";
import { useApp } from "../lib/AppProvider";
import { colors, space, type } from "../theme/tokens";

type Methods = {
  password?: { enabled?: boolean };
  google?: { linked?: boolean; provider_email?: string };
  apple?: { linked?: boolean; provider_email?: string };
  can_unlink_google?: boolean;
  can_unlink_apple?: boolean;
};
type Account = { two_factor_status?: string; sign_in_methods?: Methods };
type Action = "delete" | "google" | "apple";

const copy = {
  en: {
    connected: "Connected", notConnected: "Not connected", connect: "Connect", disconnect: "Disconnect",
    oauthGap: "Google and Apple connection in the mobile app is not available yet. Existing connections are shown from your CheckStation account.",
    oauthSensitive: "This action requires provider re-verification. Secure mobile Google/Apple re-verification is not available yet.",
    danger: "Danger zone", deleteAccount: "Delete account", permanentlyDelete: "Delete permanently",
    deleteWarning: "Permanently delete your owner account, workspace, and customer-created operational data. This cannot be undone. Existing subscription and provider safeguards apply; an active subscription may block deletion.",
    finalDeleteConfirmation: "Permanently delete your account and workspace? This cannot be undone.",
    confirmPhrase: "Type DELETE to confirm",
    disconnectHint: "Confirm your identity to disconnect this sign-in method. Your account must retain an available sign-in method.",
  },
  ja: {
    connected: "接続済み", notConnected: "未接続", connect: "接続", disconnect: "接続を解除",
    oauthGap: "モバイルアプリでのGoogle・Apple接続はまだ利用できません。既存の接続はCheckStationアカウントから取得して表示しています。",
    oauthSensitive: "この操作にはプロバイダーによる再認証が必要です。安全なモバイルGoogle・Apple再認証はまだ利用できません。",
    danger: "危険な操作", deleteAccount: "アカウントを削除", permanentlyDelete: "完全に削除",
    deleteWarning: "オーナーアカウント、Workspace、お客様が作成した運用データを完全に削除します。元に戻せません。既存のサブスクリプションとプロバイダーの保護措置が適用され、有効なサブスクリプションがある場合は削除できないことがあります。",
    finalDeleteConfirmation: "アカウントとWorkspaceを完全に削除しますか？元に戻せません。",
    confirmPhrase: "確認のためDELETEと入力",
    disconnectHint: "本人確認後にサインイン方法を解除します。利用可能なサインイン方法を少なくとも1つ残す必要があります。",
  },
};

export function AccountSensitive({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const { locale, t } = useApp();
  const text = locale === "ja" ? copy.ja : copy.en;
  const [action, setAction] = useState<Action | null>(null);
  const methods = account.sign_in_methods;
  return (
    <>
      <SectionCard title={t("nav.security")}>
        <Text style={styles.note}>{text.oauthGap}</Text>
        {(["google", "apple"] as const).map((provider) => {
          const linked = Boolean(methods?.[provider]?.linked);
          const canUnlink = Boolean(methods?.[`can_unlink_${provider}`]);
          return (
            <View key={provider} style={styles.method}>
              <View style={styles.copy}>
                <Text style={styles.name}>{provider === "google" ? "Google" : "Apple"}</Text>
                {methods?.[provider]?.provider_email ? <Text style={styles.note}>{methods[provider]?.provider_email}</Text> : null}
              </View>
              <StatusPill label={linked ? text.connected : text.notConnected} tone={linked ? "green" : "neutral"} />
              <Button
                disabled={!linked || !canUnlink}
                label={linked ? text.disconnect : text.connect}
                onPress={() => setAction(provider)}
                variant="secondary"
              />
            </View>
          );
        })}
      </SectionCard>
      <SectionCard title={text.danger}>
        <Text style={styles.note}>{text.deleteWarning}</Text>
        <Button label={text.deleteAccount} onPress={() => setAction("delete")} variant="danger" />
      </SectionCard>
      {action ? <SensitiveSheet account={account} action={action} onClose={() => setAction(null)} onSaved={onSaved} /> : null}
    </>
  );
}

function SensitiveSheet({ account, action, onClose, onSaved }: { account: Account; action: Action; onClose: () => void; onSaved: () => void }) {
  const { api, auth, locale, t } = useApp();
  const text = locale === "ja" ? copy.ja : copy.en;
  const isDelete = action === "delete";
  const hasPassword = Boolean(account.sign_in_methods?.password?.enabled);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit() {
    if (!hasPassword || busy) return;
    if (isDelete && confirmation.trim() !== "DELETE") return;
    if (isDelete) {
      const confirmed = await new Promise<boolean>((resolve) => {
        NativeAlert.alert(text.deleteAccount, text.finalDeleteConfirmation, [
          { text: t("common.cancel"), style: "cancel", onPress: () => resolve(false) },
          { text: text.permanentlyDelete, style: "destructive", onPress: () => resolve(true) },
        ]);
      });
      if (!confirmed) return;
    }
    setBusy(true); setError(""); setFields({});
    const codeType = useRecovery ? "recovery_code" : "code";
    try {
      await api.post(isDelete ? "/auth/account/delete/" : `/auth/${action}/unlink/`, {
        current_password: password,
        ...(isDelete ? { confirmation } : {}),
        ...(account.two_factor_status === "enabled" ? { [codeType]: code } : {}),
      });
      if (isDelete) await auth.logout();
      else onSaved();
    } catch (caught) {
      if (caught instanceof ApiError) setFields(fieldErrorsFromBody(caught.data));
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ManagementSheet title={isDelete ? text.deleteAccount : `${text.disconnect} ${action === "google" ? "Google" : "Apple"}`} busy={busy} dirty={Boolean(password || confirmation || code)} onClose={onClose}>
      <Text style={styles.note}>{isDelete ? text.deleteWarning : text.disconnectHint}</Text>
      {hasPassword ? <Field label={t("security.currentPassword")} value={password} onChangeText={setPassword} secureTextEntry error={fields.current_password} /> : <Alert message={text.oauthSensitive} variant="info" />}
      {account.two_factor_status === "enabled" ? (
        <>
          <Button label={useRecovery ? t("auth.authenticatorCode") : t("auth.recoveryCode")} onPress={() => { setUseRecovery((value) => !value); setCode(""); }} variant="secondary" />
          <Field label={t(useRecovery ? "security.recoveryCode" : "security.code")} value={code} onChangeText={setCode} error={fields[useRecovery ? "recovery_code" : "code"]} />
        </>
      ) : null}
      {isDelete ? <Field label={text.confirmPhrase} value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" error={fields.confirmation} /> : null}
      <Alert message={error} />
      <Button disabled={!hasPassword || (isDelete && confirmation.trim() !== "DELETE")} label={isDelete ? text.permanentlyDelete : text.disconnect} loading={busy} onPress={() => void submit()} variant="danger" />
    </ManagementSheet>
  );
}

const styles = StyleSheet.create({
  note: { ...type.caption, color: colors.textSecondary },
  method: { gap: space.sm, paddingVertical: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  copy: { gap: 2 },
  name: { ...type.bodyStrong, color: colors.text },
});
