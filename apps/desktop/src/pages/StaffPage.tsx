import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { canManageStaffAccounts, hasPlanFeature } from "@checkstation/domain";
import { Alert, Badge, Button, Card, Field, Input, Loading, Modal, Page, Segmented, Switch, formatError } from "../components/ui";
import { useApp } from "../lib/AppProvider";
import { memberUsageMetrics } from "../lib/members";

type Staff = { id: number; username: string; email?: string; role: "staff" | "admin"; status: "active" | "inactive"; is_plan_locked?: boolean; group_access?: Array<{ group_id: number; name: string }> };
type Access = { group_id: number; name: string; group_type: string; assigned: boolean };
type Editor = { mode: "create" } | { mode: "edit" | "password" | "access"; staff: Staff };

export function StaffPage() {
  const { api, authState, t } = useApp(); const allowed = canManageStaffAccounts(authState.session) && hasPlanFeature(authState.session, "staff_management"); const [rows, setRows] = useState<Staff[]>([]); const [search, setSearch] = useState(""); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [editor, setEditor] = useState<Editor | null>(null); const [copied, setCopied] = useState(false);
  const load = useCallback(async () => { if (!allowed) return; setLoading(true); setError(""); try { const data = await api.get<Staff[] | { results: Staff[] }>(endpoints.workspaceStaff()); setRows(Array.isArray(data) ? data : data.results || []); } catch (caught) { setError(formatError(caught, t("common.error"))); } finally { setLoading(false); } }, [allowed, api, t]);
  useEffect(() => { void load(); }, [load]);
  async function lifecycle(staff: Staff, remove = false) { const copy = t(remove ? "staff.deleteConfirm" : "staff.statusConfirm", { name: staff.username }); if (!confirm(copy)) return; setBusy(true); setError(""); try { if (remove) await api.delete(endpoints.workspaceStaffAccount(staff.id)); else await api.patch(endpoints.workspaceStaffAccount(staff.id), { status: staff.status === "active" ? "inactive" : "active" }); await load(); } catch (caught) { setError(formatError(caught, t("common.error"))); } finally { setBusy(false); } }
  if (!allowed) return <Page><Alert tone="warning">{t("staff.planRequired")}</Alert></Page>;
  const entitlements = authState.session?.workspace?.entitlements;
  const adminUsage = memberUsageMetrics(entitlements?.usage_totals?.workspace_admins ?? entitlements?.usage?.workspace_admins, entitlements?.limits?.workspace_admins, { unlimited: false });
  const staffUsage = memberUsageMetrics(entitlements?.usage_totals?.workspace_staff ?? entitlements?.usage?.workspace_staff, entitlements?.limits?.workspace_staff, { unlimited: false });
  const workspaceId = String(authState.session?.workspace?.workspace_id || "");
  const visible = rows.filter((row) => `${row.username} ${row.email || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const groups = [
    { key: "active-admins", title: t("staff.activeAdmins"), rows: visible.filter((row) => row.status === "active" && row.role === "admin") },
    { key: "active-staff", title: t("staff.activeStaff"), rows: visible.filter((row) => row.status === "active" && row.role === "staff") },
    { key: "inactive-admins", title: t("staff.inactiveAdmins"), rows: visible.filter((row) => row.status === "inactive" && row.role === "admin") },
    { key: "inactive-staff", title: t("staff.inactiveStaff"), rows: visible.filter((row) => row.status === "inactive" && row.role === "staff") },
  ];
  async function copyWorkspaceId() { if (!workspaceId) return; try { await navigator.clipboard.writeText(workspaceId); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { setError(t("staff.copyFailed")); } }
  return <Page>
    <div className="staff-controls-head">
      <div className="staff-usage" aria-label={t("staff.usageLabel")}>
        <UsageMeter label={t("staff.admins")} usage={adminUsage} t={t} />
        <UsageMeter label={t("nav.staff")} usage={staffUsage} t={t} />
      </div>
      <Button onClick={() => setEditor({ mode: "create" })}>{t("staff.create")}</Button>
    </div>
    <section className="staff-workspace-id-card">
      <div><span>{t("staff.workspaceId")}</span><strong>{workspaceId || "—"}</strong><p>{t("staff.workspaceIdHint")}</p></div>
      <Button variant="secondary" disabled={!workspaceId} onClick={() => void copyWorkspaceId()}>{copied ? t("staff.copied") : t("staff.copyId")}</Button>
    </section>
    <div className="staff-search"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("staff.search")} /></div>
    <Alert>{error}</Alert>
    {loading ? <Loading label={t("staff.loading")} /> : <div className="staff-account-groups">
      <div className="staff-status-group"><h2>{t("staff.activeAccounts")}</h2>{groups.slice(0, 2).map((group) => <StaffSection key={group.key} title={group.title} rows={group.rows} busy={busy} t={t} onEdit={(staff) => setEditor({ mode: "edit", staff })} onAccess={(staff) => setEditor({ mode: "access", staff })} onPassword={(staff) => setEditor({ mode: "password", staff })} onLifecycle={lifecycle} />)}</div>
      <div className="staff-status-group"><h2>{t("staff.inactiveAccounts")}</h2>{groups.slice(2).map((group) => <StaffSection key={group.key} title={group.title} rows={group.rows} busy={busy} t={t} onEdit={(staff) => setEditor({ mode: "edit", staff })} onAccess={(staff) => setEditor({ mode: "access", staff })} onPassword={(staff) => setEditor({ mode: "password", staff })} onLifecycle={lifecycle} />)}</div>
    </div>}
    {editor ? <StaffEditor editor={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void load(); }} /> : null}
  </Page>;
}

type Translator = (key: string, values?: Record<string, string | number>) => string;
type Usage = ReturnType<typeof memberUsageMetrics>;

function UsageMeter({ label, usage, t }: { label: string; usage: Usage; t: Translator }) {
  if (!usage || usage.remaining === null || usage.percentage === null) return null;
  return <div className="staff-usage-item"><div className="staff-usage-copy"><strong>{label}</strong><span>{t("staff.usageSummary", { count: usage.count, remaining: usage.remaining })}</span></div><div className="staff-usage-progress" role="progressbar" aria-label={t("staff.usageProgress", { type: label })} aria-valuemin={0} aria-valuemax={usage.limit || 0} aria-valuenow={usage.count}><span style={{ width: `${usage.percentage}%` }} /></div></div>;
}

function StaffSection({ title, rows, busy, t, onEdit, onAccess, onPassword, onLifecycle }: { title: string; rows: Staff[]; busy: boolean; t: Translator; onEdit: (staff: Staff) => void; onAccess: (staff: Staff) => void; onPassword: (staff: Staff) => void; onLifecycle: (staff: Staff, remove?: boolean) => Promise<void> }) {
  return <section className="staff-role-section"><header><h3>{title}</h3><span>{rows.length}</span></header>{rows.length ? <div className="staff-account-list">{rows.map((staff) => <StaffAccount key={staff.id} staff={staff} busy={busy} t={t} onEdit={onEdit} onAccess={onAccess} onPassword={onPassword} onLifecycle={onLifecycle} />)}</div> : <div className="staff-section-empty">{t("staff.emptySection")}</div>}</section>;
}

function StaffAccount({ staff, busy, t, onEdit, onAccess, onPassword, onLifecycle }: { staff: Staff; busy: boolean; t: Translator; onEdit: (staff: Staff) => void; onAccess: (staff: Staff) => void; onPassword: (staff: Staff) => void; onLifecycle: (staff: Staff, remove?: boolean) => Promise<void> }) {
  const groupAccess = staff.group_access || []; const shownGroups = groupAccess.slice(0, 3); const remaining = Math.max(0, groupAccess.length - shownGroups.length);
  return <article className="staff-account-card"><div className="staff-account-identity"><strong>{staff.username}</strong><div className="staff-account-badges"><Badge tone="blue">{staff.role === "admin" ? t("staff.admin") : t("nav.staff")}</Badge><Badge tone={staff.status === "active" ? "green" : "neutral"}>{staff.status === "active" ? t("members.active") : t("staff.inactive")}</Badge>{staff.is_plan_locked ? <Badge tone="warning">{t("members.planLocked")}</Badge> : null}</div><span>{staff.email || t("staff.noEmail")}</span></div>{staff.role === "staff" ? <div className="staff-account-access"><small>{t("staff.groupAccess")}</small>{shownGroups.length ? <div>{shownGroups.map((group) => <span className="staff-access-chip" key={group.group_id}>{group.name}</span>)}{remaining ? <span className="staff-access-more">{t("staff.moreGroups", { count: remaining })}</span> : null}</div> : <span>{t("staff.noGroupAccess")}</span>}</div> : <div className="staff-account-access is-admin"><small>{t("staff.groupAccess")}</small><span>{t("staff.adminAccess")}</span></div>}<div className="staff-account-actions"><Button className="button-sm" variant="secondary" onClick={() => onEdit(staff)}>{t("staff.edit")}</Button>{staff.role === "staff" ? <Button className="button-sm" variant="secondary" onClick={() => onAccess(staff)}>{t("staff.groupAccess")}</Button> : null}<Button className="button-sm" variant="secondary" onClick={() => onPassword(staff)}>{t("staff.resetPassword")}</Button><Button className="button-sm" variant={staff.status === "active" ? "secondary" : "primary"} disabled={busy || staff.is_plan_locked} onClick={() => void onLifecycle(staff)}>{t(staff.status === "active" ? "staff.deactivate" : "staff.activate")}</Button>{staff.status === "inactive" ? <Button className="button-sm" variant="danger" disabled={busy} onClick={() => void onLifecycle(staff, true)}>{t("staff.delete")}</Button> : null}</div></article>;
}

function StaffEditor({ editor, onClose, onSaved }: { editor: Editor; onClose: () => void; onSaved: () => void }) {
  const { api, authState, t } = useApp(); const staff = "staff" in editor ? editor.staff : undefined; const canAdmins = authState.session?.capabilities?.can_manage_workspace_admin_accounts ?? authState.session?.role === "owner"; const [username, setUsername] = useState(staff?.username || ""); const [email, setEmail] = useState(staff?.email || ""); const [role, setRole] = useState<"staff" | "admin">(staff?.role || "staff"); const [password, setPassword] = useState(""); const [access, setAccess] = useState<Access[]>([]); const [search, setSearch] = useState(""); const [loading, setLoading] = useState(editor.mode === "access"); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => { if (editor.mode !== "access") return; void api.get<{ items: Access[] }>(endpoints.workspaceStaffGroupAccess(editor.staff.id)).then((data) => setAccess(data.items || [])).catch((caught) => setError(formatError(caught, t("common.error")))).finally(() => setLoading(false)); }, [api, editor, t]);
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); setFields({}); try { if (editor.mode === "access") await api.put(endpoints.workspaceStaffGroupAccess(editor.staff.id), { group_ids: access.filter((x) => x.assigned).map((x) => x.group_id) }); else if (editor.mode === "password") await api.post(endpoints.workspaceStaffPassword(editor.staff.id), { password }); else if (editor.mode === "create") await api.post(endpoints.workspaceStaff(), { username, email, role: canAdmins ? role : "staff", password }); else await api.patch(endpoints.workspaceStaffAccount(editor.staff.id), { username, email, ...(canAdmins ? { role } : {}) }); onSaved(); } catch (caught) { if (caught instanceof ApiError) setFields(fieldErrorsFromBody(caught.data)); setError(formatError(caught, t("common.error"))); } finally { setBusy(false); } }
  const title = t(editor.mode === "create" ? "staff.create" : editor.mode === "edit" ? "staff.edit" : editor.mode === "access" ? "staff.groupAccess" : "staff.resetPassword");
  const filtered = access.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
  return <Modal title={title} onClose={onClose} actions={<><Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" form="staff-editor" loading={busy} disabled={loading}>{t(editor.mode === "create" ? "staff.create" : editor.mode === "access" ? "staff.saveAccess" : editor.mode === "password" ? "staff.resetPassword" : "common.save")}</Button></>}><form id="staff-editor" className="form" onSubmit={save}><Alert>{error}</Alert>{editor.mode === "access" ? <><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("staff.searchGroups")} />{loading ? <Loading label={t("common.loading")} /> : <div className="data-list">{filtered.map((item) => <div className="setting-row access-row" key={item.group_id}><div className="setting-copy"><strong>{item.name}</strong><span>{t(item.group_type === "structured" ? "groups.structured" : "groups.standard")}</span></div><Switch label={item.name} checked={item.assigned} onChange={(assigned) => setAccess((current) => current.map((row) => row.group_id === item.group_id ? { ...row, assigned } : row))} /></div>)}</div>}</> : editor.mode === "password" ? <><p className="muted-copy">{t("staff.passwordHint")}</p><Field label={t("security.newPassword")} error={fields.password}><Input autoFocus required type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field></> : <><Field label={t("auth.username")} error={fields.username}><Input required value={username} onChange={(e) => setUsername(e.target.value)} /></Field><Field label={t("auth.email")} hint={t("staff.emailHint")} error={fields.email}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>{canAdmins ? <Field label={t("staff.role")}><Segmented value={role} onChange={setRole} options={[{ value: "staff", label: t("nav.staff") }, { value: "admin", label: t("staff.admin") }]} /></Field> : null}{editor.mode === "create" ? <Field label={t("security.newPassword")} error={fields.password}><Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field> : null}</>}</form></Modal>;
}
