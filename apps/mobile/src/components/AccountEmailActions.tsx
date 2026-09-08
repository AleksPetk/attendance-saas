import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { ManagementSheet } from "./ManagementSheet";
import { Alert, Button, Field } from "./ui";
import { useApp } from "../lib/AppProvider";
import { colors, space, type } from "../theme/tokens";

export function AccountEmailActions({ kind, pending, configured, passwordEnabled, onSaved }: { kind: "primary" | "backup"; pending?: string | null; configured?: boolean; passwordEnabled: boolean; onSaved: () => void }) {
  const { api, t } = useApp();
  const [action, setAction] = useState<"change" | "remove" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  async function pendingAction(operation: "resend" | "cancel") {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try { await api.post(endpoints.account() + kind + "-email/" + operation + "/", {}); setMessage(t(operation === "resend" ? "account.verificationSent" : "manage.saved")); if (operation === "cancel") onSaved(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <View style={{ gap: space.md, marginTop: space.md }}>
    <Alert message={error} /><Alert message={message} variant="success" />
    {pending ? <>
      <Text style={{ ...type.caption, color: colors.textMuted }}>{t("account.pendingEmail", { email: pending })}</Text>
      <Button label={t("account.resend")} variant="secondary" disabled={busy} onPress={() => void pendingAction("resend")} />
      <Button label={t("account.cancelEmail")} variant="secondary" disabled={busy} onPress={() => void pendingAction("cancel")} />
    </> : null}
    {passwordEnabled ? <>
      <Button label={t(kind === "primary" ? "account.changeEmail" : "account.setBackup")} variant="secondary" disabled={busy} onPress={() => setAction("change")} />
      {kind === "backup" && configured ? <Button label={t("account.removeBackup")} variant="secondary" disabled={busy} onPress={() => setAction("remove")} /> : null}
    </> : <Alert variant="info" message={t("security.passwordUnavailable")} />}
    {action ? <EmailForm kind={kind} remove={action === "remove"} onClose={() => setAction(null)} onSaved={() => { setAction(null); onSaved(); }} /> : null}
  </View>;
}
function EmailForm({ kind, remove, onClose, onSaved }: { kind: "primary" | "backup"; remove: boolean; onClose: () => void; onSaved: () => void }) {
  const { api, t } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const title = t(remove ? "account.removeBackup" : kind === "primary" ? "account.changeEmail" : "account.setBackup");
  async function save() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setFields({});
    try {
      await api.post(endpoints.account() + kind + "-email/" + (remove ? "remove/" : ""), { current_password: password, ...(!remove ? { email: email.trim() } : {}) });
      onSaved();
    } catch (caught) {
      if (caught instanceof ApiError) setFields(fieldErrorsFromBody(caught.data));
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally { lock.current = false; setBusy(false); }
  }
  return <ManagementSheet title={title} busy={busy} dirty={!!(email || password)} onClose={onClose}>
    <Alert message={error} />
    {!remove ? <><Alert variant="info" message={t("account.emailVerifyHint")} /><Field label={t("auth.email")} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} error={fields.email} /></> : <Alert variant="warning" message={t("account.removeBackupHint")} />}
    <Field label={t("security.currentPassword")} secureTextEntry textContentType="password" value={password} onChangeText={setPassword} autoCapitalize="none" error={fields.current_password} />
    <Button label={title} loading={busy} onPress={() => void save()} />
  </ManagementSheet>;
}
