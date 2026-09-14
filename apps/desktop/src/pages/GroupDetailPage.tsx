import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { canLaunchKiosk, canManageGroupConfiguration, groupSetupIssueSummary, hasPlanFeature, isGroupScopedStaff } from "@checkstation/domain";
import { Alert, Badge, Button, Card, DataRow, Empty, Field, Input, Loading, Modal, Page, PageHeader, Segmented, Select, Stat, Switch, TextArea, formatError } from "../components/ui";
import { useApp } from "../lib/AppProvider";
import { useForegroundRefresh } from "../lib/useForegroundRefresh";
import { useDesktopGuidedGroupTab } from "../tutorials/DesktopGuidedHelp";
import { GroupClassesPanel } from "../components/GroupClassesPanel";
import { EMPTY_EMAIL_SENDER, SAVED_SENDERS_PICKER, applySavedSenderImport, blankSenderForm, buildGroupSenderSaveBody, buildSavedSenderCreateBody, isSavedSenderNameConflict, normalizeForwardEmailSlots, retainGroupDraftAfterTemplateDelete, savedForwardEmails, savedSenderDisplayAddress, savedSendersFromList, senderCredentialIsConfigured, senderDraftRequiresTest, senderFormFromApi, senderFromNameOnlyChange, type EmailSenderProvider, type GroupEmailSender, type GroupEmailSenderForm, type SavedEmailSender, type SmtpSecurity } from "../lib/groupEmailSender";
import { MAX_PARTICIPATION_EMAILS, addParticipationEmailSlot, memberParticipationPayload, participationEmailsForNewMember, removeParticipationEmailSlot, visitorParticipationPayload, type AvailableGroupMember } from "../lib/groupParticipantForm";
import { isKioskLaunchBlocked, kioskSettingsReadiness, type GroupLaunchReadiness, type KioskSettingsReadiness } from "../lib/kioskLaunchReadiness";
import { isPlanResourceLocked } from "../lib/planCapacity";

type NotificationSetting = { send_email: boolean; email_template: string };
type GroupNotifications = { check_in: NotificationSetting; check_out: NotificationSetting; break: NotificationSetting };
type Group = { id: number; name: string; status: string; group_type: string; participant_count: number; member_count: number; group_only_participant_count: number; section_count?: number; is_plan_locked: boolean; actions: { check_in_enabled: boolean; check_out_enabled: boolean; breaks_enabled: boolean; max_breaks: number | null }; participation: { email_required: boolean; pin_required: boolean }; notifications?: Partial<GroupNotifications>; advanced?: { email_sender?: Partial<GroupEmailSender>; email_sender_ready?: boolean; forward_emails?: string[] }; forward_emails: string[]; readiness?: GroupLaunchReadiness; };
type Participant = { id: number; group_participant_code?: string; member?: { name: string; email?: string }; name?: string; email?: string; effective?: { name?: string; email?: string }; overrides?: { name?: string; email?: string }; participation?: { emails?: string[]; has_pin?: boolean }; participation_emails?: string[]; _kind?: "member" | "visitor" };
type ClassRow = { id: number; name: string; participant_count?: number; status: string };
type Tab = "overview" | "participants" | "configuration" | "kiosk";

export function GroupDetailPage() {
  const guidedTab = useDesktopGuidedGroupTab();
  const { id } = useParams(); const { api, authState, t } = useApp(); const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [planLockedDenied, setPlanLockedDenied] = useState(false); const [tab, setTab] = useState<Tab>("overview");
  const [configurationDirty, setConfigurationDirty] = useState(false); const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [setupKioskReadiness, setSetupKioskReadiness] = useState<KioskSettingsReadiness | null>(null);
  const canConfigure = canManageGroupConfiguration(authState.session); const canParticipants = canConfigure || isGroupScopedStaff(authState.session);
  const load = useCallback(async () => { if (!id) return; setLoading(true); setError(""); setPlanLockedDenied(false); try { setGroup(await api.get<Group>(endpoints.group(id))); } catch (caught) { setGroup(null); if (isPlanResourceLocked(caught)) setPlanLockedDenied(true); else setError(formatError(caught, t("common.error"))); } finally { setLoading(false); } }, [api, id, t]);
  useEffect(() => { void load(); }, [load]);
  const refreshSetup = useCallback(async () => {
    if (!id) return;
    try {
      const latest = await api.get<Group>(endpoints.group(id));
      setGroup(latest);
      setSetupKioskReadiness(canConfigure && !latest.is_plan_locked && latest.status !== "archived"
        ? kioskSettingsReadiness(await api.get(endpoints.kioskSettings(id)).catch(() => null)) : null);
    } catch { /* Preserve the current page and its existing errors/forms. */ }
  }, [api, id, canConfigure]);
  useEffect(() => { void refreshSetup(); }, [refreshSetup, tab, guidedTab, loading]);
  useForegroundRefresh(refreshSetup);
  if (loading) return <Page><Loading label={t("groups.loading")} /></Page>;
  if (planLockedDenied) return <Page><section className="plan-locked-banner" role="alert"><Badge tone="warning">{t("groups.planLocked")}</Badge><strong>{t("groups.detail.planLockedTitle")}</strong><p>{t("groups.detail.planLockedHint")}</p><Button onClick={() => navigate("/groups")} variant="secondary">{t("groups.back")}</Button></section></Page>;
  if (!group || !id) return <Page><Alert>{error || t("common.error")}</Alert></Page>;
  const currentGroup = group; const groupId = id;
  const setupSummary = !group.is_plan_locked && group.status !== "archived" ? groupSetupIssueSummary(group.readiness, setupKioskReadiness, t) : "";
  const tabs: Array<{ value: Tab; label: string }> = [{ value: "overview", label: t("groups.overview") }, { value: "participants", label: t("groups.participantLabel") }];
  if (canConfigure && !group.is_plan_locked) tabs.push({ value: "configuration", label: t("groups.configuration") });
  if (!group.is_plan_locked && group.status !== "archived") tabs.push({ value: "kiosk", label: t("kiosk.title") });
  const displayedTab = tabs.some(item => item.value === guidedTab) ? guidedTab as Tab : tab;
  function leaveConfiguration(next: () => void) { if (tab === "configuration" && configurationDirty && !confirm(t("groups.configurationUnsaved"))) return; next(); }
  async function lifecycle() { if (!confirm(t(currentGroup.status === "archived" ? "groups.restoreHint" : "groups.archiveConfirm"))) return; setLifecycleBusy(true); setError(""); try { await api.post(currentGroup.status === "archived" ? endpoints.groupRestore(groupId) : endpoints.groupArchive(groupId), {}); setConfigurationDirty(false); await load(); } catch (caught) { setError(formatError(caught, t("common.error"))); } finally { setLifecycleBusy(false); } }
  return <Page>
    <PageHeader eyebrow={t(group.group_type === "structured" ? "groups.structured" : "groups.standard")} title={group.name} actions={<>{tab === "configuration" && canConfigure ? <Button variant="danger" loading={lifecycleBusy} onClick={() => void lifecycle()}>{t(group.status === "archived" ? "groups.reactivate" : "groups.archive")}</Button> : null}<Button variant="secondary" onClick={() => leaveConfiguration(() => navigate("/groups"))}>{t("groups.back")}</Button></>} />
    <div className="toolbar"><Badge tone={group.status === "archived" ? "neutral" : "green"}>{t(group.status === "archived" ? "groups.archivedLabel" : "groups.activeLabel")}</Badge>{group.is_plan_locked ? <Badge tone="warning">{t("groups.planLocked")}</Badge> : null}{(group.readiness && !group.readiness.setup_complete) || setupSummary ? <Badge tone="warning">{t("groups.setupIncomplete")}</Badge> : null}</div>
    {setupSummary ? <section className="group-setup-summary" role="status">{setupSummary}</section> : null}
    <Segmented value={displayedTab} onChange={(next) => leaveConfiguration(() => setTab(next))} options={tabs} /><Alert>{error}</Alert>
    {displayedTab === "overview" ? <Overview group={group} /> : null}
    {displayedTab === "participants" ? <Participants group={group} groupId={id} onReadinessChange={refreshSetup} canManage={canParticipants && !group.is_plan_locked && group.status !== "archived"} /> : null}
    {displayedTab === "configuration" ? <Configuration group={group} groupId={id} onDirtyChange={setConfigurationDirty} onSaved={load} /> : null}
    {displayedTab === "kiosk" ? <KioskManagement group={group} groupId={id} canConfigure={canConfigure} canLaunch={canLaunchKiosk(authState.session)} /> : null}
  </Page>;
}

function Overview({ group }: { group: Group }) {
  const { t } = useApp();
  return <><div className="stats"><Stat label={t("groups.participantLabel")} value={group.participant_count || 0} /><Stat label={t("members.title")} value={group.member_count || 0} tone="cyan" /><Stat label={group.group_type === "structured" ? t("groups.classes") : t("groups.visitors")} value={group.group_type === "structured" ? group.section_count || 0 : group.group_only_participant_count || 0} tone="green" /></div><div className="card-grid"><Card title={t("groups.actions")}><Summary label={t("kiosk.checkIn")} active={group.actions?.check_in_enabled} /><Summary label={t("kiosk.checkOut")} active={group.actions?.check_out_enabled} /><Summary label={t("kiosk.breaks")} active={group.actions?.breaks_enabled} /></Card><Card title={t("groups.participation")}><Summary label={t("groups.requireEmail")} active={group.participation?.email_required} /><Summary label={t("groups.requirePin")} active={group.participation?.pin_required} /></Card></div></>;
}
function Summary({ label, active }: { label: string; active?: boolean }) { const { t } = useApp(); return <div className="setting-row"><strong>{label}</strong><Badge tone={active ? "green" : "neutral"}>{t(active ? "security.enabled" : "security.notEnabled")}</Badge></div>; }
function Toggle({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) { return <div className={`setting-row${disabled ? " is-disabled" : ""}`}><strong>{label}</strong><Switch checked={checked} disabled={disabled} onChange={onChange} label={label} /></div>; }

function Participants({ group, groupId, canManage, onReadinessChange }: { group: Group; groupId: string; canManage: boolean; onReadinessChange: () => Promise<void> }) {
  const { api, t } = useApp(); const [rows, setRows] = useState<Participant[]>([]); const [classes, setClasses] = useState<ClassRow[]>([]); const [selectedClass, setSelectedClass] = useState(""); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [adding, setAdding] = useState(false); const [editing, setEditing] = useState<Participant | null>(null); const [busy, setBusy] = useState(false);
  const scoped = selectedClass ? `${groupId}/classes/${selectedClass}` : groupId;
  const load = useCallback(async (silent = false) => { if (!silent) setLoading(true); setError(""); try { if (group.group_type === "structured" && !selectedClass) { const data = await api.get<ClassRow[] | { results: ClassRow[] }>(endpoints.groupClasses(groupId)); setClasses(Array.isArray(data) ? data : data.results || []); setRows([]); } else { const [members, visitors] = await Promise.all([api.get<Participant[]>(endpoints.groupMemberships(scoped)), api.get<Participant[]>(endpoints.groupParticipants(scoped))]); setRows([...members.map((x) => ({ ...x, _kind: "member" as const })), ...visitors.map((x) => ({ ...x, _kind: "visitor" as const }))]); } void onReadinessChange(); } catch (caught) { setError(formatError(caught, t("common.error"))); } finally { if (!silent) setLoading(false); } }, [api, group.group_type, groupId, scoped, selectedClass, t, onReadinessChange]);
  useEffect(() => { void load(); }, [load]);
  useForegroundRefresh(async () => { if (!loading) await load(true); });
  async function remove(participant: Participant) { const name = participant.effective?.name || participant.member?.name || participant.name || ""; if (!confirm(t("groups.removeParticipantConfirm", { name }))) return; setBusy(true); setError(""); try { const path = participant._kind === "member" ? endpoints.groupMembership(scoped, participant.id) : endpoints.groupParticipant(scoped, participant.id); await api.delete(path); await load(); } catch (caught) { setError(formatError(caught, t("common.error"))); } finally { setBusy(false); } }
  if (group.group_type === "structured" && !selectedClass) return <GroupClassesPanel groupId={groupId} canManage={canManage} onSelect={(section) => { setClasses([section]); setSelectedClass(String(section.id)); }} />;
  return <><Card title={selectedClass ? classes.find((x) => String(x.id) === selectedClass)?.name || t("groups.participantLabel") : t("groups.participantLabel")}><div className="toolbar">{selectedClass ? <Button variant="secondary" onClick={() => { setSelectedClass(""); setRows([]); }}>{t("classes.back")}</Button> : null}{canManage ? <Button onClick={() => setAdding(true)}>{t("groups.addParticipant")}</Button> : null}</div><Alert>{error}</Alert>{loading ? <Loading label={t("common.loading")} /> : rows.length ? <div className="data-list">{rows.map((p) => <DataRow key={`${p._kind}-${p.id}`} title={p.effective?.name || p.member?.name || p.name || "—"} detail={`${p._kind === "visitor" ? t("groups.visitor") : t("members.title")} · ${p.group_participant_code || "—"}`} meta={p.effective?.email || p.member?.email || p.email} actions={canManage ? <><Button className="button-sm" disabled={busy} onClick={() => setEditing(p)} variant="secondary">{t("common.edit")}</Button><Button className="button-sm" disabled={busy} onClick={() => void remove(p)} variant="danger">{t("common.remove")}</Button></> : undefined} />)}</div> : <Empty title={t("groups.noParticipants")} />}</Card>{adding ? <ParticipantCreate group={group} groupId={scoped} onClose={() => setAdding(false)} onSaved={load} /> : null}{editing ? <ParticipantEdit group={group} groupId={scoped} participant={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} /> : null}</>;
}

function ParticipantEdit({ group, groupId, participant, onClose, onSaved }: { group: Group; groupId: string; participant: Participant; onClose: () => void; onSaved: () => void }) {
  const { api, t } = useApp(); const visitor = participant._kind === "visitor"; const [name, setName] = useState(visitor ? participant.name || "" : participant.overrides?.name || ""); const [emails, setEmails] = useState((participant.participation?.emails || participant.participation_emails || []).join(", ")); const [pin, setPin] = useState(""); const [clearPin, setClearPin] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { const body = new FormData(); if (visitor) body.append("name", name.trim()); else body.append("override_name", name.trim()); body.append("participation_emails", JSON.stringify(emails.split(/[\n,]/).map((value) => value.trim()).filter(Boolean))); if (pin) body.append("participation_pin", pin); if (clearPin) body.append("clear_participation_pin", "true"); const path = visitor ? endpoints.groupParticipant(groupId, participant.id) : endpoints.groupMembership(groupId, participant.id); await api.request(path, { method: "PATCH", formData: body }); onSaved(); } catch (caught) { setError(formatError(caught, t("common.error"))); } finally { setBusy(false); } }
  const displayName = participant.effective?.name || participant.member?.name || participant.name || "";
  return <Modal title={t("groups.editParticipant")} onClose={onClose} actions={<><Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button form="participant-edit" loading={busy} type="submit">{t("common.save")}</Button></>}><form className="form" id="participant-edit" onSubmit={submit}><Field label={visitor ? t("members.name") : t("groups.displayNameOverride")} hint={!visitor ? displayName : undefined}><Input required={visitor} value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label={t("groups.participationEmails")} hint={group.participation.email_required ? t("groups.required") : t("groups.forwardEmailsPlaceholder")}><TextArea required={group.participation.email_required} value={emails} onChange={(event) => setEmails(event.target.value)} /></Field><Field label={t("kiosk.pin")} hint={participant.participation?.has_pin ? t("groups.pinChangeHint") : t("groups.optionalPin")}><Input disabled={clearPin} type="password" value={pin} onChange={(event) => setPin(event.target.value)} /></Field>{participant.participation?.has_pin ? <label className="check-row"><span>{t("groups.clearPin")}</span><input checked={clearPin} onChange={(event) => { setClearPin(event.target.checked); if (event.target.checked) setPin(""); }} type="checkbox" /></label> : null}<Alert>{error}</Alert></form></Modal>;
}

function ParticipantCreate({ group, groupId, onClose, onSaved }: { group: Group; groupId: string; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { api, t } = useApp(); const [mode, setMode] = useState<"member" | "visitor">("member"); const [available, setAvailable] = useState<AvailableGroupMember[]>([]); const [availableLoading, setAvailableLoading] = useState(true); const [memberId, setMemberId] = useState(""); const [memberEmails, setMemberEmails] = useState<string[]>([""]); const [memberPin, setMemberPin] = useState(""); const [visitorName, setVisitorName] = useState(""); const [visitorEmails, setVisitorEmails] = useState<string[]>([""]); const [visitorPin, setVisitorPin] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [fields, setFields] = useState<Record<string, string>>({}); const submittingRef = useRef(false); const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const classScoped = groupId.includes("/classes/");
  const clearSuccess = useCallback(() => { if (successTimerRef.current) clearTimeout(successTimerRef.current); successTimerRef.current = null; setSuccess(""); }, []);
  const showSuccess = useCallback(() => { clearSuccess(); setSuccess(t("groups.participantAdded")); successTimerRef.current = setTimeout(() => { setSuccess(""); successTimerRef.current = null; }, 1800); }, [clearSuccess, t]);
  const loadAvailable = useCallback(async () => { setAvailableLoading(true); try { setAvailable(await api.get<AvailableGroupMember[]>(endpoints.groupAvailableMembers(groupId))); } catch (caught) { setError(formatError(caught, t("common.error"))); } finally { setAvailableLoading(false); } }, [api, groupId, t]);
  useEffect(() => { void loadAvailable(); return () => { if (successTimerRef.current) clearTimeout(successTimerRef.current); }; }, [loadAvailable]);
  function selectMember(value: string) { setMemberId(value); const selected = available.find((member) => String(member.id) === value); setMemberEmails(participationEmailsForNewMember(selected)); setMemberPin(""); setFields({}); setError(""); }
  async function submit(event: FormEvent) { event.preventDefault(); if (submittingRef.current) return; submittingRef.current = true; setBusy(true); clearSuccess(); setError(""); setFields({}); try { if (mode === "member") { await api.post(endpoints.groupMemberships(groupId), memberParticipationPayload(Number(memberId), memberEmails, memberPin)); setMemberId(""); setMemberEmails([""]); setMemberPin(""); } else { await api.post(endpoints.groupParticipants(groupId), visitorParticipationPayload(visitorName, visitorEmails, visitorPin)); setVisitorName(""); setVisitorEmails([""]); setVisitorPin(""); } await onSaved(); if (mode === "member") await loadAvailable(); showSuccess(); } catch (caught) { if (caught instanceof ApiError) setFields(fieldErrorsFromBody(caught.data)); setError(formatError(caught, t("common.error"))); } finally { submittingRef.current = false; setBusy(false); } }
  const submitLabel = mode === "member" ? t(classScoped ? "groups.addToClass" : "groups.addToGroup") : t("groups.addVisitor");
  return <Modal title={t("groups.addParticipant")} onClose={onClose} actions={<><Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button disabled={mode === "member" ? !memberId : !visitorName.trim()} loading={busy} type="submit" form="participant-create">{submitLabel}</Button></>}><form id="participant-create" className="participant-create-form" onSubmit={submit}><Segmented value={mode} onChange={(value) => { setMode(value); setFields({}); setError(""); clearSuccess(); }} options={[{ value: "member", label: t("members.title") }, { value: "visitor", label: t("groups.visitor") }]} label={t("groups.addParticipant")} /><Alert tone="success">{success}</Alert><Alert>{error}</Alert>{mode === "member" ? <div className="participant-create-fields"><Field error={fields.member_id} label={t("groups.addExistingMember")}><Select autoFocus required value={memberId} onChange={(event) => selectMember(event.target.value)}><option value="">{availableLoading ? t("groups.availableMembersLoading") : t(available.length ? "groups.selectMember" : "groups.noAvailableMembers")}</option>{available.map((member) => <option key={member.id} value={member.id}>{member.name}{member.email ? ` · ${member.email}` : ""}</option>)}</Select></Field><ParticipantEmailFields emails={memberEmails} error={fields.participation_emails || fields.participation_email} hint={t("groups.memberGroupEmailHint")} required={group.participation.email_required} setEmails={setMemberEmails} t={t} /><Field error={fields.participation_pin || fields.override_pin} label={t("groups.groupPin")} hint={t(group.participation.pin_required ? "groups.groupPinRequired" : "groups.groupPinOptional")}><Input autoComplete="off" required={group.participation.pin_required} type="password" value={memberPin} onChange={(event) => setMemberPin(event.target.value)} /></Field></div> : <div className="participant-create-fields"><Field error={fields.name} label={t("members.name")}><Input autoFocus required value={visitorName} onChange={(event) => setVisitorName(event.target.value)} /></Field><ParticipantEmailFields emails={visitorEmails} error={fields.participation_emails || fields.email} hint={t("groups.visitorGroupEmailHint")} required={group.participation.email_required} setEmails={setVisitorEmails} t={t} /><Field error={fields.participation_pin || fields.pin} label={t("groups.groupPin")} hint={t(group.participation.pin_required ? "groups.groupPinRequired" : "groups.groupPinOptional")}><Input autoComplete="off" required={group.participation.pin_required} type="password" value={visitorPin} onChange={(event) => setVisitorPin(event.target.value)} /></Field></div>}</form></Modal>;
}

function ParticipantEmailFields({ emails, error, hint, required, setEmails, t }: { emails: string[]; error?: string; hint: string; required: boolean; setEmails: (emails: string[]) => void; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const numbered = emails.length > 1;
  function update(index: number, value: string) { setEmails(emails.map((email, itemIndex) => itemIndex === index ? value : email)); }
  return <section className="participant-email-fields"><div className="participant-email-fields-copy"><strong>{t("groups.groupEmails")}</strong><span>{hint}</span></div>{emails.map((email, index) => <Field error={index === 0 ? error : undefined} key={index} label={numbered ? t("groups.groupEmailNumbered", { number: index + 1 }) : t("groups.groupEmail")}><div className="participant-email-row"><Input autoComplete="off" placeholder={t("groups.forwardEmailsPlaceholder")} required={required && index === 0} type="email" value={email} onChange={(event) => update(index, event.target.value)} />{index > 0 ? <Button className="button-sm" type="button" variant="ghost" onClick={() => setEmails(removeParticipationEmailSlot(emails, index))}>{t("common.remove")}</Button> : null}</div></Field>)}<div className="participant-email-actions">{emails.length < MAX_PARTICIPATION_EMAILS ? <Button className="button-sm" type="button" variant="secondary" onClick={() => setEmails(addParticipationEmailSlot(emails))}>{t("groups.addAnotherEmail")}</Button> : null}<span>{t("groups.participantEmailsHint")}</span></div></section>;
}

const DEFAULT_NOTIFICATIONS: GroupNotifications = {
  check_in: { send_email: false, email_template: "{name} checked in at {time}." },
  check_out: { send_email: false, email_template: "{name} checked out at {time}." },
  break: { send_email: false, email_template: "{name} started a break at {time}." },
};

function groupNotifications(group: Group): GroupNotifications {
  return {
    check_in: { ...DEFAULT_NOTIFICATIONS.check_in, ...(group.notifications?.check_in || {}) },
    check_out: { ...DEFAULT_NOTIFICATIONS.check_out, ...(group.notifications?.check_out || {}) },
    break: { ...DEFAULT_NOTIFICATIONS.break, ...(group.notifications?.break || {}) },
  };
}

function mainConfigurationSnapshot(name: string, actions: Group["actions"], participation: Group["participation"], notifications: GroupNotifications, forwardEmails: string[]) {
  return JSON.stringify({ name: name.trim(), actions, participation, notifications, forward_emails: savedForwardEmails(forwardEmails) });
}

function Configuration({ group, groupId, onDirtyChange, onSaved }: { group: Group; groupId: string; onDirtyChange: (dirty: boolean) => void; onSaved: () => Promise<void> }) {
  const { api, authState, t } = useApp();
  const initialNotifications = groupNotifications(group);
  const initialForward = normalizeForwardEmailSlots(group.forward_emails || group.advanced?.forward_emails);
  const [name, setName] = useState(group.name); const [actions, setActions] = useState(group.actions); const [participation, setParticipation] = useState(group.participation); const [notifications, setNotifications] = useState(initialNotifications); const [forwardEmails, setForwardEmails] = useState(initialForward);
  const [mainBaseline, setMainBaseline] = useState(() => mainConfigurationSnapshot(group.name, group.actions, group.participation, initialNotifications, initialForward));
  const [sender, setSender] = useState<GroupEmailSender>({ ...EMPTY_EMAIL_SENDER, ...(group.advanced?.email_sender || {}) }); const [senderForm, setSenderForm] = useState<GroupEmailSenderForm>(() => senderFormFromApi(group.advanced?.email_sender)); const [senderLoading, setSenderLoading] = useState(true); const [senderOpen, setSenderOpen] = useState(false); const [forwardOpen, setForwardOpen] = useState(false); const [draftVerified, setDraftVerified] = useState(false); const [testEmail, setTestEmail] = useState(""); const [showPassword, setShowPassword] = useState(false);
  const [senderPanel, setSenderPanel] = useState<"form" | "saved">("form"); const [savedSenders, setSavedSenders] = useState<SavedEmailSender[]>([]); const [savedSendersLoading, setSavedSendersLoading] = useState(false); const [importedSavedSenderId, setImportedSavedSenderId] = useState<number | null>(null); const [importedPasswordConfigured, setImportedPasswordConfigured] = useState(false); const [templateName, setTemplateName] = useState(""); const [saveTemplateOpen, setSaveTemplateOpen] = useState(false); const [savingTemplate, setSavingTemplate] = useState(false); const [pendingReplace, setPendingReplace] = useState(""); const [pendingDelete, setPendingDelete] = useState<SavedEmailSender | null>(null); const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [busy, setBusy] = useState(false); const [savingSender, setSavingSender] = useState(false); const [testingSender, setTestingSender] = useState(false); const [message, setMessage] = useState(""); const [senderMessage, setSenderMessage] = useState(""); const [error, setError] = useState("");
  const forwardAllowed = hasPlanFeature(authState.session, "group_forward_emails");
  const senderReady = sender.status === "ready";
  const senderNeedsTest = senderDraftRequiresTest(senderForm, sender) || importedSavedSenderId != null;
  const senderNameOnlyChange = senderFromNameOnlyChange(senderForm, sender);
  const senderDirty = senderNeedsTest || senderNameOnlyChange || importedSavedSenderId != null;
  const canSaveSender = senderDirty && (draftVerified || (senderNameOnlyChange && senderReady && importedSavedSenderId == null));
  const credentialConfigured = senderCredentialIsConfigured({ emailSender: sender, provider: senderForm.provider, changePassword: senderForm.change_password, importedSavedSenderId, importedPasswordConfigured });
  const mainDirty = mainConfigurationSnapshot(name, actions, participation, notifications, forwardEmails) !== mainBaseline;

  useEffect(() => { onDirtyChange(mainDirty || senderDirty); }, [mainDirty, onDirtyChange, senderDirty]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    let active = true;
    setSenderLoading(true);
    void api.get<GroupEmailSender>(endpoints.groupEmailSender(groupId)).then((value) => { if (!active) return; const next = { ...EMPTY_EMAIL_SENDER, ...value }; setSender(next); setSenderForm(senderFormFromApi(next)); setImportedSavedSenderId(null); setImportedPasswordConfigured(false); setSenderPanel("form"); }).catch((caught) => { if (active) setError(formatError(caught, t("common.error"))); }).finally(() => { if (active) setSenderLoading(false); });
    return () => { active = false; };
  }, [api, groupId, t]);
  useEffect(() => { if (!mainDirty && !senderDirty) return; const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", beforeUnload); return () => window.removeEventListener("beforeunload", beforeUnload); }, [mainDirty, senderDirty]);

  function applySender(value: GroupEmailSender) { const next = { ...EMPTY_EMAIL_SENDER, ...value }; setSender(next); setSenderForm(senderFormFromApi(next)); setImportedSavedSenderId(null); setImportedPasswordConfigured(false); setDraftVerified(false); setShowPassword(false); }
  function patchSender<K extends keyof GroupEmailSenderForm>(key: K, value: GroupEmailSenderForm[K]) { setSenderForm((current) => ({ ...current, [key]: value })); if (key !== "from_name") setDraftVerified(false); setSenderMessage(""); }
  function beginPasswordChange() { setImportedSavedSenderId(null); setImportedPasswordConfigured(false); patchSender("change_password", true); }
  function changeProvider(provider: EmailSenderProvider) { if (provider === senderForm.provider) { setSenderPanel("form"); return; } if ((sender.configured || senderDirty) && !confirm(t("groups.providerChangeConfirm"))) return; setSenderPanel("form"); setImportedSavedSenderId(null); setImportedPasswordConfigured(false); setSenderForm(blankSenderForm(provider)); setDraftVerified(false); setSenderMessage(""); setShowPassword(false); }
  function onProviderSelect(value: string) { if (value === SAVED_SENDERS_PICKER) { setSenderPanel("saved"); void loadSavedSenders(); return; } changeProvider(value as EmailSenderProvider); }
  async function loadSavedSenders() { setSavedSendersLoading(true); try { const payload = await api.get<{ results?: SavedEmailSender[] }>(endpoints.savedEmailSenders()); setSavedSenders(savedSendersFromList(payload)); } catch (caught) { setError(formatError(caught, t("common.error"))); } finally { setSavedSendersLoading(false); } }
  function importSavedSender(template: SavedEmailSender) { const imported = applySavedSenderImport(template); setSenderForm(imported.form); setImportedSavedSenderId(imported.importedSavedSenderId); setImportedPasswordConfigured(imported.passwordConfigured); setSenderPanel("form"); setDraftVerified(false); setSenderMessage(""); setShowPassword(false); }
  function providerLabel(provider: EmailSenderProvider) { return t(provider === "gmail" ? "groups.providerGmail" : provider === "microsoft" ? "groups.providerMicrosoft" : provider === "yahoo" ? "groups.providerYahoo" : "groups.providerCustomSmtp"); }
  function senderBody() { return buildGroupSenderSaveBody(senderForm, sender, importedSavedSenderId); }
  function changeSecurity(security: SmtpSecurity) { setSenderForm((current) => ({ ...current, smtp_security: security, smtp_port: security === "ssl" && Number(current.smtp_port) === 587 ? 465 : security === "starttls" && Number(current.smtp_port) === 465 ? 587 : current.smtp_port })); setDraftVerified(false); }
  function setAfterAction(key: keyof GroupNotifications, value: boolean) { if (value && !senderReady) return; setNotifications((current) => ({ ...current, [key]: { ...current[key], send_email: value } })); if (value) setParticipation((current) => ({ ...current, email_required: true })); }
  function setAfterTemplate(key: keyof GroupNotifications, value: string) { setNotifications((current) => ({ ...current, [key]: { ...current[key], email_template: value } })); }
  function updateForward(index: number, value: string) { setForwardEmails((current) => current.map((email, itemIndex) => itemIndex === index ? value : email)); }
  function addForward() { setForwardEmails((current) => current.length >= 3 ? current : [...current, ""]); }
  function removeForward(index: number) { setForwardEmails((current) => normalizeForwardEmailSlots(current.filter((_, itemIndex) => itemIndex !== index))); }

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const updated = await api.patch<Group>(endpoints.group(groupId), { name: name.trim(), actions, participation, notifications, advanced: { forward_emails: savedForwardEmails(forwardEmails) } });
      const nextNotifications = groupNotifications(updated); const nextForward = normalizeForwardEmailSlots(updated.forward_emails || updated.advanced?.forward_emails);
      setName(updated.name); setActions(updated.actions); setParticipation(updated.participation); setNotifications(nextNotifications); setForwardEmails(nextForward); setMainBaseline(mainConfigurationSnapshot(updated.name, updated.actions, updated.participation, nextNotifications, nextForward)); setMessage(t("groups.settingsSaved")); await onSaved();
    } catch (caught) { setError(formatError(caught, t("common.error"))); } finally { setBusy(false); }
  }
  async function testSender() {
    if (!testEmail) return; setTestingSender(true); setError(""); setSenderMessage("");
    try { const result = await api.post<{ detail?: string; draft_verified?: boolean; email_sender?: GroupEmailSender }>(endpoints.groupEmailSenderTest(groupId), { to_email: testEmail, ...senderBody() }); if (result.email_sender) setSender((current) => ({ ...current, ...result.email_sender })); setDraftVerified(Boolean(result.draft_verified)); setSenderMessage(result.detail || t("groups.senderTestSent")); } catch (caught) { setDraftVerified(false); setError(formatError(caught, t("common.error"))); } finally { setTestingSender(false); }
  }
  async function saveSender() {
    setSavingSender(true); setError(""); setSenderMessage("");
    try { const updated = await api.put<GroupEmailSender>(endpoints.groupEmailSender(groupId), senderBody()); applySender(updated); setSenderMessage(t("groups.senderSaved")); await onSaved(); } catch (caught) { setError(formatError(caught, t("common.error"))); } finally { setSavingSender(false); }
  }
  async function submitSavedSender(name: string, replace = false) {
    setSavingTemplate(true); setError("");
    try {
      await api.post(endpoints.savedEmailSenders(), buildSavedSenderCreateBody({ name, senderForm, importedSavedSenderId, sourceGroupId: groupId, emailSender: sender, replace }));
      setSaveTemplateOpen(false); setPendingReplace(""); setTemplateName(""); setSenderMessage(t("groups.savedSenderSaved"));
      if (senderPanel === "saved") await loadSavedSenders();
    } catch (caught) {
      if (!replace && caught instanceof ApiError && isSavedSenderNameConflict(caught)) { setSaveTemplateOpen(false); setPendingReplace(name); return; }
      setError(formatError(caught, t("common.error")));
    } finally { setSavingTemplate(false); }
  }
  async function confirmDeleteSavedSender() {
    if (!pendingDelete) return;
    setDeletingTemplate(true); setError("");
    try {
      await api.delete(endpoints.savedEmailSender(pendingDelete.id));
      retainGroupDraftAfterTemplateDelete({ sender, senderForm });
      setPendingDelete(null);
      await loadSavedSenders();
    } catch (caught) { setError(formatError(caught, t("common.error"))); } finally { setDeletingTemplate(false); }
  }

  const senderStatus = draftVerified ? "verified" : senderNeedsTest ? "draft" : sender.status;
  const senderStatusLabel = t(`groups.sender${senderStatus === "not_configured" ? "NotConfigured" : senderStatus === "needs_verification" ? "NeedsVerification" : senderStatus === "ready" ? "Ready" : senderStatus === "verified" ? "Verified" : senderStatus === "draft" ? "Draft" : "Error"}`);
  const senderTone = senderStatus === "ready" || senderStatus === "verified" ? "green" : senderStatus === "error" ? "danger" : "warning";
  const configuredForwardCount = savedForwardEmails(forwardEmails).length;

  return <><form className="group-configuration" onSubmit={save}>
    <div className="group-configuration-feedback"><Alert>{error}</Alert><Alert tone="success">{message}</Alert></div>
    <div className="group-configuration-save"><Button type="submit" loading={busy} disabled={!mainDirty}>{t("groups.saveChanges")}</Button></div>
    <div className="group-configuration-columns">
      <div className="group-configuration-column">
        <Card title={t("groups.groupSection")}><Field label={t("groups.name")}><Input required value={name} onChange={(event) => setName(event.target.value)} /></Field></Card>
        <Card title={t("groups.actions")}><Toggle label={t("kiosk.checkIn")} checked={actions.check_in_enabled} onChange={(value) => setActions({ ...actions, check_in_enabled: value })} /><Toggle label={t("kiosk.checkOut")} checked={actions.check_out_enabled} onChange={(value) => setActions({ ...actions, check_out_enabled: value })} /><Toggle label={t("kiosk.breaks")} checked={actions.breaks_enabled} onChange={(value) => setActions({ ...actions, breaks_enabled: value })} /></Card>
        <Card title={t("groups.participation")}><Toggle label={t("groups.requireEmail")} checked={participation.email_required} onChange={(value) => setParticipation({ ...participation, email_required: value })} /><Toggle label={t("groups.requirePin")} checked={participation.pin_required} onChange={(value) => setParticipation({ ...participation, pin_required: value })} /></Card>
      </div>
      <div className="group-configuration-column">
        <Card title={t("groups.afterAction")} description={t("groups.afterActionHint")}>
          {!senderReady ? <p className="configuration-hint">{t("groups.afterActionBlocked")}</p> : null}
          {!actions.check_in_enabled && !actions.check_out_enabled && !actions.breaks_enabled ? <p className="configuration-hint">{t("groups.afterActionEnableHint")}</p> : <div className="after-action-settings">
            {actions.check_in_enabled ? <AfterActionSetting disabled={!senderReady} label={t("groups.afterCheckIn")} setting={notifications.check_in} onEnable={(value) => setAfterAction("check_in", value)} onTemplate={(value) => setAfterTemplate("check_in", value)} /> : null}
            {actions.check_out_enabled ? <AfterActionSetting disabled={!senderReady} label={t("groups.afterCheckOut")} setting={notifications.check_out} onEnable={(value) => setAfterAction("check_out", value)} onTemplate={(value) => setAfterTemplate("check_out", value)} /> : null}
            {actions.breaks_enabled ? <AfterActionSetting disabled={!senderReady} label={t("groups.afterBreak")} setting={notifications.break} onEnable={(value) => setAfterAction("break", value)} onTemplate={(value) => setAfterTemplate("break", value)} /> : null}
          </div>}
        </Card>
        <Card title={t("groups.advancedEmail")} description={t("groups.advancedEmailHint")}>
          <ConfigurationDisclosure label={t("groups.emailSender")} summary={senderLoading ? t("groups.senderLoading") : senderStatusLabel} open={senderOpen} onToggle={() => setSenderOpen((open) => !open)}>
            {senderLoading ? <Loading label={t("groups.senderLoading")} /> : <div className="email-sender-form">
              <div className="email-sender-status"><Field label={t("groups.provider")}><Select value={senderPanel === "saved" ? SAVED_SENDERS_PICKER : senderForm.provider} onChange={(event) => onProviderSelect(event.target.value)}><option value="custom_smtp">{t("groups.providerCustomSmtp")}</option><option value="gmail">{t("groups.providerGmail")}</option><option value="microsoft">{t("groups.providerMicrosoft")}</option><option value="yahoo">{t("groups.providerYahoo")}</option><option value={SAVED_SENDERS_PICKER}>{t("groups.savedSendersOption")}</option></Select></Field><div><span className="field-label">{t("groups.senderStatus")}</span><Badge tone={senderTone}>{senderStatusLabel}</Badge></div></div>
              {senderPanel === "saved" ? <div className="saved-sender-list">{savedSendersLoading ? <Loading label={t("groups.savedSendersLoading")} /> : savedSenders.length ? savedSenders.map((item) => <div className="saved-sender-row" key={item.id}><div className="saved-sender-copy"><strong>{item.name}</strong><small>{providerLabel(item.provider)} · {savedSenderDisplayAddress(item) || "—"}</small></div><div className="saved-sender-actions"><Button className="button-sm" type="button" onClick={() => importSavedSender(item)}>{t("groups.importSavedSender")}</Button><Button className="button-sm" type="button" variant="danger" onClick={() => setPendingDelete(item)}>{t("groups.deleteSavedSenderConfirm")}</Button></div></div>) : <p className="saved-sender-empty">{t("groups.noSavedSenders")}</p>}</div> : <><p className="configuration-hint">{t(senderForm.provider === "gmail" ? "groups.gmailHint" : senderForm.provider === "microsoft" ? "groups.microsoftHint" : senderForm.provider === "yahoo" ? "groups.yahooHint" : "groups.customSmtpHint")}</p>
              {senderForm.provider === "custom_smtp" ? <><Field label={t("groups.smtpHost")}><Input autoComplete="off" value={senderForm.smtp_host} onChange={(event) => patchSender("smtp_host", event.target.value)} /></Field><div className="email-sender-grid"><Field label={t("groups.smtpPort")}><Input min={1} max={65535} type="number" value={senderForm.smtp_port} onChange={(event) => patchSender("smtp_port", event.target.value)} /></Field><Field label={t("groups.smtpSecurity")}><Select value={senderForm.smtp_security} onChange={(event) => changeSecurity(event.target.value as SmtpSecurity)}><option value="ssl">{t("groups.smtpSecuritySsl")}</option><option value="starttls">{t("groups.smtpSecurityStarttls")}</option><option value="none">{t("groups.smtpSecurityNone")}</option></Select></Field></div><Field label={t("groups.smtpUsername")}><Input autoComplete="off" value={senderForm.smtp_username} onChange={(event) => patchSender("smtp_username", event.target.value)} /></Field><SenderPasswordField configured={credentialConfigured} form={senderForm} label={t("groups.smtpPassword")} setShow={setShowPassword} show={showPassword} t={t} onChange={(value) => patchSender("smtp_password", value)} onReplace={beginPasswordChange} /><div className="email-sender-grid"><Field label={t("groups.fromEmail")} hint={t("groups.fromEmailHint")}><Input type="email" value={senderForm.from_email} onChange={(event) => patchSender("from_email", event.target.value)} /></Field><Field label={t("groups.fromName")}><Input value={senderForm.from_name} onChange={(event) => patchSender("from_name", event.target.value)} /></Field></div></> : <GuidedSenderFields configured={credentialConfigured} form={senderForm} showPassword={showPassword} setShowPassword={setShowPassword} t={t} patch={patchSender} onReplacePassword={beginPasswordChange} />}
              <div className="email-sender-test-row"><Field label={t("groups.testRecipient")}><Input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} /></Field><Button type="button" variant="secondary" disabled={!testEmail} loading={testingSender} onClick={() => void testSender()}>{t("groups.sendTest")}</Button></div>
              <Alert tone="info">{senderMessage}</Alert><div className="email-sender-save"><Button type="button" variant="secondary" disabled={savingTemplate || savingSender} onClick={() => { setTemplateName(""); setSaveTemplateOpen(true); }}>{t("groups.saveAsSavedSender")}</Button><Button type="button" disabled={!canSaveSender} loading={savingSender} onClick={() => void saveSender()}>{t("groups.saveSender")}</Button></div></>}
            </div>}
          </ConfigurationDisclosure>
          <ConfigurationDisclosure label={t("groups.forwardEmails")} summary={!forwardAllowed ? t("groups.forwardLocked") : configuredForwardCount ? t("groups.forwardConfigured", { count: configuredForwardCount }) : t("groups.forwardNone")} open={forwardOpen} onToggle={() => setForwardOpen((open) => !open)}>
            <div className="forward-email-settings"><p className="configuration-hint">{t(forwardAllowed ? "groups.forwardEmailsHint" : "groups.forwardEmailsLockedHint")}</p>{forwardEmails.map((email, index) => <Field key={index} label={forwardEmails.length > 1 ? t("groups.forwardEmailNumbered", { number: index + 1 }) : t("groups.forwardEmail")}><div className="forward-email-row"><Input disabled={!forwardAllowed} type="email" value={email} onChange={(event) => updateForward(index, event.target.value)} placeholder={t("groups.forwardEmailsPlaceholder")} />{index > 0 ? <Button type="button" variant="ghost" onClick={() => removeForward(index)}>{t("groups.removeEmail")}</Button> : null}</div></Field>)}{forwardAllowed && forwardEmails.length < 3 ? <Button type="button" variant="secondary" className="button-sm" onClick={addForward}>{t("groups.addAnotherForwardEmail")}</Button> : null}</div>
          </ConfigurationDisclosure>
        </Card>
      </div>
    </div>
  </form>
    {saveTemplateOpen ? <Modal title={t("groups.saveSavedSenderTitle")} onClose={() => setSaveTemplateOpen(false)} actions={<><Button variant="secondary" type="button" onClick={() => setSaveTemplateOpen(false)}>{t("common.cancel")}</Button><Button type="button" disabled={!templateName.trim()} loading={savingTemplate} onClick={() => void submitSavedSender(templateName.trim())}>{t("common.save")}</Button></>}><Field label={t("groups.savedSenderName")}><Input autoFocus maxLength={80} value={templateName} onChange={(event) => setTemplateName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (templateName.trim()) void submitSavedSender(templateName.trim()); } }} /></Field></Modal> : null}
    {pendingReplace ? <Modal title={t("groups.replaceSavedSenderTitle")} onClose={() => setPendingReplace("")} actions={<><Button variant="secondary" type="button" onClick={() => setPendingReplace("")}>{t("common.cancel")}</Button><Button type="button" loading={savingTemplate} onClick={() => void submitSavedSender(pendingReplace, true)}>{t("groups.replaceSavedSenderConfirm")}</Button></>}><p className="configuration-hint">{t("groups.replaceSavedSenderBody", { name: pendingReplace })}</p></Modal> : null}
    {pendingDelete ? <Modal title={t("groups.deleteSavedSenderTitle")} onClose={() => setPendingDelete(null)} actions={<><Button variant="secondary" type="button" onClick={() => setPendingDelete(null)}>{t("common.cancel")}</Button><Button type="button" variant="danger" loading={deletingTemplate} onClick={() => void confirmDeleteSavedSender()}>{t("groups.deleteSavedSenderConfirm")}</Button></>}><p className="configuration-hint">{t("groups.deleteSavedSenderBody", { name: pendingDelete.name })}</p></Modal> : null}
  </>;
}

function AfterActionSetting({ disabled, label, setting, onEnable, onTemplate }: { disabled: boolean; label: string; setting: NotificationSetting; onEnable: (value: boolean) => void; onTemplate: (value: string) => void }) {
  const { t } = useApp();
  return <div className={`after-action-setting${disabled ? " is-disabled" : ""}`}><Toggle label={label} checked={setting.send_email} disabled={disabled} onChange={onEnable} />{setting.send_email && !disabled ? <Field label={t("groups.emailMessage")} hint={t("groups.emailMessageHint")}><TextArea rows={2} value={setting.email_template} onChange={(event) => onTemplate(event.target.value)} /></Field> : null}</div>;
}

function ConfigurationDisclosure({ label, summary, open, onToggle, children }: { label: string; summary: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const { t } = useApp();
  return <section className={`configuration-disclosure${open ? " is-open" : ""}`}><button aria-expanded={open} className="configuration-disclosure-toggle" onClick={onToggle} type="button"><span><strong>{label}</strong><small>{summary}</small></span><span>{t(open ? "groups.hide" : "groups.show")}</span></button>{open ? <div className="configuration-disclosure-body">{children}</div> : null}</section>;
}

function SenderPasswordField({ configured, form, label, show, setShow, onChange, onReplace, t }: { configured: boolean; form: GroupEmailSenderForm; label: string; show: boolean; setShow: (show: boolean) => void; onChange: (value: string) => void; onReplace: () => void; t: (key: string, vars?: Record<string, string | number>) => string }) {
  return <Field label={label}>{configured && !form.change_password ? <div className="configured-password-row"><span>{t("groups.passwordConfigured")}</span><Button type="button" className="button-sm" variant="secondary" onClick={onReplace}>{t("groups.changePassword")}</Button></div> : <div className="sender-password-input"><Input autoComplete="new-password" type={show ? "text" : "password"} value={form.smtp_password} onChange={(event) => onChange(event.target.value)} /><button aria-label={t(show ? "auth.hidePassword" : "auth.showPassword")} onClick={() => setShow(!show)} type="button">{show ? "◉" : "○"}</button></div>}</Field>;
}

function GuidedSenderFields({ configured, form, showPassword, setShowPassword, t, patch, onReplacePassword }: { configured: boolean; form: GroupEmailSenderForm; showPassword: boolean; setShowPassword: (show: boolean) => void; t: (key: string, vars?: Record<string, string | number>) => string; patch: <K extends keyof GroupEmailSenderForm>(key: K, value: GroupEmailSenderForm[K]) => void; onReplacePassword: () => void }) {
  const addressKey = form.provider === "gmail" ? "gmail_address" : form.provider === "microsoft" ? "microsoft_email" : "yahoo_email";
  const label = t(form.provider === "gmail" ? "groups.gmailAddress" : form.provider === "microsoft" ? "groups.microsoftEmail" : "groups.yahooEmail");
  return <><Field label={label}><Input autoComplete="off" type="email" value={String(form[addressKey])} onChange={(event) => patch(addressKey, event.target.value)} /></Field><SenderPasswordField configured={configured} form={form} label={t(form.provider === "microsoft" ? "groups.smtpPassword" : "groups.appPassword")} show={showPassword} setShow={setShowPassword} t={t} onChange={(value) => patch("smtp_password", value)} onReplace={onReplacePassword} /><Field label={t("groups.fromName")}><Input value={form.from_name} onChange={(event) => patch("from_name", event.target.value)} /></Field></>;
}

function KioskManagement({ group, groupId, canConfigure, canLaunch }: { group: Group; groupId: string; canConfigure: boolean; canLaunch: boolean }) {
  const { api, t } = useApp(); const navigate = useNavigate(); const [settings, setSettings] = useState<Record<string, unknown> | null>(null); const [design, setDesign] = useState<Record<string, unknown> | null>(null); const [readiness, setReadiness] = useState<KioskSettingsReadiness | null>(null); const [settingsLoading, setSettingsLoading] = useState(canConfigure); const [launching, setLaunching] = useState(false); const [launchBlockedNotice, setLaunchBlockedNotice] = useState(false); const [error, setError] = useState("");
  const loadSettings = useCallback(async () => { if (!canConfigure) { setSettingsLoading(false); return null; } setSettingsLoading(true); try { const next = await api.get<Record<string, unknown>>(endpoints.kioskSettings(groupId)); const nextReadiness = kioskSettingsReadiness(next); setSettings(next); setReadiness(nextReadiness); return nextReadiness; } catch (caught) { setReadiness(null); setError(formatError(caught, t("common.error"))); return null; } finally { setSettingsLoading(false); } }, [api, canConfigure, groupId, t]);
  useEffect(() => { setError(""); void loadSettings(); void api.get<Record<string, unknown>>(endpoints.kioskDesign(groupId)).then(setDesign).catch((caught) => setError(formatError(caught, t("common.error")))); }, [api, groupId, loadSettings, t]);
  const launchBlocked = isKioskLaunchBlocked({ groupReadiness: group.readiness, canInspectKioskSettings: canConfigure, settingsLoading, kioskReadiness: readiness });
  async function launch() { setLaunching(true); setLaunchBlockedNotice(false); try { const latest = await loadSettings(); const blocked = isKioskLaunchBlocked({ groupReadiness: group.readiness, canInspectKioskSettings: canConfigure, settingsLoading: false, kioskReadiness: latest }); if (blocked) { setLaunchBlockedNotice(true); return; } navigate(`/kiosk/${groupId}`); } finally { setLaunching(false); } }
  return <><Alert>{error}</Alert><div className="card-grid"><Card title={t("kiosk.settings")} description={t("kiosk.modeHint")}><p className="muted-copy">{settings ? `${t("kiosk.mode")}: ${String(settings.kiosk_mode || settings.mode || "—")}` : t("kiosk.notConfigured")}</p><div className="card-action"><Badge tone={settings ? "green" : "neutral"}>{settings ? t("kiosk.configured") : t("kiosk.notConfigured")}</Badge><Button variant="secondary" onClick={() => navigate(`/groups/${groupId}/kiosk-settings`)}>{t("common.edit")}</Button></div></Card><Card title={t("kiosk.design")} description={t("kiosk.designDescription")}><p className="muted-copy">{design ? t("kiosk.configured") : t("kiosk.notConfigured")}</p><div className="card-action"><Button variant="secondary" onClick={() => navigate(`/groups/${groupId}/kiosk-design`)}>{t("common.edit")}</Button>{canLaunch ? <Button disabled={launchBlocked} loading={launching} onClick={() => void launch()}>{t("groups.launchKiosk")}</Button> : null}</div></Card></div></>;
}
