import { useState, type FormEvent } from "react";
import { ApiError, fieldErrorsFromBody } from "@checkstation/api";
import { Alert, Badge, Button, Card, Field, Input, Modal, Segmented, formatError } from "./ui";
import { SecurityModal, type SecurityAction } from "../pages/SecurityPage";
import { useApp } from "../lib/AppProvider";

export type SecurityAccount = {
  two_factor_status?: string;
  sign_in_methods?: {
    password?: { enabled?: boolean };
    google?: { linked?: boolean; provider_email?: string | null };
    apple?: { linked?: boolean; provider_email?: string | null };
    can_unlink_google?: boolean;
    can_unlink_apple?: boolean;
  };
};
type SensitiveAction = "google" | "apple" | "delete";

export function AccountSecurity({ account, onRefresh }: { account: SecurityAccount; onRefresh: () => Promise<void> }) {
  const { t, locale } = useApp();
  const [action, setAction] = useState<SecurityAction | null>(null);
  const [sensitive, setSensitive] = useState<SensitiveAction | null>(null);
  const text = locale === "ja" ? japanese : english;
  const methods = account.sign_in_methods;
  const password = Boolean(methods?.password?.enabled);
  const enabled = account.two_factor_status === "enabled";
  return <>
    <Card title={t("security.signInMethods")}>
      <div className="desktop-account-method"><strong>{t("security.password")}</strong><Badge tone={password ? "green" : "neutral"}>{password ? text.connected : text.notConnected}</Badge></div>
      {(["google", "apple"] as const).map((provider) => <div className="desktop-account-method" key={provider}><div><strong>{provider === "google" ? "Google" : "Apple"}</strong>{methods?.[provider]?.provider_email ? <span>{methods[provider]?.provider_email}</span> : null}</div><Badge tone={methods?.[provider]?.linked ? "green" : "neutral"}>{methods?.[provider]?.linked ? text.connected : text.notConnected}</Badge><Button className="button-sm" variant="secondary" disabled={!methods?.[provider]?.linked || !methods?.[`can_unlink_${provider}`]} onClick={() => setSensitive(provider)}>{methods?.[provider]?.linked ? text.disconnect : text.connect}</Button></div>)}
      <p className="desktop-account-note">{text.oauthGap}</p>
    </Card>
    <div className="desktop-account-email-grid">
      <Card title={t("security.changePassword")}><details className="desktop-account-disclosure"><summary>{text.passwordSummary}</summary><p className="desktop-account-note">{password ? t("staff.passwordHint") : text.oauthSensitive}</p><Button variant="secondary" disabled={!password} onClick={() => setAction("password")}>{t("security.changePassword")}</Button></details></Card>
      <Card title={t("security.twoFactor")}><div className="desktop-account-security-summary"><div><strong>{t("security.authenticator")}</strong><Badge tone={enabled ? "green" : "neutral"}>{t(enabled ? "security.enabled" : "security.notEnabled")}</Badge></div><p className="desktop-account-note">{text.twoFactorHint}</p><div className="toolbar">{enabled ? <><Button className="button-sm" variant="secondary" onClick={() => setAction("regenerate")}>{t("security.regenerate")}</Button><Button className="button-sm" variant="secondary" onClick={() => setAction("disable")}>{t("security.disable")}</Button></> : <Button className="button-sm" onClick={() => setAction("setup")}>{t("security.setup")}</Button>}</div></div></Card>
    </div>
    <Card title={text.danger}><p className="desktop-account-note">{text.deleteWarning}</p><Button className="button-sm" variant="danger" onClick={() => setSensitive("delete")}>{text.deleteAccount}</Button></Card>
    {action ? <SecurityModal action={action} onClose={() => { setAction(null); void onRefresh(); }} onSaved={() => { setAction(null); void onRefresh(); }} /> : null}
    {sensitive ? <SensitiveModal action={sensitive} account={account} onClose={() => setSensitive(null)} onSaved={() => { setSensitive(null); void onRefresh(); }} /> : null}
  </>;
}

function SensitiveModal({ action, account, onClose, onSaved }: { action: SensitiveAction; account: SecurityAccount; onClose: () => void; onSaved: () => void }) {
  const { api, auth, locale, t } = useApp();
  const text = locale === "ja" ? japanese : english;
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [code, setCode] = useState(""); const [codeType, setCodeType] = useState<"code" | "recovery_code">("code"); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [fields, setFields] = useState<Record<string, string>>({});
  const hasPassword = Boolean(account.sign_in_methods?.password?.enabled);
  const isDelete = action === "delete";
  const title = isDelete ? text.deleteAccount : `${text.disconnect} ${action === "google" ? "Google" : "Apple"}`;
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !hasPassword) return;
    if (isDelete && !window.confirm(text.finalDeleteConfirmation)) return;
    setBusy(true); setError(""); setFields({});
    try {
      await api.post(isDelete ? "/auth/account/delete/" : `/auth/${action}/unlink/`, { current_password: password, ...(isDelete ? { confirmation } : {}), ...(account.two_factor_status === "enabled" ? { [codeType]: code } : {}) });
      if (isDelete) await auth.logout(); else onSaved();
    } catch (caught) { if (caught instanceof ApiError) setFields(fieldErrorsFromBody(caught.data)); setError(formatError(caught, t("common.error"))); } finally { setBusy(false); }
  }
  return <Modal title={title} onClose={() => { if (!busy) onClose(); }} actions={<><Button variant="secondary" disabled={busy} onClick={onClose}>{t("common.cancel")}</Button><Button variant="danger" type="submit" form="account-sensitive-action" loading={busy} disabled={!hasPassword || (isDelete && confirmation.trim() !== "DELETE")}>{isDelete ? text.permanentlyDelete : text.disconnect}</Button></>}><form id="account-sensitive-action" className="form" onSubmit={submit} autoComplete="off"><p className="desktop-account-note">{isDelete ? text.deleteWarning : text.disconnectHint}</p>{hasPassword ? <Field label={t("security.currentPassword")} error={fields.current_password}><Input autoFocus required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field> : <Alert tone="info">{text.oauthSensitive}</Alert>}{account.two_factor_status === "enabled" ? <><Segmented value={codeType} onChange={(value) => { setCodeType(value); setCode(""); }} options={[{ value: "code", label: t("auth.authenticatorCode") }, { value: "recovery_code", label: t("auth.recoveryCode") }]} /><Field label={t(codeType === "code" ? "security.code" : "security.recoveryCode")} error={fields[codeType]}><Input required value={code} autoComplete={codeType === "code" ? "one-time-code" : "off"} onChange={(event) => setCode(event.target.value)} /></Field></> : null}{isDelete ? <Field label={text.confirmPhrase} error={fields.confirmation}><Input required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></Field> : null}<Alert>{error}</Alert></form></Modal>;
}

const english = {
  connected: "Connected", notConnected: "Not connected", connect: "Connect", disconnect: "Disconnect",
  oauthGap: "Google and Apple connection in the desktop app is not available yet. Existing connections are shown from your CheckStation account.",
  oauthSensitive: "This action requires provider re-verification. Secure desktop Google/Apple re-verification is not available yet.",
  passwordSummary: "Update your password", twoFactorHint: "Protect your account with an authenticator app and recovery codes.",
  danger: "Danger zone", deleteAccount: "Delete account", permanentlyDelete: "Delete permanently",
  deleteWarning: "Permanently delete your owner account, workspace, and customer-created operational data. This cannot be undone. Existing subscription and provider safeguards apply; an active subscription may block deletion.",
  finalDeleteConfirmation: "Permanently delete your account and workspace? This cannot be undone.",
  confirmPhrase: "Type DELETE to confirm", disconnectHint: "Confirm your identity to disconnect this sign-in method. Your account must retain an available sign-in method.",
};
const japanese: typeof english = {
  connected: "接続済み", notConnected: "未接続", connect: "接続", disconnect: "接続を解除",
  oauthGap: "デスクトップアプリでのGoogle・Apple接続はまだ利用できません。既存の接続はCheckStationアカウントから取得して表示しています。",
  oauthSensitive: "この操作にはプロバイダーによる再認証が必要です。安全なデスクトップGoogle・Apple再認証はまだ利用できません。",
  passwordSummary: "パスワードを変更", twoFactorHint: "認証アプリとリカバリーコードでアカウントを保護します。",
  danger: "危険な操作", deleteAccount: "アカウントを削除", permanentlyDelete: "完全に削除",
  deleteWarning: "オーナーアカウント、Workspace、お客様が作成した運用データを完全に削除します。元に戻せません。既存のサブスクリプションとプロバイダーの保護措置が適用され、有効なサブスクリプションがある場合は削除できないことがあります。",
  finalDeleteConfirmation: "アカウントとWorkspaceを完全に削除しますか？元に戻せません。",
  confirmPhrase: "確認のためDELETEと入力", disconnectHint: "本人確認後にサインイン方法を解除します。利用可能なサインイン方法を少なくとも1つ残す必要があります。",
};
