import { useCallback, useEffect, useRef, useState } from "react";
import { Alert as NativeAlert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { canLaunchKiosk, canManageGroupConfiguration, hasPlanFeature } from "@checkstation/domain";
import { Alert, Button, Field, LoadingState, Screen } from "../../../src/components/ui";
import { PageHeader, SectionCard, StatusPill } from "../../../src/components/mobile";
import { AvatarRow } from "../../../src/components/Avatar";
import { useApp } from "../../../src/lib/AppProvider";
import { colors, space, type } from "../../../src/theme/tokens";
import type { TextInput } from "react-native";

type GroupActions = { check_in_enabled: boolean; check_out_enabled: boolean; breaks_enabled: boolean; max_breaks: number | null };
type GroupParticipation = { email_required: boolean; pin_required: boolean };
type GroupNotifications = { check_in: { send_email: boolean; email_template: string }; check_out: { send_email: boolean; email_template: string }; break: { send_email: boolean; email_template: string } };
type GroupReadiness = { setup_complete: boolean; operational_ready: boolean; missing_email_count: number; missing_pin_count: number };
type GroupStructured = { require_class_pin: boolean; active_section_count: number; participant_count: number } | null;
type Group = { id: number; name: string; status: string; group_type: string; participant_count: number; member_count: number; group_only_participant_count: number; is_plan_locked: boolean; require_class_pin: boolean; actions: GroupActions; participation: GroupParticipation; notifications: GroupNotifications; readiness: GroupReadiness; structured: GroupStructured; created_at: string; updated_at: string; archived_at: string | null; forward_emails: string[]; email_sender_ready: boolean; kiosk_available: boolean };

type Participant = { id: number; group_participant_code: string; member?: { id: number; name: string; email: string; photo_url: string | null }; name?: string; email?: string; override_name?: string; override_email?: string; participation_emails?: string[]; has_pin: boolean; photo_url?: string | null; status: string; overrides?: { name: string; email: string; has_photo: boolean; photo_url: string | null; has_pin: boolean }; effective?: { name: string; email: string; has_photo: boolean; photo_url: string | null; has_pin: boolean }; participation?: { email: string; emails: string[]; has_pin: boolean; missing_required_fields: string[]; complete: boolean }; setup?: { email: string; emails: string[]; has_pin: boolean; missing_required_fields: string[]; complete: boolean }; _kind?: "member" | "visitor" };
type AvailableMember = { id: number; name: string; email: string; photo_url: string | null; suggested_participation_email: string };
type GroupSection = { id: number; name: string; participant_count: number; has_class_pin: boolean; status: string };

type ActiveSection = "overview" | "people" | "configuration" | "kiosk";

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, authState, t } = useApp();
  const router = useRouter();
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<ActiveSection>("overview");
  const canConfigure = canManageGroupConfiguration(authState.session);
  const canKiosk = canLaunchKiosk(authState.session);
  const isOwnerOrAdmin = authState.session?.role === "owner" || authState.session?.role === "admin";
  const structuredAccess = hasPlanFeature(authState.session, "structured_groups");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setGroup(await api.get<Group>(endpoints.group(id))); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : t("common.error")); }
    finally { setLoading(false); }
  }, [api, id, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading) return <Screen><LoadingState label={t("groups.loading")} /></Screen>;
  if (!group) return <Screen><Alert message={error || t("common.error")} /></Screen>;

  const locked = group.is_plan_locked;
  const archived = group.status === "archived";
  const structured = group.group_type === "structured";
  const incomplete = !locked && !archived && group.readiness && !group.readiness.setup_complete;

  const sections: Array<{ key: ActiveSection; label: string }> = [
    { key: "overview", label: t("groups.overview") || "Overview" },
    { key: "people", label: t("groups.participantLabel") || "People" },
  ];
  if (canConfigure && !locked) {
    sections.push({ key: "configuration", label: t("groups.configuration") || "Configuration" });
  }
  if (!locked && !archived) {
    sections.push({ key: "kiosk", label: "Kiosk" });
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          title={group.name}
          description={structured ? `${t("groups.structured")} · #${group.id}` : `${t("groups.standard")} · #${group.id}`}
        />
        <Alert message={error} />

        <View style={styles.pills}>
          {locked ? <StatusPill label={t("groups.planLocked")} tone="warning" /> : archived ? <StatusPill label={t("groups.archivedLabel")} tone="neutral" /> : incomplete ? <StatusPill label={t("groups.setupIncomplete")} tone="warning" /> : <StatusPill label={t("groups.activeLabel")} tone="green" />}
        </View>

        <View style={styles.tabs}>
          {sections.map((s) => (
            <View key={s.key} style={[styles.tab, activeSection === s.key && styles.tabActive]}>
              <Text style={[styles.tabText, activeSection === s.key && styles.tabTextActive]} onPress={() => setActiveSection(s.key)}>{s.label}</Text>
            </View>
          ))}
        </View>

        {activeSection === "overview" && (
          <OverviewSection group={group} t={t} />
        )}

        {activeSection === "people" && (
          <PeopleSection groupId={id} group={group} api={api} t={t} canConfigure={canConfigure && !locked} />
        )}

        {activeSection === "configuration" && canConfigure && !locked && (
          <ConfigurationSection groupId={id} group={group} api={api} authState={authState} t={t} structuredAccess={structuredAccess} onSaved={() => void load()} />
        )}

        {activeSection === "kiosk" && !locked && !archived && (
          <KioskSection groupId={id} group={group} api={api} t={t} canKiosk={canKiosk} canConfigure={canConfigure} router={router} />
        )}
      </ScrollView>
    </Screen>
  );
}

function OverviewSection({ group, t }: { group: Group; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const structured = group.group_type === "structured";
  const total = group.participant_count ?? group.member_count + group.group_only_participant_count;
  return (
    <>
      <SectionCard title={t("groups.overview") || "Overview"}>
        <View style={styles.overviewGrid}>
          <View style={styles.overviewItem}>
            <Text style={styles.overviewValue}>{total}</Text>
            <Text style={styles.overviewLabel}>{t("groups.participantLabel")}</Text>
          </View>
          <View style={styles.overviewItem}>
            <Text style={styles.overviewValue}>{group.member_count}</Text>
            <Text style={styles.overviewLabel}>{t("members.title")}</Text>
          </View>
          <View style={styles.overviewItem}>
            <Text style={styles.overviewValue}>{group.group_only_participant_count}</Text>
            <Text style={styles.overviewLabel}>{t("groups.visitors") || "Visitors"}</Text>
          </View>
          {structured && group.structured ? (
            <View style={styles.overviewItem}>
              <Text style={styles.overviewValue}>{group.structured.active_section_count}</Text>
              <Text style={styles.overviewLabel}>{t("groups.classes") || "Classes"}</Text>
            </View>
          ) : null}
        </View>
      </SectionCard>

      <SectionCard title={t("groups.actions") || "Actions"}>
        <Info label={t("kiosk.checkIn") || "Check-in"} value={group.actions.check_in_enabled ? (t("security.enabled") || "Enabled") : (t("security.notEnabled") || "Disabled")} />
        <Info label={t("kiosk.checkOut") || "Check-out"} value={group.actions.check_out_enabled ? (t("security.enabled") || "Enabled") : (t("security.notEnabled") || "Disabled")} />
        {group.actions.breaks_enabled ? (
          <Info label={t("kiosk.breaks") || "Breaks"} value={String(group.actions.max_breaks || 0)} />
        ) : null}
      </SectionCard>

      <SectionCard title={t("groups.participation") || "Participation"}>
        <Info label={t("auth.email")} value={group.participation.email_required ? (t("groups.required") || "Required") : (t("groups.optional") || "Optional")} />
        <Info label="PIN" value={group.participation.pin_required ? (t("groups.required") || "Required") : (t("groups.optional") || "Optional")} />
        {group.readiness ? (
          <>
            {group.readiness.missing_email_count > 0 ? (
              <Info label={t("groups.missingEmails") || "Missing emails"} value={String(group.readiness.missing_email_count)} />
            ) : null}
            {group.readiness.missing_pin_count > 0 ? (
              <Info label={t("groups.missingPins") || "Missing PINs"} value={String(group.readiness.missing_pin_count)} />
            ) : null}
            {!group.readiness.operational_ready ? (
              <Info label={t("groups.readiness") || "Readiness"} value={t("groups.setupIncomplete")} />
            ) : null}
          </>
        ) : null}
      </SectionCard>

      {structured && group.structured ? (
        <SectionCard title={t("groups.classes") || "Classes"}>
          <Info label={t("groups.requireClassPin") || "Class PIN"} value={group.structured.require_class_pin ? (t("security.enabled") || "Required") : (t("security.notEnabled") || "Not required")} />
          <Info label={t("groups.activeClasses") || "Active classes"} value={String(group.structured.active_section_count)} />
        </SectionCard>
      ) : null}
    </>
  );
}

function PeopleSection({ groupId, group, api, t, canConfigure }: { groupId: string; group: Group; api: any; t: (key: string, vars?: Record<string, string | number>) => string; canConfigure: boolean }) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const structured = group.group_type === "structured";

  const loadParticipants = useCallback(async () => {
    setLoading(true);
    try {
      const [memberships, visitors] = await Promise.all([
        api.get(endpoints.groupMemberships(groupId)) as Promise<Participant[]>,
        api.get(endpoints.groupParticipants(groupId)) as Promise<Participant[]>,
      ]);
      setParticipants([...memberships.map((m: Participant) => ({ ...m, _kind: "member" as const })),
        ...visitors.map((v: Participant) => ({ ...v, _kind: "visitor" as const }))]);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [api, groupId]);

  useFocusEffect(useCallback(() => { void loadParticipants(); }, [loadParticipants]));

  if (loading) return <LoadingState label={t("common.loading")} />;

  return (
    <>
      <SectionCard
        title={t("groups.participantLabel") || "People"}
        description={`${participants.length} ${t("groups.participants", { count: participants.length })}`}
      >
        {participants.length === 0 ? (
          <Text style={styles.emptyText}>{t("groups.noParticipants") || "No participants yet."}</Text>
        ) : (
          participants.map((p) => (
            <View key={`${p._kind}-${p.id}`} style={styles.participantRow}>
              <AvatarRow
                name={p.effective?.name || p.name || p.member?.name || ""}
                subtitle={`${p.group_participant_code}${p._kind === "visitor" ? ` · ${t("groups.visitor") || "Visitor"}` : ""}`}
                url={p.effective?.photo_url || p.photo_url || p.member?.photo_url}
                size={40}
              />
              {canConfigure && p.status === "active" ? (
                <View style={styles.participantActions}>
                  <Text style={styles.actionLink} onPress={() => setEditingParticipant(p)}>{t("common.edit") || "Edit"}</Text>
                </View>
              ) : null}
            </View>
          ))
        )}
      </SectionCard>
      {canConfigure ? (
        <Button label={t("groups.addParticipant") || "Add participant"} onPress={() => setShowAddSheet(true)} variant="secondary" />
      ) : null}

      {showAddSheet ? (
        <AddParticipantSheet
          groupId={groupId}
          group={group}
          api={api}
          t={t}
          onClose={() => setShowAddSheet(false)}
          onSaved={() => { setShowAddSheet(false); void loadParticipants(); void (async () => { /* parent reloads via useFocusEffect */ })(); }}
        />
      ) : null}

      {editingParticipant ? (
        <EditParticipantSheet
          participant={editingParticipant}
          groupId={groupId}
          group={group}
          api={api}
          t={t}
          onClose={() => setEditingParticipant(null)}
          onSaved={() => { setEditingParticipant(null); void loadParticipants(); }}
        />
      ) : null}
    </>
  );
}

function AddParticipantSheet({ groupId, group, api, t, onClose, onSaved }: { groupId: string; group: Group; api: any; t: (key: string, vars?: Record<string, string | number>) => string; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<"member" | "visitor">("member");
  const [availableMembers, setAvailableMembers] = useState<AvailableMember[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [participationEmails, setParticipationEmails] = useState<string[]>([""]);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (mode === "member") {
      void (api.get(endpoints.groupAvailableMembers(groupId)) as Promise<AvailableMember[]>).then(setAvailableMembers).catch(() => {});
    }
  }, [api, groupId, mode]);

  async function submit() {
    setBusy(true); setError(""); setFieldErrors({});
    try {
      if (mode === "member") {
        if (!selectedMemberId) { setError(t("groups.selectMember") || "Select a member"); setBusy(false); return; }
        const payload: Record<string, unknown> = { member_id: selectedMemberId };
        const validEmails = participationEmails.filter(Boolean);
        if (validEmails.length) payload.participation_emails = validEmails;
        if (pin.trim()) payload.participation_pin = pin.trim();
        await api.post(endpoints.groupMemberships(groupId), payload);
      } else {
        const payload: Record<string, unknown> = { name: name.trim() };
        if (email.trim()) payload.email = email.trim();
        const validEmails = participationEmails.filter(Boolean);
        if (validEmails.length) payload.participation_emails = validEmails;
        if (pin.trim()) payload.participation_pin = pin.trim();
        await api.post(endpoints.groupParticipants(groupId), payload);
      }
      onSaved();
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fields = fieldErrorsFromBody(caught.data);
        setFieldErrors(fields);
        if (!Object.values(fields).some(Boolean)) setError(caught.message);
      } else setError(t("common.error"));
    } finally { setBusy(false); }
  }

  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>{t("groups.addParticipant") || "Add participant"}</Text>
        <Text style={styles.sheetClose} onPress={onClose}>{t("common.cancel") || "Cancel"}</Text>
      </View>

      <View style={styles.tabs}>
        <View style={[styles.tab, mode === "member" && styles.tabActive]}><Text style={[styles.tabText, mode === "member" && styles.tabTextActive]} onPress={() => setMode("member")}>{t("members.title")}</Text></View>
        <View style={[styles.tab, mode === "visitor" && styles.tabActive]}><Text style={[styles.tabText, mode === "visitor" && styles.tabTextActive]} onPress={() => setMode("visitor")}>{t("groups.visitor") || "Visitor"}</Text></View>
      </View>

      <Alert message={error} />

      {mode === "member" ? (
        <View style={styles.form}>
          <Text style={styles.formLabel}>{t("groups.selectMember") || "Select member"}</Text>
          <ScrollView style={styles.memberList}>
            {availableMembers.map((m) => (
              <View key={m.id} style={[styles.memberOption, selectedMemberId === m.id && styles.memberOptionSelected]}>
                <Text style={[styles.memberOptionText, selectedMemberId === m.id && styles.memberOptionTextSelected]} onPress={() => setSelectedMemberId(m.id)}>{m.name} ({m.email})</Text>
              </View>
            ))}
            {availableMembers.length === 0 ? <Text style={styles.emptyText}>{t("groups.noAvailableMembers") || "No members available"}</Text> : null}
          </ScrollView>
          <Field label={t("kiosk.pin") || "PIN"} value={pin} onChangeText={setPin} secureTextEntry placeholder={t("groups.optionalPin") || "Optional PIN"} />
          {group.participation.email_required ? <ParticipationEmailsField emails={participationEmails} onChange={setParticipationEmails} t={t} /> : null}
          <Button label={busy ? (t("groups.saving") || "Saving...") : (t("groups.add") || "Add")} loading={busy} disabled={busy} onPress={() => void submit()} />
        </View>
      ) : (
        <View style={styles.form}>
          <Field autoFocus error={fieldErrors.name} label={t("members.name")} value={name} onChangeText={setName} />
          <Field autoCapitalize="none" keyboardType="email-address" label={t("auth.email")} value={email} onChangeText={setEmail} />
          <Field label={t("kiosk.pin") || "PIN"} value={pin} onChangeText={setPin} secureTextEntry placeholder={t("groups.optionalPin") || "Optional PIN"} />
          <Button label={busy ? (t("groups.saving") || "Saving...") : (t("groups.add") || "Add")} loading={busy} disabled={busy} onPress={() => void submit()} />
        </View>
      )}
    </View>
  );
}

function ParticipationEmailsField({ emails, onChange, t }: { emails: string[]; onChange: (emails: string[]) => void; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const update = (index: number, value: string) => {
    const next = [...emails];
    next[index] = value;
    onChange(next);
  };
  return (
    <View>
      <Text style={styles.formLabel}>{t("groups.participationEmails") || "Notification emails"}</Text>
      {emails.map((email, i) => (
        <Field key={i} autoCapitalize="none" keyboardType="email-address" label={`${t("auth.email")} ${i + 1}`} value={email} onChangeText={(v) => update(i, v)} />
      ))}
      {emails.length < 3 ? <Text style={styles.addEmailLink} onPress={() => onChange([...emails, ""])}>{t("groups.addEmail") || "+ Add email"}</Text> : null}
    </View>
  );
}

function EditParticipantSheet({ participant, groupId, group, api, t, onClose, onSaved }: { participant: Participant; groupId: string; group: Group; api: any; t: (key: string, vars?: Record<string, string | number>) => string; onClose: () => void; onSaved: () => void }) {
  const isVisitor = (participant as any)._kind === "visitor";
  const [name, setName] = useState(isVisitor ? participant.name || "" : participant.override_name || "");
  const [email, setEmail] = useState(isVisitor ? participant.email || "" : participant.override_email || "");
  const [participationEmails, setParticipationEmails] = useState<string[]>(participant.participation_emails || [""]);
  const [pin, setPin] = useState("");
  const [clearPin, setClearPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function remove() {
    NativeAlert.alert(
      t("groups.removeParticipant") || "Remove participant",
      t("groups.removeParticipantConfirm") || "Remove this participant from the group?",
      [
        { text: t("common.cancel") || "Cancel", style: "cancel" },
        { text: t("groups.remove") || "Remove", style: "destructive", onPress: async () => {
          setBusy(true);
          try {
            if (isVisitor) await api.delete(endpoints.groupParticipant(groupId, participant.id));
            else await api.delete(endpoints.groupMembership(groupId, participant.id));
            onSaved();
          } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : t("common.error"));
          } finally { setBusy(false); }
        }},
      ],
    );
  }

  async function save() {
    setBusy(true); setError(""); setFieldErrors({});
    try {
      const payload: Record<string, unknown> = {};
      if (isVisitor) {
        if (name.trim()) payload.name = name.trim();
        if (email.trim()) payload.email = email.trim();
      } else {
        if (name.trim()) payload.override_name = name.trim();
        if (email.trim()) payload.override_email = email.trim();
      }
      const validEmails = participationEmails.filter(Boolean);
      if (validEmails.length) payload.participation_emails = validEmails;
      if (pin.trim()) payload.participation_pin = pin.trim();
      if (clearPin) payload.clear_participation_pin = true;

      if (isVisitor) await api.patch(endpoints.groupParticipant(groupId, participant.id), payload);
      else await api.patch(endpoints.groupMembership(groupId, participant.id), payload);
      onSaved();
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fields = fieldErrorsFromBody(caught.data);
        setFieldErrors(fields);
        if (!Object.values(fields).some(Boolean)) setError(caught.message);
      } else setError(t("common.error"));
    } finally { setBusy(false); }
  }

  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>{t("common.edit") || "Edit"} {participant.effective?.name || participant.name || participant.member?.name || ""}</Text>
        <Text style={styles.sheetClose} onPress={onClose}>{t("common.cancel") || "Cancel"}</Text>
      </View>
      <Alert message={error} />
      <View style={styles.form}>
        {isVisitor ? (
          <>
            <Field autoFocus error={fieldErrors.name} label={t("members.name")} value={name} onChangeText={setName} />
            <Field autoCapitalize="none" error={fieldErrors.email} keyboardType="email-address" label={t("auth.email")} value={email} onChangeText={setEmail} />
          </>
        ) : (
          <>
            <Field autoFocus error={fieldErrors.override_name} label={`${t("members.name")} (${t("groups.override") || "override"})`} value={name} onChangeText={setName} hint={t("groups.overrideHint") || "Leave empty to use Member profile"} />
            <Field autoCapitalize="none" error={fieldErrors.override_email} keyboardType="email-address" label={`${t("auth.email")} (${t("groups.override") || "override"})`} value={email} onChangeText={setEmail} hint={t("groups.overrideHint") || "Leave empty to use Member profile"} />
          </>
        )}
        <ParticipationEmailsField emails={participationEmails} onChange={setParticipationEmails} t={t} />
        <Field label={t("groups.newPin") || "New PIN"} value={pin} onChangeText={setPin} secureTextEntry placeholder={t("groups.optionalPin") || "Leave empty to keep current"} />
        {participant.has_pin ? (
          <View style={styles.clearRow}>
            <Text style={styles.clearToggle} onPress={() => setClearPin(!clearPin)}>{clearPin ? "✓ " : ""}{t("groups.clearPin") || "Clear PIN"}</Text>
          </View>
        ) : null}
        <Button label={busy ? (t("groups.saving") || "Saving...") : (t("groups.save") || "Save")} loading={busy} disabled={busy} onPress={() => void save()} />
        <Button label={t("groups.remove") || "Remove"} variant="danger" onPress={remove} disabled={busy} />
      </View>
    </View>
  );
}

function ConfigurationSection({ groupId, group, api, authState, t, structuredAccess, onSaved }: { groupId: string; group: Group; api: any; authState: any; t: (key: string, vars?: Record<string, string | number>) => string; structuredAccess: boolean; onSaved: () => void }) {
  const [name, setName] = useState(group.name);
  const [actions, setActions] = useState(group.actions);
  const [participation, setParticipation] = useState(group.participation);
  const [forwardEmails, setForwardEmails] = useState(group.forward_emails?.join(", ") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [archiving, setArchiving] = useState(false);

  async function save() {
    setBusy(true); setError(""); setFieldErrors({});
    try {
      const payload: Record<string, unknown> = {};
      if (name.trim() !== group.name) payload.name = name.trim();
      payload.actions = {
        check_in_enabled: actions.check_in_enabled,
        check_out_enabled: actions.check_out_enabled,
        breaks_enabled: actions.breaks_enabled,
        max_breaks: actions.breaks_enabled ? actions.max_breaks : null,
      };
      payload.participation = {
        email_required: participation.email_required,
        pin_required: participation.pin_required,
      };
      if (forwardEmails.trim()) payload.forward_emails = forwardEmails.split(",").map((e) => e.trim()).filter(Boolean);
      else payload.forward_emails = [];
      await api.patch(endpoints.group(groupId), payload);
      onSaved();
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fields = fieldErrorsFromBody(caught.data);
        setFieldErrors(fields);
        if (!Object.values(fields).some(Boolean)) setError(caught.message);
      } else setError(t("common.error"));
    } finally { setBusy(false); }
  }

  async function archive() {
    NativeAlert.alert(
      t("groups.archiveTitle") || "Archive group",
      t("groups.archiveConfirm") || "Archive this group? Participants and history are preserved.",
      [
        { text: t("common.cancel") || "Cancel", style: "cancel" },
        { text: t("groups.archive") || "Archive", style: "destructive", onPress: async () => {
          setArchiving(true);
          try { await api.post(endpoints.groupArchive(groupId), {}); onSaved(); }
          catch (caught) { setError(caught instanceof ApiError ? caught.message : t("common.error")); }
          finally { setArchiving(false); }
        }},
      ],
    );
  }

  async function restore() {
    setBusy(true);
    try { await api.post(endpoints.groupRestore(groupId), {}); onSaved(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : t("common.error")); }
    finally { setBusy(false); }
  }

  return (
    <>
      <SectionCard title={t("groups.configuration") || "Configuration"}>
        <Alert message={error} />
        <View style={styles.form}>
          <Field error={fieldErrors.name} label={t("groups.name")} value={name} onChangeText={setName} />

          <Text style={styles.formLabel}>{t("groups.actions") || "Actions"}</Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("kiosk.checkIn") || "Check-in"}</Text>
            <Text style={styles.toggleValue} onPress={() => setActions((a) => ({ ...a, check_in_enabled: !a.check_in_enabled }))}>
              {actions.check_in_enabled ? (t("security.enabled") || "ON") : (t("security.notEnabled") || "OFF")}
            </Text>
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("kiosk.checkOut") || "Check-out"}</Text>
            <Text style={styles.toggleValue} onPress={() => setActions((a) => ({ ...a, check_out_enabled: !a.check_out_enabled }))}>
              {actions.check_out_enabled ? (t("security.enabled") || "ON") : (t("security.notEnabled") || "OFF")}
            </Text>
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("kiosk.breaks") || "Breaks"}</Text>
            <Text style={styles.toggleValue} onPress={() => setActions((a) => ({ ...a, breaks_enabled: !a.breaks_enabled, max_breaks: a.breaks_enabled ? null : 1 }))}>
              {actions.breaks_enabled ? (t("security.enabled") || "ON") : (t("security.notEnabled") || "OFF")}
            </Text>
          </View>
          {actions.breaks_enabled ? (
            <Field label={t("kiosk.maxBreaks") || "Max breaks"} value={String(actions.max_breaks || 1)} onChangeText={(v) => setActions((a) => ({ ...a, max_breaks: Math.min(3, Math.max(1, Number(v) || 1)) }))} keyboardType="number-pad" />
          ) : null}

          <Text style={styles.formLabel}>{t("groups.participation") || "Participation"}</Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("groups.requireEmail") || "Require email"}</Text>
            <Text style={styles.toggleValue} onPress={() => setParticipation((p) => ({ ...p, email_required: !p.email_required }))}>
              {participation.email_required ? (t("security.enabled") || "ON") : (t("security.notEnabled") || "OFF")}
            </Text>
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("groups.requirePin") || "Require PIN"}</Text>
            <Text style={styles.toggleValue} onPress={() => setParticipation((p) => ({ ...p, pin_required: !p.pin_required }))}>
              {participation.pin_required ? (t("security.enabled") || "ON") : (t("security.notEnabled") || "OFF")}
            </Text>
          </View>

          <Field label={t("groups.forwardEmails") || "Forward emails"} value={forwardEmails} onChangeText={setForwardEmails} hint={t("groups.forwardEmailsHint") || "Comma-separated email addresses"} autoCapitalize="none" keyboardType="email-address" />

          <Button label={busy ? (t("groups.saving") || "Saving...") : (t("groups.save") || "Save")} loading={busy} disabled={busy} onPress={() => void save()} />
        </View>
      </SectionCard>

      {group.status === "active" ? (
        <Button label={archiving ? (t("groups.archiving") || "Archiving...") : (t("groups.archive") || "Archive group")} variant="danger" onPress={archive} disabled={archiving} />
      ) : (
        <Button label={t("groups.restore") || "Restore group"} onPress={() => void restore()} disabled={busy} />
      )}
    </>
  );
}

function KioskSection({ groupId, group, api, t, canKiosk, canConfigure, router }: { groupId: string; group: Group; api: any; t: (key: string, vars?: Record<string, string | number>) => string; canKiosk: boolean; canConfigure: boolean; router: any }) {
  return (
    <SectionCard title="Kiosk">
      {canKiosk ? (
        <Button label={t("kiosk.open")} onPress={() => router.push(`/kiosk/${groupId}`)} />
      ) : null}
      {canConfigure ? (
        <View style={{ marginTop: space.sm }}>
          <Button label={t("kiosk.settings")} variant="secondary" onPress={() => router.push(`/(app)/group/${groupId}/kiosk-settings`)} />
        </View>
      ) : null}
      {canConfigure ? (
        <View style={{ marginTop: space.sm }}>
          <Button label={t("kiosk.design") || "Kiosk design"} variant="secondary" onPress={() => router.push(`/(app)/group/${groupId}/kiosk-design` as any)} />
        </View>
      ) : null}
    </SectionCard>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <View style={styles.info}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { padding: 0 },
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg },
  pills: { flexDirection: "row", gap: space.sm },
  tabs: { flexDirection: "row", padding: 3, borderRadius: 8, backgroundColor: colors.surfaceSubtle },
  tab: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 6 },
  tabActive: { backgroundColor: colors.surface },
  tabText: { ...type.captionStrong, color: colors.textMuted },
  tabTextActive: { color: colors.blue },
  overviewGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  overviewItem: { minWidth: 80 },
  overviewValue: { fontSize: 28, fontWeight: "700", color: colors.text },
  overviewLabel: { ...type.caption, color: colors.textMuted },
  info: { minHeight: 44, justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  infoLabel: { ...type.caption, color: colors.textMuted },
  infoValue: { ...type.bodyStrong, color: colors.text, textTransform: "capitalize" },
  participantRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  participantActions: { flexDirection: "row", gap: space.md },
  actionLink: { ...type.captionStrong, color: colors.blue },
  sheet: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.md },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { ...type.headline, color: colors.text },
  sheetClose: { ...type.captionStrong, color: colors.blue },
  form: { gap: space.md },
  formLabel: { ...type.label, color: colors.textSecondary, marginTop: space.sm },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  toggleLabel: { ...type.body, color: colors.text },
  toggleValue: { ...type.bodyStrong, color: colors.blue },
  clearRow: { flexDirection: "row", alignItems: "center" },
  clearToggle: { ...type.captionStrong, color: colors.danger },
  memberList: { maxHeight: 200 },
  memberOption: { paddingVertical: space.sm, paddingHorizontal: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, borderRadius: 8 },
  memberOptionSelected: { backgroundColor: colors.blueSoft },
  memberOptionText: { ...type.body, color: colors.text },
  memberOptionTextSelected: { color: colors.blue, fontWeight: "600" },
  emptyText: { ...type.caption, color: colors.textMuted, paddingVertical: space.lg, textAlign: "center" },
  addEmailLink: { ...type.captionStrong, color: colors.blue, marginTop: space.xs },
});
