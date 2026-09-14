import { useCallback, useEffect, useRef, useState } from "react";
import { Redirect, useFocusEffect } from "expo-router";
import { Alert as NativeAlert, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { canAccessStaffManagement, canManageStaffAccounts, memberUsageMetrics } from "@checkstation/domain";
import { Alert, Button, Field, LoadingState, Screen, SegmentedControl, TextLink } from "../../src/components/ui";
import { AddButton, PageHeader, SearchField, SectionCard, StatusPill } from "../../src/components/mobile";
import { CapacityMeter } from "../../src/components/CapacityMeter";
import { ManagementSheet } from "../../src/components/ManagementSheet";
import { useApp } from "../../src/lib/AppProvider";
import { colors, space, type } from "../../src/theme/tokens";

type Staff = { id: number; username: string; email: string; role: "staff" | "admin"; status: "active" | "inactive"; is_plan_locked?: boolean; group_access?: Array<{ group_id: number; name: string }> };
type Access = { group_id: number; name: string; group_type: string; assigned: boolean };
type Editor = { mode: "create" } | { mode: "edit" | "password" | "access"; staff: Staff };

export default function StaffScreen() {
  const { api, authState, t } = useApp();
  const session = authState.session;
  const allowed = canAccessStaffManagement(session, canManageStaffAccounts(session));
  const [rows, setRows] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true); setError("");
    try { setRows(await api.get<Staff[]>(endpoints.workspaceStaff())); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); }
    finally { setLoading(false); }
  }, [allowed, api, t]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  async function mutate(staff: Staff, remove: boolean) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      if (remove) await api.delete(endpoints.workspaceStaffAccount(staff.id));
      else await api.patch(endpoints.workspaceStaffAccount(staff.id), { status: staff.status === "active" ? "inactive" : "active" });
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function confirm(staff: Staff, remove = false) {
    NativeAlert.alert(t(remove ? "staff.delete" : staff.status === "active" ? "staff.deactivate" : "staff.activate"), t(remove ? "staff.deleteConfirm" : "staff.statusConfirm", { name: staff.username }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.confirm"), style: "destructive", onPress: () => void mutate(staff, remove) },
    ]);
  }
  if (!allowed) return <Redirect href="/(app)/(tabs)/more" />;
  const filtered = rows.filter((row) => (row.username + " " + row.email).toLowerCase().includes(search.trim().toLowerCase()));
  const entitlements = session?.workspace?.entitlements;
  const adminLimit = entitlements?.limits?.workspace_admins;
  const staffLimit = entitlements?.limits?.workspace_staff;
  const adminUsage = memberUsageMetrics(
    entitlements?.usage_totals?.workspace_admins ?? entitlements?.usage?.workspace_admins,
    adminLimit,
    { unlimited: hasLimit(entitlements?.limits, "workspace_admins") && adminLimit == null },
  );
  const staffUsage = memberUsageMetrics(
    entitlements?.usage_totals?.workspace_staff ?? entitlements?.usage?.workspace_staff,
    staffLimit,
    { unlimited: hasLimit(entitlements?.limits, "workspace_staff") && staffLimit == null },
  );
  const sections = ([
    { status: "active", role: "admin", statusLabel: t("members.active"), roleLabel: t("staff.admin") },
    { status: "active", role: "staff", statusLabel: t("members.active"), roleLabel: t("nav.staff") },
    { status: "inactive", role: "admin", statusLabel: t("staff.inactive"), roleLabel: t("staff.admin") },
    { status: "inactive", role: "staff", statusLabel: t("staff.inactive"), roleLabel: t("nav.staff") },
  ] as const).map((section) => ({
    ...section,
    rows: filtered.filter((row) => row.status === section.status && row.role === section.role),
  }));
  return <Screen style={styles.screen}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}>
      <PageHeader title={t("nav.staff")} description={t("staff.description")} action={<AddButton label={t("staff.create")} onPress={() => setEditor({ mode: "create" })} />} />
      {session?.workspace?.workspace_id ? <SectionCard>
        <View style={styles.workspaceIdCard}>
          <View style={styles.copy}>
            <Text style={styles.workspaceIdLabel}>{t("staff.workspaceId")}</Text>
            <Text selectable style={styles.workspaceId}>{session.workspace.workspace_id}</Text>
            <Text style={styles.meta}>{t("staff.workspaceIdHint")}</Text>
          </View>
        </View>
      </SectionCard> : null}
      {adminUsage || staffUsage ? <View accessibilityLabel={t("staff.usageLabel")} style={styles.usage}>
        {adminUsage ? <CapacityMeter
          count={adminUsage.count}
          label={t("staff.admins")}
          limit={adminUsage.limit}
          remainingLabel={adminUsage.remaining == null ? undefined : t("staff.usageSummary", { count: adminUsage.count, remaining: adminUsage.remaining })}
          unlimitedLabel={t("members.unlimited")}
        /> : null}
        {staffUsage ? <CapacityMeter
          count={staffUsage.count}
          label={t("nav.staff")}
          limit={staffUsage.limit}
          remainingLabel={staffUsage.remaining == null ? undefined : t("staff.usageSummary", { count: staffUsage.count, remaining: staffUsage.remaining })}
          unlimitedLabel={t("members.unlimited")}
        /> : null}
      </View> : null}
      <SearchField value={search} onChangeText={setSearch} placeholder={t("staff.search")} />
      <Alert message={error} />
      {loading && !rows.length ? <LoadingState label={t("staff.loading")} /> : null}
      {!loading && !filtered.length ? <Text style={styles.meta}>{t("staff.emptyTitle")}</Text> : null}
      {!loading && filtered.length ? <View style={styles.accountGroups}>{sections.map((section) => <View key={`${section.status}-${section.role}`} style={styles.accountSection}>
        <Text style={styles.sectionLabel}>{section.statusLabel}</Text>
        <SectionCard title={section.roleLabel}>
          {section.rows.length ? section.rows.map((staff, index) => <View key={staff.id} style={[styles.account, index > 0 && styles.accountBorder]}>
            <View style={styles.heading}><View style={styles.copy}><Text style={styles.name}>{staff.username}</Text><Text style={styles.meta}>{staff.email || t("staff.noEmail")}</Text></View>{staff.is_plan_locked ? <StatusPill label={t("members.planLocked")} tone="warning" /> : null}</View>
            {staff.role === "staff" ? <Text style={styles.meta}>{staff.group_access?.map((group) => group.name).join(", ") || t("staff.noGroupAccess")}</Text> : null}
            <View style={styles.actions}>
              <Button variant="secondary" disabled={busy} label={t("staff.edit")} onPress={() => setEditor({ mode: "edit", staff })} />
              {staff.role === "staff" ? <Button variant="secondary" disabled={busy} label={t("staff.groupAccess")} onPress={() => setEditor({ mode: "access", staff })} /> : null}
              <Button variant="secondary" disabled={busy} label={t("staff.resetPassword")} onPress={() => setEditor({ mode: "password", staff })} />
              <Button variant="secondary" disabled={busy} label={t(staff.status === "active" ? "staff.deactivate" : "staff.activate")} onPress={() => confirm(staff)} />
              {staff.status === "inactive" ? <TextLink disabled={busy} label={t("staff.delete")} onPress={() => confirm(staff, true)} /> : null}
            </View>
          </View>) : <Text style={styles.meta}>{t("staff.emptySection")}</Text>}
        </SectionCard>
      </View>)}</View> : null}
    </ScrollView>
    {editor ? <StaffEditor editor={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void load(); }} /> : null}
  </Screen>;
}

function StaffEditor({ editor, onClose, onSaved }: { editor: Editor; onClose: () => void; onSaved: () => void }) {
  const { api, authState, t } = useApp();
  const staff = "staff" in editor ? editor.staff : undefined;
  const canManageAdmins = authState.session?.capabilities?.can_manage_workspace_admin_accounts ?? authState.session?.role === "owner";
  const [username, setUsername] = useState(staff?.username || "");
  const [email, setEmail] = useState(staff?.email || "");
  const [role, setRole] = useState<"staff" | "admin">(staff?.role || "staff");
  const [password, setPassword] = useState("");
  const [items, setItems] = useState<Access[]>([]);
  const [baseline, setBaseline] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(editor.mode === "access");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const dirty = username !== (staff?.username || "") || email !== (staff?.email || "") || role !== (staff?.role || "staff") || !!password || (loaded && JSON.stringify(items) !== baseline);
  useEffect(() => {
    if (editor.mode !== "access") return;
    let cancelled = false;
    void api.get<{ items: Access[] }>(endpoints.workspaceStaffGroupAccess(editor.staff.id)).then((result) => {
      if (!cancelled) { setItems(result.items); setBaseline(JSON.stringify(result.items)); setLoaded(true); }
    }).catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : t("common.error")); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, editor, t]);
  async function save() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setFields({});
    try {
      if (editor.mode === "access") await api.put(endpoints.workspaceStaffGroupAccess(editor.staff.id), { group_ids: items.filter((item) => item.assigned).map((item) => item.group_id) });
      else if (editor.mode === "password") await api.post(endpoints.workspaceStaffPassword(editor.staff.id), { password });
      else if (editor.mode === "create") await api.post(endpoints.workspaceStaff(), { username, email, role: canManageAdmins ? role : "staff", password });
      else await api.patch(endpoints.workspaceStaffAccount(editor.staff.id), { username, email, ...(canManageAdmins ? { role } : {}) });
      onSaved();
    } catch (caught) {
      if (caught instanceof ApiError) setFields(fieldErrorsFromBody(caught.data));
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally { inFlight.current = false; setBusy(false); }
  }
  const title = t(editor.mode === "access" ? "staff.groupAccess" : editor.mode === "password" ? "staff.resetPassword" : editor.mode === "create" ? "staff.create" : "staff.edit");
  return <ManagementSheet title={title} onClose={onClose} dirty={dirty} busy={busy}>
    <Alert message={error} />
    {editor.mode === "access" ? <>
      <Text style={styles.meta}>{t("staff.accessHint")}</Text><SearchField value={search} onChangeText={setSearch} placeholder={t("staff.searchGroups")} />
      {loading ? <LoadingState label={t("common.loading")} /> : items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())).map((item) => <View key={item.group_id} style={styles.heading}><View style={styles.copy}><Text style={styles.name}>{item.name}</Text><Text style={styles.meta}>{t(item.group_type === "structured" ? "groups.structured" : "groups.standard")}</Text></View><Switch accessibilityLabel={item.name} disabled={busy} value={item.assigned} trackColor={{ true: colors.blue }} onValueChange={(assigned) => setItems((current) => current.map((row) => row.group_id === item.group_id ? { ...row, assigned } : row))} /></View>)}
    </> : <>
      {editor.mode !== "password" ? <>
        <Field label={t("auth.username")} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} error={fields.username} />
        <Field label={t("auth.email")} hint={t("staff.emailHint")} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} error={fields.email} />
        {canManageAdmins ? <SegmentedControl accessibilityLabel={t("staff.role")} value={role} onChange={setRole} options={[{ value: "staff", label: t("nav.staff") }, { value: "admin", label: t("staff.admin") }]} /> : null}
      </> : <Text style={styles.meta}>{t("staff.passwordHint")}</Text>}
      {editor.mode !== "edit" ? <Field label={t("security.newPassword")} value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" autoCapitalize="none" error={fields.password} /> : null}
    </>}
    <Button label={t(editor.mode === "create" ? "staff.create" : editor.mode === "access" ? "staff.saveAccess" : editor.mode === "password" ? "staff.resetPassword" : "common.save")} loading={busy} disabled={loading || (editor.mode === "access" && !loaded)} onPress={() => void save()} />
  </ManagementSheet>;
}

function hasLimit(limits: Record<string, number | null> | undefined, key: string) {
  return Boolean(limits && Object.prototype.hasOwnProperty.call(limits, key));
}

const styles = StyleSheet.create({
  screen: { padding: 0 },
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg, width: "100%", maxWidth: 900, alignSelf: "center" },
  workspaceIdCard: { borderRadius: 12, backgroundColor: colors.blueSoft, padding: space.md },
  workspaceIdLabel: { ...type.captionStrong, color: colors.textSecondary },
  workspaceId: { ...type.title, color: colors.bluePressed, letterSpacing: 1.2, marginVertical: space.xs },
  usage: { gap: space.md },
  accountGroups: { gap: space.xl },
  accountSection: { gap: space.sm },
  sectionLabel: { ...type.eyebrow, color: colors.textSecondary },
  account: { paddingVertical: space.sm },
  accountBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: space.md, paddingTop: space.lg },
  heading: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  copy: { flex: 1 },
  name: { ...type.bodyStrong, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted },
  actions: { gap: space.sm, marginTop: space.lg },
});
