import { useState } from "react";
import { Redirect, router } from "expo-router";
import { Keyboard, ScrollView, StyleSheet, View } from "react-native";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { canManageGroupConfiguration, hasPlanFeature } from "@checkstation/domain";
import { Alert, Button, Field, Screen } from "../../../src/components/ui";
import { FilterTabs, PageHeader, SectionCard } from "../../../src/components/mobile";
import { useApp } from "../../../src/lib/AppProvider";
import { space } from "../../../src/theme/tokens";

type GroupType = "standard" | "structured";
type GroupResult = { id: number };
export default function NewGroupScreen() {
  const { api, authState, t } = useApp(); const [name, setName] = useState(""); const [groupType, setGroupType] = useState<GroupType>("standard"); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  if (!canManageGroupConfiguration(authState.session)) return <Redirect href="/(app)/(tabs)/groups" />;
  const structuredAvailable = hasPlanFeature(authState.session, "structured_groups");
  async function submit() { setBusy(true); setError(""); setFieldErrors({}); try { const group = await api.post<GroupResult>(endpoints.groups(), { name: name.trim(), group_type: groupType }); Keyboard.dismiss(); router.replace(`/(app)/group/${group.id}`); } catch (caught) { if (caught instanceof ApiError) { const fields = fieldErrorsFromBody(caught.data); setFieldErrors(fields); if (!Object.values(fields).some(Boolean)) setError(caught.message); } else setError(t("common.error")); } finally { setBusy(false); } }
  const options: Array<{ value: GroupType; label: string }> = [{ value: "standard", label: t("groups.standard") }]; if (structuredAvailable) options.push({ value: "structured", label: t("groups.structured") });
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled"><PageHeader title={t("groups.add")} description={t("groups.addDescription")} /><SectionCard><View style={styles.form}><Field autoFocus error={fieldErrors.name} label={t("groups.name")} onChangeText={(value) => { setName(value); setFieldErrors((current) => ({ ...current, name: "" })); setError(""); }} onSubmitEditing={() => void submit()} returnKeyType="done" value={name} /><FilterTabs value={groupType} options={options} onChange={setGroupType} />{fieldErrors.group_type ? <Alert message={fieldErrors.group_type} /> : null}<Alert message={error} /><Button disabled={busy} label={busy ? t("groups.saving") : t("groups.save")} loading={busy} onPress={() => void submit()} /></View></SectionCard></ScrollView></Screen>;
}
const styles = StyleSheet.create({ screen: { padding: 0 }, content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg }, form: { gap: space.lg } });
