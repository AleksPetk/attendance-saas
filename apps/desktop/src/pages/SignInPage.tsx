import { useState } from "react";
import { ApiError, fieldErrorsFromBody } from "@checkstation/api";
import { useApp } from "../lib/AppProvider";

export function SignInPage() {
  const { auth, authState, t } = useApp();
  const [mode, setMode] = useState<"owner" | "staff">("owner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [username, setUsername] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitOwner() {
    setBusy(true);
    setError("");
    try {
      await auth.loginOwner(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = fieldErrorsFromBody(err.data);
        setError(fields.email || fields.password || err.message);
      } else setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function submitTotp() {
    setBusy(true);
    setError("");
    try {
      await auth.completeOwnerTotp(totp.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function submitStaff() {
    setBusy(true);
    setError("");
    try {
      await auth.loginStaff(workspaceId.trim(), username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "10vh auto", padding: 24, background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)" }}>
      <h1>{t("app.name")}</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setMode("owner")}>{t("auth.ownerSignIn")}</button>
        <button type="button" onClick={() => setMode("staff")}>{t("auth.staffSignIn")}</button>
      </div>
      {authState.status === "needs_2fa" ? (
        <>
          <label>{t("auth.twoFactor")}<input value={totp} onChange={(e) => setTotp(e.target.value)} /></label>
          <button type="button" disabled={busy} onClick={() => void submitTotp()}>{t("auth.continue")}</button>
        </>
      ) : mode === "owner" ? (
        <>
          <label>{t("auth.email")}<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>{t("auth.password")}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button type="button" disabled={busy} onClick={() => void submitOwner()}>{t("auth.signIn")}</button>
          <p style={{ color: "var(--muted)" }}>{t("auth.oauthUnavailable")}</p>
        </>
      ) : (
        <>
          <label>{t("auth.workspaceId")}<input value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} /></label>
          <label>{t("auth.username")}<input value={username} onChange={(e) => setUsername(e.target.value)} /></label>
          <label>{t("auth.password")}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button type="button" disabled={busy} onClick={() => void submitStaff()}>{t("auth.signIn")}</button>
        </>
      )}
      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
      <style>{`label{display:block;margin:8px 0} input{display:block;width:100%;margin-top:4px;padding:8px}`}</style>
    </div>
  );
}
