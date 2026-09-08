import { useRef, useState } from "react";
import { router } from "expo-router";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { AuthScreen } from "../../src/components/AuthScreen";
import { Alert, Button, Field, TextLink } from "../../src/components/ui";
import { useApp } from "../../src/lib/AppProvider";
import { parseAccountLink, type AccountLink } from "../../src/lib/accountLinks";

export default function EmailLinkScreen() {
  const { api, auth, t } = useApp();
  const [link, setLink] = useState("");
  const [parsed, setParsed] = useState<AccountLink | null>(null);
  const [stage, setStage] = useState<"link" | "reset" | "awaiting_two_factor" | "awaiting_credentials" | "awaiting_primary_verification" | "done">("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function recoveryStatus() {
    const result = await api.get<{ stage: string }>(endpoints.recoverAccountStatus());
    if (result.stage === "awaiting_two_factor" || result.stage === "awaiting_credentials" || result.stage === "awaiting_primary_verification") setStage(result.stage);
    else throw new Error(t("accountLink.expired"));
  }
  async function submit() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setFields({});
    try {
      if (stage === "link") {
        const target = parseAccountLink(link);
        if (!target) throw new Error(t("accountLink.invalid"));
        setParsed(target);
        if (target.kind === "reset") { setStage("reset"); return; }
        await api.post(target.endpoint, { uid: target.uid, token: target.token });
        setLink("");
        if (target.kind === "recover") await recoveryStatus();
        else { setStage("done"); await auth.bootstrap(); }
      } else if (stage === "reset" && parsed) {
        await api.post(parsed.endpoint, { uid: parsed.uid, token: parsed.token, password, password_confirm: confirmation });
        setPassword(""); setConfirmation(""); setParsed(null); setStage("done");
      } else if (stage === "awaiting_two_factor") {
        await api.post(endpoints.recoverAccountTwoFactor(), recovery ? { recovery_code: code } : { code });
        setCode(""); await recoveryStatus();
      } else if (stage === "awaiting_credentials") {
        await api.post(endpoints.recoverAccountComplete(), { email: email.trim(), password, password_confirm: confirmation });
        setPassword(""); setConfirmation(""); setParsed(null); setStage("awaiting_primary_verification");
      }
    } catch (caught) {
      if (caught instanceof ApiError) setFields(fieldErrorsFromBody(caught.data));
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally { lock.current = false; setBusy(false); }
  }
  return <AuthScreen title={t("accountLink.title")} lead={t(stage === "link" ? "accountLink.hint" : stage === "awaiting_primary_verification" ? "accountLink.newEmailHint" : stage === "done" ? "accountLink.done" : "accountLink.continue")}>
    <Alert message={error} />
    {stage === "link" ? <Field label={t("accountLink.link")} value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} keyboardType="url" /> : null}
    {stage === "awaiting_credentials" ? <Field label={t("auth.email")} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={fields.email} /> : null}
    {stage === "reset" || stage === "awaiting_credentials" ? <>
      <Field label={t("security.newPassword")} value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" autoCapitalize="none" error={fields.password} />
      <Field label={t("security.confirmPassword")} value={confirmation} onChangeText={setConfirmation} secureTextEntry textContentType="newPassword" autoCapitalize="none" error={fields.password_confirm} />
    </> : null}
    {stage === "awaiting_two_factor" ? <>
      <Field label={t(recovery ? "security.recoveryCode" : "security.code")} value={code} onChangeText={setCode} keyboardType={recovery ? "default" : "number-pad"} textContentType="oneTimeCode" autoCapitalize="none" autoCorrect={false} error={fields.code || fields.recovery_code} />
      <TextLink label={t(recovery ? "auth.useAuthenticator" : "auth.useRecovery")} onPress={() => { setRecovery(!recovery); setCode(""); }} />
    </> : null}
    {stage === "done" ? <Button label={t("common.continue")} onPress={() => router.replace("/")} /> : stage === "awaiting_primary_verification" ? <Button label={t("accountLink.open")} onPress={() => { setStage("link"); setLink(""); }} /> : <Button label={t("auth.continue")} loading={busy} onPress={() => void submit()} />}
    <TextLink label={t("common.back")} disabled={busy} onPress={() => router.canGoBack() ? router.back() : router.replace("/")} />
  </AuthScreen>;
}
