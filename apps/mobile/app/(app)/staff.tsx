import { useCallback, useEffect, useRef, useState } from "react";
import { Redirect, useFocusEffect } from "expo-router";
import { Alert as NativeAlert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from "react-native";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { canAccessStaffManagement, canManageStaffAccounts, memberUsageMetrics } from "@checkstation/domain";
import { Alert, Button, Field, LoadingState, Screen, SegmentedControl } from "../../src/components/ui";
import { AddButton, PageHeader, SearchField, StatusPill } from "../../src/components/mobile";
import { CapacityMeter } from "../../src/components/CapacityMeter";
import { ManagementSheet } from "../../src/components/ManagementSheet";
import { useApp } from "../../src/lib/AppProvider";
import { colors, space, type } from "../../src/theme/tokens";

type Staff = { id: number; username: string; email: string; role: "staff" | "admin"; status: "active" | "inactive"; is_plan_locked?: boolean; group_access?: Array<{ group_id: number; name: string }> };
type Access = { group_id: number; name: string; group_type: string; assigned: boolean };
type Editor = { mode: "create" } | { mode: "edit" | "password" | "access"; staff: Staff };

export default function StaffScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 700;
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
    { status: "active", role: "admin", title: t("staff.activeAdmins") },
    { status: "active", role: "staff", title: t("staff.activeStaff") },
    { status: "inactive", role: "admin", title: t("staff.inactiveAdmins") },
    { status: "inactive", role: "staff", title: t("staff.inactiveStaff") },
  ] as const).map((section) => ({
    ...section,
    rows: filtered.filter((row) => row.status === section.status && row.role === section.role),
  }));
  return <Screen style={styles.screen}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}>
      <PageHeader title={t("nav.staff")} description={t("staff.description")} action={<AddButton label={t("staff.create")} onPress={() => setEditor({ mode: "create" })} />} />
      {session?.workspace?.workspace_id ? <View>
        <View style={styles.workspaceIdCard}>
          <View style={styles.copy}>
            <Text style={styles.workspaceIdLabel}>{t("staff.workspaceId")}</Text>
            <Text selectable style={styles.workspaceId}>{session.workspace.workspace_id}</Text>
            <Text style={styles.meta}>{t("staff.workspaceIdHint")}</Text>
          </View>
        </View>
      </View> : null}
      {adminUsage || staffUsage ? <View accessibilityLabel={t("staff.usageLabel")} style={styles.usage}>
        {adminUsage ? <View style={wide ? styles.usageHalf : styles.usageFull}><CapacityMeter
          count={adminUsage.count}
          label={t("staff.admins")}
          limit={adminUsage.limit}
          remainingLabel={adminUsage.remaining == null ? undefined : t("staff.usageSummary", { count: adminUsage.count, remaining: adminUsage.remaining })}
          unlimitedLabel={t("members.unlimited")}
        /></View> : null}
        {staffUsage ? <View style={wide ? styles.usageHalf : styles.usageFull}><CapacityMeter
          count={staffUsage.count}
          label={t("nav.staff")}
          limit={staffUsage.limit}
          remainingLabel={staffUsage.remaining == null ? undefined : t("staff.usageSummary", { count: staffUsage.count, remaining: staffUsage.remaining })}
          unlimitedLabel={t("members.unlimited")}
        /></View> : null}
      </View> : null}
      <SearchField value={search} onChangeText={setSearch} placeholder={t("staff.search")} />
      <Alert message={error} />
      {loading && !rows.length ? <LoadingState label={t("staff.loading")} /> : null}
      {!loading && !filtered.length ? <Text style={styles.meta}>{t("staff.emptyTitle")}</Text> : null}
      {!loading && filtered.length ? <View style={styles.accountGroups}>{sections.filter((section) => section.rows.length > 0).map((section) => <View key={`${section.status}-${section.role}`} style={styles.accountSection}>
        <Text accessibilityRole="header" style={styles.sectionLabel}>{section.title} ({section.rows.length})</Text>
        <View style={styles.accountGrid}>
          {section.rows.map((staff) => <View key={staff.id} style={[styles.account, wide && styles.accountHalf]}>
            <View style={styles.accountIdentity}><Text style={styles.name}>{staff.username}</Text><Text style={styles.meta}>{staff.email || t("staff.noEmail")}</Text></View>
            <View style={styles.badges}>
              <StatusPill label={t(staff.role === "admin" ? "staff.admin" : "nav.staff")} tone="blue" />
              <StatusPill label={t(staff.status === "active" ? "members.active" : "staff.inactive")} tone={staff.status === "active" ? "green" : "neutral"} />
              {staff.is_plan_locked ? <StatusPill label={t("members.planLocked")} tone="warning" /> : null}
            </View>
            {staff.role === "staff" ? <View style={styles.badges}>
              {staff.group_access?.length ? <>
                {staff.group_access.slice(0, 2).map((group) => <Text key={group.group_id} numberOfLines={1} style={styles.groupChip}>{group.name}</Text>)}
                {staff.group_access.length > 2 ? <Text style={styles.meta}>{t("staff.moreGroups", { count: staff.group_access.length - 2 })}</Text> : null}
              </> : <Text style={styles.meta}>{t("staff.noGroupAccess")}</Text>}
            </View> : null}
            <View style={styles.actions}>
              <AccountAction disabled={busy} label={t("staff.edit")} onPress={() => setEditor({ mode: "edit", staff })} />
              {staff.role === "staff" ? <AccountAction disabled={busy} label={t("staff.groupAccess")} onPress={() => setEditor({ mode: "access", staff })} /> : null}
              <AccountAction disabled={busy} label={t("staff.resetPassword")} onPress={() => setEditor({ mode: "password", staff })} />
              <AccountAction disabled={busy} emphasis={staff.status === "inactive" ? "positive" : undefined} label={t(staff.status === "active" ? "staff.deactivate" : "staff.activate")} onPress={() => confirm(staff)} />
              {staff.status === "inactive" ? <AccountAction disabled={busy} emphasis="danger" label={t("staff.delete")} onPress={() => confirm(staff, true)} /> : null}
            </View>
          </View>)}
        </View>
      </View>)}</View> : null}
    </ScrollView>
    {editor ? <StaffEditor editor={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void load(); }} /> : null}
  </Screen>;
}

function AccountAction({ label, onPress, disabled, emphasis }: { label: string; onPress: () => void; disabled: boolean; emphasis?: "positive" | "danger" }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.actionButton, emphasis === "positive" && styles.actionPositive, emphasis === "danger" && styles.actionDanger, pressed && !disabled && { backgroundColor: colors.surfaceSubtle }, disabled && { opacity: 0.5 }]}>
    <Text style={[styles.actionLabel, emphasis === "positive" && { color: colors.primary }, emphasis === "danger" && { color: colors.dangerText }]}>{label}</Text>
  </Pressable>;
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
  usage: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  usageHalf: { flex: 1, minWidth: 0 },
  usageFull: { width: "100%" },
  accountGroups: { gap: space.lg },
  accountSection: { gap: space.sm },
  sectionLabel: { ...type.bodyStrong, color: colors.textSecondary },
  accountGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: space.md, alignItems: "flex-start" },
  account: { width: "100%", padding: space.md, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: space.sm },
  accountHalf: { width: "48%" },
  accountIdentity: { gap: space.xs },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  groupChip: { ...type.caption, color: colors.textSecondary, backgroundColor: colors.surfaceSubtle, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: 8, maxWidth: "100%", flexShrink: 1 },
  heading: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  copy: { flex: 1 },
  name: { ...type.bodyStrong, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  actionButton: { minHeight: 44, maxWidth: "100%", flexShrink: 1, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, justifyContent: "center", alignItems: "center", backgroundColor: colors.surface },
  actionLabel: { ...type.captionStrong, color: colors.textSecondary, textAlign: "center" },
  actionPositive: { borderColor: colors.blue, backgroundColor: colors.primarySoft },
  actionDanger: { borderColor: colors.dangerBorder, backgroundColor: colors.dangerSoft },
});
