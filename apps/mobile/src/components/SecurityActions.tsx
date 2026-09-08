import { useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { useApp } from "../lib/AppProvider";
import { ManagementSheet } from "./ManagementSheet";
import { Alert, Button, Field, TextLink } from "./ui";
import { colors, space, type } from "../theme/tokens";

type Action = "password" | "setup" | "regenerate" | "disable";
export function SecurityActions({ enabled, passwordEnabled, onSaved }: { enabled: boolean; passwordEnabled: boolean; onSaved: () => void }) {
  const { t } = useApp();
  const [action, setAction] = useState<Action | null>(null);
  if (!passwordEnabled) return <Alert variant="info" message={t("security.passwordUnavailable")} />;
  return <View style={styles.stack}>
    <Button label={t("security.changePassword")} variant="secondary" onPress={() => setAction("password")} />
    {enabled ? <>
      <Button label={t("security.regenerate")} variant="secondary" onPress={() => setAction("regenerate")} />
      <TextLink label={t("security.disable")} onPress={() => setAction("disable")} />
    </> : <Button label={t("security.setup")} onPress={() => setAction("setup")} />}
    {action ? <SecurityForm action={action} onClose={() => setAction(null)} onSaved={() => { setAction(null); onSaved(); }} /> : null}
  </View>;
}

function SecurityForm({ action, onClose, onSaved }: { action: Action; onClose: () => void; onSaved: () => void }) {
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
  const title = t(action === "password" ? "security.changePassword" : "security." + action);
  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setFields({});
    try {
      if (action === "password") {
        await api.post(endpoints.changePassword(), { current_password: password, new_password: newPassword, new_password_confirm: confirmation });
        onSaved();
      } else if (action === "setup" && !setup) {
        setSetup(await api.post(endpoints.ownerTwoFactorSetup(), { current_password: password }));
        setPassword("");
      } else if (action === "setup") {
        const result = await api.post<{ recovery_codes: string[] }>(endpoints.ownerTwoFactorVerify(), { code });
        setCodes(result.recovery_codes); setCode(""); setSetup(null);
      } else {
        const result = await api.post<{ recovery_codes?: string[] }>(action === "regenerate" ? endpoints.ownerTwoFactorRegenerate() : endpoints.ownerTwoFactorDisable(), {
          current_password: password, ...(useRecovery ? { recovery_code: code } : { code }),
        });
        setPassword(""); setCode("");
        if (action === "regenerate") setCodes(result.recovery_codes || []);
        else onSaved();
      }
    } catch (caught) {
      if (caught instanceof ApiError) setFields(fieldErrorsFromBody(caught.data));
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <ManagementSheet title={codes ? t("security.recoveryCodes") : title} busy={busy} dirty={!!(password || newPassword || confirmation || code || setup || codes)} onClose={onClose}>
    <Alert message={error} />
    {codes ? <>
      <Alert variant="warning" message={t("security.codesHint")} />
      <Text selectable style={styles.codes}>{codes.join("\n")}</Text>
      <Button label={t("security.done")} onPress={onSaved} />
    </> : <>
      {!setup ? <Field label={t("security.currentPassword")} secureTextEntry textContentType="password" autoCapitalize="none" value={password} onChangeText={setPassword} error={fields.current_password} /> : null}
      {action === "password" ? <>
        <Field label={t("security.newPassword")} secureTextEntry textContentType="newPassword" autoCapitalize="none" value={newPassword} onChangeText={setNewPassword} error={fields.new_password} />
        <Field label={t("security.confirmPassword")} secureTextEntry textContentType="newPassword" autoCapitalize="none" value={confirmation} onChangeText={setConfirmation} error={fields.new_password_confirm} />
      </> : null}
      {setup ? <>
        <Text style={styles.body}>{t("security.setupHint")}</Text>
        <Image accessibilityLabel={t("security.setupKey")} source={{ uri: setup.qr_data_uri }} style={styles.qr} />
        <Text selectable style={styles.codes}>{setup.setup_key}</Text>
      </> : null}
      {setup || action === "regenerate" || action === "disable" ? <>
        {action !== "setup" ? <TextLink label={t(useRecovery ? "auth.useAuthenticator" : "auth.useRecovery")} onPress={() => { setUseRecovery(!useRecovery); setCode(""); }} /> : null}
        <Field label={t(useRecovery ? "security.recoveryCode" : "security.code")} value={code} onChangeText={setCode} keyboardType={useRecovery ? "default" : "number-pad"} textContentType="oneTimeCode" autoCapitalize="none" autoCorrect={false} error={fields.code || fields.recovery_code} />
      </> : null}
      <Button label={setup ? t("auth.verify") : title} loading={busy} onPress={() => void submit()} variant={action === "disable" ? "danger" : "primary"} />
    </>}
  </ManagementSheet>;
}
const styles = StyleSheet.create({ stack: { gap: space.md }, body: { ...type.body, color: colors.textSecondary }, codes: { ...type.bodyStrong, color: colors.text, lineHeight: 30 }, qr: { width: 220, height: 220, alignSelf: "center" } });
