import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert as NativeAlert, Keyboard, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import {
  MAX_PARTICIPATION_EMAILS,
  addParticipationEmailSlot,
  canLaunchKiosk,
  canManageGroupConfiguration,
  groupSetupIssueSummary,
  hasPlanFeature,
  isGroupScopedStaff,
  isKioskLaunchBlocked,
  isPlanResourceLocked,
  kioskSettingsReadiness,
  memberParticipationPayload,
  normalizeForwardEmailSlots,
  normalizeParticipationEmailSlots,
  participationEmailsForNewMember,
  removeParticipationEmailSlot,
  savedForwardEmails,
  visitorParticipationPayload,
  type GroupLaunchReadiness,
  type KioskSettingsReadiness,
} from "@checkstation/domain";
import { Alert, Button, Field, LoadingState, Screen } from "../../../src/components/ui";
import { PageHeader, SectionCard, StatusPill } from "../../../src/components/mobile";
import { GroupClasses } from "../../../src/components/GroupClasses";
import { Avatar } from "../../../src/components/Avatar";
import { Ionicons } from "@expo/vector-icons";
import { GroupEmailSender } from "../../../src/components/GroupEmailSender";
import { useApp } from "../../../src/lib/AppProvider";
import { colors, space, type } from "../../../src/theme/tokens";
import type { TextInput } from "react-native";
import { useConfigurationAutosave, type FlushConfiguration } from "../../../src/lib/useConfigurationAutosave";

type GroupActions = { check_in_enabled: boolean; check_out_enabled: boolean; breaks_enabled: boolean; max_breaks: number | null };
type GroupParticipation = { email_required: boolean; pin_required: boolean };
type GroupNotifications = { check_in: { send_email: boolean; email_template: string }; check_out: { send_email: boolean; email_template: string }; break: { send_email: boolean; email_template: string } };
type GroupReadiness = GroupLaunchReadiness & { operational_ready: boolean; missing_email_count: number; missing_pin_count: number };
type GroupStructured = { require_class_pin: boolean; active_section_count: number; participant_count: number } | null;
type Group = { id: number; name: string; status: string; group_type: string; participant_count: number; member_count: number; group_only_participant_count: number; is_plan_locked: boolean; require_class_pin: boolean; actions: GroupActions; participation: GroupParticipation; notifications?: Partial<GroupNotifications>; readiness: GroupReadiness; structured: GroupStructured; created_at: string; updated_at: string; archived_at: string | null; forward_emails: string[]; advanced?: { forward_emails?: string[]; email_sender_ready?: boolean }; email_sender_ready: boolean; kiosk_available: boolean };

type Participant = { id: number; group_participant_code: string; member?: { id: number; name: string; email: string; photo_url: string | null }; name?: string; email?: string; override_name?: string; override_email?: string; participation_emails?: string[]; has_pin: boolean; photo_url?: string | null; status: string; overrides?: { name: string; email: string; has_photo: boolean; photo_url: string | null; has_pin: boolean }; effective?: { name: string; email: string; has_photo: boolean; photo_url: string | null; has_pin: boolean }; participation?: { email: string; emails: string[]; has_pin: boolean; missing_required_fields: string[]; complete: boolean }; setup?: { email: string; emails: string[]; has_pin: boolean; missing_required_fields: string[]; complete: boolean }; _kind?: "member" | "visitor" };
type AvailableMember = { id: number; name: string; email: string; photo_url: string | null; suggested_participation_email: string };
type GroupSection = { id: number; name: string; participant_count: number; has_class_pin: boolean; status: string };

type ActiveSection = "overview" | "people" | "configuration" | "kiosk";

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, authState, t } = useApp();
  const router = useRouter();
  const navigation = useNavigation();
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const scrollToParticipantSection = useCallback((section: View | null) => {
    requestAnimationFrame(() => {
      if (!section || !contentRef.current) return;
      section.measureLayout(contentRef.current, (_x, y) => {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - space.lg), animated: true });
      }, () => {});
    });
  }, []);
  const [group, setGroup] = useState<Group | null>(null);
  const [setupKioskReadiness, setSetupKioskReadiness] = useState<KioskSettingsReadiness | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [planLockedDenied, setPlanLockedDenied] = useState(false);
  const [activeSection, setActiveSection] = useState<ActiveSection>("overview");
  const configurationFlush = useRef<FlushConfiguration | null>(null);
  const leavingConfiguration = useRef(false);
  const [flushingNavigation, setFlushingNavigation] = useState(false);
  const registerConfigurationFlush = useCallback((flush: FlushConfiguration | null) => { configurationFlush.current = flush; }, []);
  const flushConfiguration = useCallback(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return configurationFlush.current ? configurationFlush.current() : true;
  }, []);
  const canConfigure = canManageGroupConfiguration(authState.session);
  const canParticipants = canConfigure || isGroupScopedStaff(authState.session);
  const canKiosk = canLaunchKiosk(authState.session);
  const structuredAccess = hasPlanFeature(authState.session, "structured_groups");
  const forwardEmailsAccess = hasPlanFeature(authState.session, "group_forward_emails");

  const load = useCallback(async () => {
    setLoading(true); setError(""); setPlanLockedDenied(false);
    try {
      const latest = await api.get<Group>(endpoints.group(id));
      setGroup(latest);
      setSetupKioskReadiness(canConfigure && !latest.is_plan_locked && latest.status !== "archived"
        ? kioskSettingsReadiness(await api.get(endpoints.kioskSettings(id)).catch(() => null)) : null);
    }
    catch (caught) {
      setGroup(null);
      if (isPlanResourceLocked(caught)) setPlanLockedDenied(true);
      else setError(caught instanceof ApiError ? caught.message : t("common.error"));
    }
    finally { setLoading(false); }
  }, [api, id, t, canConfigure]);

  const refreshSetup = useCallback(async () => {
    try {
      const latest = await api.get<Group>(endpoints.group(id));
      setGroup(latest);
      setSetupKioskReadiness(canConfigure && !latest.is_plan_locked && latest.status !== "archived"
        ? kioskSettingsReadiness(await api.get(endpoints.kioskSettings(id)).catch(() => null)) : null);
    } catch { /* Keep existing page/error handling; do not interrupt an open form. */ }
  }, [api, id, canConfigure]);

  useFocusEffect(useCallback(() => {
    // A locale/focus refresh must not unmount and discard an autosaving draft.
    if (configurationFlush.current) void refreshSetup();
    else void load();
  }, [load, refreshSetup]));
  useEffect(() => { if (activeSection !== "overview") void refreshSetup(); }, [activeSection, refreshSetup]);
  // Register with Expo Router's native-stack context before a native Back/swipe.
  // Replay only the prevented action; issuing router.back() here would double-pop.
  usePreventRemove(activeSection === "configuration", ({ data }) => {
    if (leavingConfiguration.current) return;
    leavingConfiguration.current = true;
    setFlushingNavigation(true);
    void flushConfiguration().then((saved) => {
      if (saved) { Keyboard.dismiss(); navigation.dispatch(data.action); }
    }).finally(() => { leavingConfiguration.current = false; setFlushingNavigation(false); });
  });

  if (loading) return <Screen><LoadingState label={t("groups.loading")} /></Screen>;
  if (planLockedDenied) return <Screen style={styles.lockedScreen}><Alert variant="warning" message={`${t("groups.detail.planLockedTitle")}\n${t("groups.detail.planLockedHint")}`} /><Button label={t("groups.back")} variant="secondary" onPress={() => router.back()} /></Screen>;
  if (!group) return <Screen><Alert message={error || t("common.error")} /></Screen>;

  const locked = group.is_plan_locked;
  const archived = group.status === "archived";
  const structured = group.group_type === "structured";
  const incomplete = !locked && !archived && group.readiness && !group.readiness.setup_complete;
  const setupSummary = !locked && !archived ? groupSetupIssueSummary(group.readiness, setupKioskReadiness, t) : "";

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
  async function selectSection(next: ActiveSection) {
    if (activeSection !== "configuration" || next === activeSection) {
      setActiveSection(next);
      return;
    }
    if (leavingConfiguration.current) return;
    leavingConfiguration.current = true;
    setFlushingNavigation(true);
    try { if (await flushConfiguration()) { Keyboard.dismiss(); setActiveSection(next); } }
    finally { leavingConfiguration.current = false; setFlushingNavigation(false); }
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView ref={scrollRef} automaticallyAdjustKeyboardInsets={activeSection === "people" || activeSection === "configuration"} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <View ref={contentRef} collapsable={false} pointerEvents={flushingNavigation ? "none" : "auto"} style={styles.content}>
        <PageHeader title={group.name} />
        <Alert message={error} />

        <View style={styles.headerMeta}>
          <StatusPill label={structured ? t("groups.structured") : t("groups.standard")} tone="blue" />
          <StatusPill label={archived ? t("groups.archivedLabel") : t("groups.activeLabel")} tone={archived ? "neutral" : "green"} />
          {locked ? <StatusPill label={t("groups.planLocked")} tone="warning" /> : incomplete || setupSummary ? <StatusPill label={t("groups.setupIncomplete")} tone="warning" /> : null}
        </View>

        {setupSummary ? <View accessibilityLiveRegion="polite" style={styles.setupSummary}>
          <Text style={styles.setupSummaryText}>{setupSummary}</Text>
        </View> : null}

        <View accessibilityRole="tablist" style={styles.detailTabs}>
          {sections.map((s) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeSection === s.key }}
              key={s.key}
              onPress={() => selectSection(s.key)}
              style={({ pressed }) => [styles.detailTab, activeSection === s.key && styles.detailTabActive, pressed && styles.tabPressed]}
            >
              <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={[styles.detailTabText, activeSection === s.key && styles.detailTabTextActive]}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {activeSection === "overview" && (
          <OverviewSection group={group} t={t} />
        )}

        {activeSection === "people" && (
          structured ? <GroupClasses groupId={id} canManage={canConfigure && !locked && !archived && structuredAccess} renderParticipants={(section) => <PeopleSection key={section.id} groupId={`${id}/classes/${section.id}`} group={group} api={api} t={t} scrollToSection={scrollToParticipantSection} onReadinessChange={refreshSetup} canConfigure={canParticipants && !locked && !archived && section.status === "active"} />} /> : <PeopleSection groupId={id} group={group} api={api} t={t} scrollToSection={scrollToParticipantSection} onReadinessChange={refreshSetup} canConfigure={canParticipants && !locked && !archived} />
        )}

        {activeSection === "configuration" && canConfigure && !locked && (
          <ConfigurationSection groupId={id} group={group} api={api} t={t} structuredAccess={structuredAccess} forwardEmailsAccess={forwardEmailsAccess} onFlushReady={registerConfigurationFlush} onSaved={() => void refreshSetup()} />
        )}

        {activeSection === "kiosk" && !locked && !archived && (
          <KioskSection groupId={id} group={group} api={api} t={t} canKiosk={canKiosk} canConfigure={canConfigure} router={router} />
        )}
        </View>
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

function PeopleSection({ groupId, group, api, t, canConfigure, scrollToSection, onReadinessChange }: { groupId: string; group: Group; api: any; t: (key: string, vars?: Record<string, string | number>) => string; canConfigure: boolean; scrollToSection: (section: View | null) => void; onReadinessChange: () => Promise<void> }) {
  const editRef = useRef<View>(null);
  const addRef = useRef<View>(null);
  const scrollToAddPending = useRef(false);
  const scrollToEditPending = useRef(false);
  const listRef = useRef<View>(null);
  const returnToList = useRef(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const structured = group.group_type === "structured";
  function closeEdit() {
    Keyboard.dismiss();
    setEditingParticipant(null);
    returnToList.current = true;
    scrollToSection(listRef.current);
  }

  const loadParticipants = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [memberships, visitors] = await Promise.all([
        api.get(endpoints.groupMemberships(groupId)) as Promise<Participant[]>,
        api.get(endpoints.groupParticipants(groupId)) as Promise<Participant[]>,
      ]);
      setParticipants([...memberships.map((m: Participant) => ({ ...m, _kind: "member" as const })),
        ...visitors.map((v: Participant) => ({ ...v, _kind: "visitor" as const }))]);
      void onReadinessChange();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); }
    finally { setLoading(false); }
  }, [api, groupId, t, onReadinessChange]);

  useFocusEffect(useCallback(() => { void loadParticipants(); }, [loadParticipants]));

  if (loading) return <LoadingState label={t("common.loading")} />;

  return (
    <>
      <View ref={listRef} collapsable={false} onLayout={() => {
        if (returnToList.current) { returnToList.current = false; scrollToSection(listRef.current); }
      }}>
      <SectionCard
        title={t("groups.participantLabel") || "People"}
        description={t("groups.participants", { count: participants.length })}
      >
        <Alert message={error} />
        {!error && participants.length === 0 ? (
          <Text style={styles.emptyText}>{t("groups.noParticipants") || "No participants yet."}</Text>
        ) : (
          participants.map((p) => (
            <View key={`${p._kind}-${p.id}`} style={styles.participantRow}>
              <Avatar
                name={p.effective?.name || p.name || p.member?.name || ""}
                url={p.effective?.photo_url || p.photo_url || p.member?.photo_url}
                size={40}
              />
              <View style={styles.participantCopy}>
                <Text style={styles.participantName}>{p.effective?.name || p.name || p.member?.name || ""}</Text>
                <Text style={styles.participantCode}>{p.group_participant_code}{p._kind === "visitor" ? ` · ${t("groups.visitor") || "Visitor"}` : ""}</Text>
              </View>
              {canConfigure && p.status === "active" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t("common.edit")} ${p.effective?.name || p.name || p.member?.name || ""}`}
                  onPress={() => {
                    Keyboard.dismiss();
                    scrollToEditPending.current = true;
                    setEditingParticipant(p);
                    // The same participant can be opened again without a new layout.
                    if (editingParticipant === p) {
                      scrollToEditPending.current = false;
                      scrollToSection(editRef.current);
                    }
                  }}
                  style={({ pressed }) => [styles.participantEdit, pressed && { backgroundColor: colors.blueSoft }]}
                >
                  <Ionicons name="create-outline" size={22} color={colors.primary} />
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </SectionCard>
      </View>
      {canConfigure ? (
        <Button label={t("groups.addParticipant") || "Add participant"} onPress={() => {
          Keyboard.dismiss();
          if (showAddSheet) {
            scrollToSection(addRef.current);
          } else {
            scrollToAddPending.current = true;
            setShowAddSheet(true);
          }
        }} variant="secondary" />
      ) : null}

      {showAddSheet ? (
        <View ref={addRef} collapsable={false} onLayout={() => {
          if (scrollToAddPending.current) {
            scrollToAddPending.current = false;
            scrollToSection(addRef.current);
          }
        }}>
        <AddParticipantSheet
          groupId={groupId}
          group={group}
          api={api}
          t={t}
          onClose={() => setShowAddSheet(false)}
          onSaved={() => { void loadParticipants(); }}
        />
        </View>
      ) : null}

      {editingParticipant ? (
        <View key={`${editingParticipant._kind}-${editingParticipant.id}`} ref={editRef} collapsable={false} onLayout={() => {
          if (scrollToEditPending.current) {
            scrollToEditPending.current = false;
            scrollToSection(editRef.current);
          }
        }}>
        <EditParticipantSheet
          participant={editingParticipant}
          groupId={groupId}
          group={group}
          api={api}
          t={t}
          onClose={closeEdit}
          onSaved={() => { closeEdit(); void loadParticipants(); }}
        />
        </View>
      ) : null}
    </>
  );
}

function AddParticipantSheet({ groupId, group, api, t, onClose, onSaved }: { groupId: string; group: Group; api: any; t: (key: string, vars?: Record<string, string | number>) => string; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<"member" | "visitor">("member");
  const [availableMembers, setAvailableMembers] = useState<AvailableMember[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [participationEmails, setParticipationEmails] = useState<string[]>([""]);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (mode === "member") {
      void (api.get(endpoints.groupAvailableMembers(groupId)) as Promise<AvailableMember[]>).then(setAvailableMembers).catch((caught) => setError(caught instanceof Error ? caught.message : t("common.error")));
    }
  }, [api, groupId, mode]);

  async function submit() {
    setBusy(true); setError(""); setSuccess(""); setFieldErrors({});
    try {
      if (mode === "member") {
        if (!selectedMemberId) { setError(t("groups.selectMember") || "Select a member"); setBusy(false); return; }
        await api.post(endpoints.groupMemberships(groupId), memberParticipationPayload(selectedMemberId, participationEmails, pin));
        setSelectedMemberId(null);
        setParticipationEmails([""]);
        setPin("");
        const next = await api.get(endpoints.groupAvailableMembers(groupId)) as AvailableMember[];
        setAvailableMembers(next);
      } else {
        await api.post(endpoints.groupParticipants(groupId), visitorParticipationPayload(name, participationEmails, pin));
        setName("");
        setParticipationEmails([""]);
        setPin("");
      }
      onSaved();
      setSuccess(t("groups.participantAdded") || "Participant added");
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
      <Alert message={success} variant="success" />

      {mode === "member" ? (
        <View style={styles.form}>
          <Text style={styles.formLabel}>{t("groups.selectMember") || "Select member"}</Text>
          <ScrollView style={styles.memberList}>
            {availableMembers.map((m) => (
              <View key={m.id} style={[styles.memberOption, selectedMemberId === m.id && styles.memberOptionSelected]}>
                <Text style={[styles.memberOptionText, selectedMemberId === m.id && styles.memberOptionTextSelected]} onPress={() => { setSelectedMemberId(m.id); setParticipationEmails(participationEmailsForNewMember(m)); setPin(""); setSuccess(""); }}>{m.name} ({m.email})</Text>
              </View>
            ))}
            {availableMembers.length === 0 ? <Text style={styles.emptyText}>{t("groups.noAvailableMembers") || "No members available"}</Text> : null}
          </ScrollView>
          <ParticipationEmailsField emails={participationEmails} required={group.participation.email_required} error={fieldErrors.participation_emails || fieldErrors.participation_email} onChange={setParticipationEmails} t={t} />
          <Field label={t("kiosk.pin") || "PIN"} value={pin} onChangeText={setPin} secureTextEntry placeholder={t("groups.optionalPin") || "Optional PIN"} />
          <Button label={busy ? (t("groups.saving") || "Saving...") : (t("groups.add") || "Add")} loading={busy} disabled={busy || !selectedMemberId} onPress={() => void submit()} />
        </View>
      ) : (
        <View style={styles.form}>
          <Field error={fieldErrors.name} label={t("members.name")} value={name} onChangeText={setName} />
          <ParticipationEmailsField emails={participationEmails} required={group.participation.email_required} error={fieldErrors.participation_emails || fieldErrors.email} onChange={setParticipationEmails} t={t} />
          <Field label={t("kiosk.pin") || "PIN"} value={pin} onChangeText={setPin} secureTextEntry placeholder={t("groups.optionalPin") || "Optional PIN"} />
          <Button label={busy ? (t("groups.saving") || "Saving...") : (t("groups.add") || "Add")} loading={busy} disabled={busy || !name.trim()} onPress={() => void submit()} />
        </View>
      )}
    </View>
  );
}

function ParticipationEmailsField({ emails, onChange, t, required = false, error }: { emails: string[]; onChange: (emails: string[]) => void; t: (key: string, vars?: Record<string, string | number>) => string; required?: boolean; error?: string }) {
  const update = (index: number, value: string) => {
    const next = [...emails];
    next[index] = value;
    onChange(next);
  };
  return (
    <View>
      <Text style={styles.formLabel}>{t("groups.participationEmails") || "Notification emails"}</Text>
      {emails.map((email, i) => (
        <View key={i} style={styles.participationEmailRow}>
          <Field containerStyle={styles.forwardEmailField} error={i === 0 ? error : undefined} autoCapitalize="none" keyboardType="email-address" label={`${t("auth.email")} ${i + 1}`} value={email} onChangeText={(v) => update(i, v)} />
          {i > 0 ? <Pressable onPress={() => onChange(removeParticipationEmailSlot(emails, i))}><Text style={styles.removeEmailText}>{t("common.remove")}</Text></Pressable> : null}
        </View>
      ))}
      {required ? <Text style={styles.settingHint}>{t("groups.required")}</Text> : null}
      {emails.length < MAX_PARTICIPATION_EMAILS ? <Text style={styles.addEmailLink} onPress={() => onChange(addParticipationEmailSlot(emails))}>{t("groups.addAnotherEmail") || "+ Add email"}</Text> : null}
    </View>
  );
}

function EditParticipantSheet({ participant, groupId, group, api, t, onClose, onSaved }: { participant: Participant; groupId: string; group: Group; api: any; t: (key: string, vars?: Record<string, string | number>) => string; onClose: () => void; onSaved: () => void }) {
  const isVisitor = (participant as any)._kind === "visitor";
  const [name, setName] = useState(isVisitor ? participant.name || "" : participant.override_name || "");
  const [participationEmails, setParticipationEmails] = useState<string[]>(normalizeParticipationEmailSlots(participant.participation?.emails || participant.participation_emails));
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
      const formData = new FormData();
      formData.append(isVisitor ? "name" : "override_name", name.trim());
      formData.append("participation_emails", JSON.stringify(participationEmails.map((email) => email.trim()).filter(Boolean)));
      if (pin.trim()) formData.append("participation_pin", pin.trim());
      if (clearPin) formData.append("clear_participation_pin", "true");
      await api.request(isVisitor ? endpoints.groupParticipant(groupId, participant.id) : endpoints.groupMembership(groupId, participant.id), { method: "PATCH", formData });
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
          <Field error={fieldErrors.name} label={t("members.name")} value={name} onChangeText={setName} />
        ) : (
          <Field error={fieldErrors.override_name} label={`${t("members.name")} (${t("groups.override") || "override"})`} value={name} onChangeText={setName} hint={t("groups.overrideHint") || "Leave empty to use Member profile"} />
        )}
        <ParticipationEmailsField emails={participationEmails} required={group.participation.email_required} error={fieldErrors.participation_emails || fieldErrors.participation_email} onChange={setParticipationEmails} t={t} />
        <Field label={t("groups.newPin") || "New PIN"} value={pin} onChangeText={setPin} secureTextEntry placeholder={t("groups.optionalPin") || "Leave empty to keep current"} />
        {participant.participation?.has_pin || participant.has_pin ? (
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

const DEFAULT_NOTIFICATIONS: GroupNotifications = {
  check_in: { send_email: false, email_template: "{name} checked in at {time}." },
  check_out: { send_email: false, email_template: "{name} checked out at {time}." },
  break: { send_email: false, email_template: "{name} started a break at {time}." },
};
function resolvedNotifications(group: Group): GroupNotifications {
  return {
    check_in: { ...DEFAULT_NOTIFICATIONS.check_in, ...(group.notifications?.check_in || {}) },
    check_out: { ...DEFAULT_NOTIFICATIONS.check_out, ...(group.notifications?.check_out || {}) },
    break: { ...DEFAULT_NOTIFICATIONS.break, ...(group.notifications?.break || {}) },
  };
}

function ConfigurationSection({ groupId, group, api, t, structuredAccess, forwardEmailsAccess, onFlushReady, onSaved }: { groupId: string; group: Group; api: any; t: (key: string, vars?: Record<string, string | number>) => string; structuredAccess: boolean; forwardEmailsAccess: boolean; onFlushReady: (flush: FlushConfiguration | null) => void; onSaved: () => void }) {
  const [name, setName] = useState(group.name);
  const [actions, setActions] = useState(group.actions);
  const [participation, setParticipation] = useState(group.participation);
  const [notifications, setNotifications] = useState<GroupNotifications>(() => resolvedNotifications(group));
  const [senderReady, setSenderReady] = useState(Boolean(group.email_sender_ready || group.advanced?.email_sender_ready));
  const [requireClassPin, setRequireClassPin] = useState(group.require_class_pin);
  const [forwardEmails, setForwardEmails] = useState<string[]>(() => normalizeForwardEmailSlots(group.forward_emails || group.advanced?.forward_emails));
  const [baseline, setBaseline] = useState(() => JSON.stringify({
    name: group.name.trim(), actions: group.actions, participation: group.participation,
    notifications: resolvedNotifications(group), requireClassPin: group.require_class_pin,
    forwardEmails: savedForwardEmails(group.forward_emails || group.advanced?.forward_emails || []),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [archiving, setArchiving] = useState(false);
  const snapshot = useMemo(() => JSON.stringify({
    name: name.trim(), actions, participation, notifications, requireClassPin,
    forwardEmails: savedForwardEmails(forwardEmails),
  }), [actions, forwardEmails, name, notifications, participation, requireClassPin]);
  const dirty = snapshot !== baseline;
  const currentSnapshot = useRef(snapshot);
  currentSnapshot.current = snapshot;
  const autosave = useConfigurationAutosave({ snapshot, dirty, immediateKey: JSON.stringify({ actions, participation, requireClassPin, enabled: Object.values(notifications).map((n) => n.send_email), emailSlots: forwardEmails.length }), save });
  useEffect(() => { onFlushReady(autosave.flush); return () => onFlushReady(null); }, [autosave.flush, onFlushReady]);

  function setNotification(action: keyof GroupNotifications, enabled: boolean) {
    if (enabled && !senderReady) {
      NativeAlert.alert(t("groups.notifications"), t("groups.afterActionBlocked"));
      return;
    }
    setNotifications((current) => ({ ...current, [action]: { ...current[action], send_email: enabled } }));
    if (enabled) setParticipation((current) => ({ ...current, email_required: true }));
  }

  async function save(): Promise<boolean> {
    setBusy(true); setError(""); setSuccess(""); setFieldErrors({});
    if (!name.trim()) {
      setFieldErrors({ name: t("groups.nameRequired") });
      setError(t("groups.nameRequired"));
      setBusy(false);
      return false;
    }
    try {
      const nextActions = {
        check_in_enabled: actions.check_in_enabled,
        check_out_enabled: actions.check_out_enabled,
        breaks_enabled: actions.breaks_enabled,
        max_breaks: actions.breaks_enabled ? Math.min(3, Math.max(1, Number(actions.max_breaks) || 1)) : null,
      };
      const payload: Record<string, unknown> = {
        name: name.trim(),
        actions: nextActions,
        participation,
        notifications,
        advanced: { forward_emails: forwardEmailsAccess ? savedForwardEmails(forwardEmails) : savedForwardEmails(group.forward_emails || group.advanced?.forward_emails || []) },
      };
      if (group.group_type === "structured" && structuredAccess) payload.require_class_pin = requireClassPin;
      const updated = await api.patch(endpoints.group(groupId), payload) as Group;
      const nextNotifications = resolvedNotifications(updated);
      const nextForward = normalizeForwardEmailSlots(updated.forward_emails || updated.advanced?.forward_emails);
      // Apply backend-normalized values, but never overwrite newer local edits.
      if (currentSnapshot.current === snapshot) {
        setName(updated.name); setActions(updated.actions); setParticipation(updated.participation);
        setNotifications(nextNotifications); setForwardEmails(nextForward); setRequireClassPin(updated.require_class_pin);
      }
      setBaseline(JSON.stringify({ name: updated.name.trim(), actions: updated.actions, participation: updated.participation, notifications: nextNotifications, requireClassPin: updated.require_class_pin, forwardEmails: savedForwardEmails(nextForward) }));
      onSaved();
      return true;
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fields = fieldErrorsFromBody(caught.data);
        setFieldErrors(fields);
        setError(caught.message);
      } else setError(t("common.error"));
      return false;
    } finally { setBusy(false); }
  }

  async function archive() {
    NativeAlert.alert(
      t("groups.archiveTitle") || "Archive group",
      t("groups.archiveConfirm") || "Archive this group? Participants and history are preserved.",
      [
        { text: t("common.cancel") || "Cancel", style: "cancel" },
        { text: t("groups.archive") || "Archive", style: "destructive", onPress: async () => {
          if (!(await autosave.flush())) return;
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
      <Alert message={error} />
      <Text accessibilityLiveRegion="polite" style={styles.settingHint}>{autosave.status === "saving" ? t("groups.savingChanges") : autosave.status === "saved" ? t("common.saved") : ""}</Text>

      <SectionCard title={t("groups.groupSection")} description={t("groups.groupSectionHint")}>
        <View style={styles.form}>
          <Field error={fieldErrors.name} label={t("groups.name")} value={name} onChangeText={setName} returnKeyType="done" onBlur={() => void autosave.flush()} />
          <View style={styles.readOnlyRow}>
            <View style={styles.settingCopy}>
              <Text style={styles.settingLabel}>{t("groups.groupType")}</Text>
              <Text style={styles.settingHint}>{t("groups.groupTypeImmutable")}</Text>
            </View>
            <StatusPill label={group.group_type === "structured" ? t("groups.structured") : t("groups.standard")} tone="blue" />
          </View>
        </View>
      </SectionCard>

      <SectionCard title={t("groups.actions")} description={t("groups.actionsHint")}>
        <View style={styles.settingsList}>
          <SettingSwitch label={t("kiosk.checkIn")} value={actions.check_in_enabled} onValueChange={(value) => setActions((current) => ({ ...current, check_in_enabled: value }))} />
          <SettingSwitch label={t("kiosk.checkOut")} value={actions.check_out_enabled} onValueChange={(value) => setActions((current) => ({ ...current, check_out_enabled: value }))} />
          <SettingSwitch label={t("kiosk.breaks")} value={actions.breaks_enabled} onValueChange={(value) => setActions((current) => ({ ...current, breaks_enabled: value, max_breaks: value ? current.max_breaks || 1 : null }))} />
          {actions.breaks_enabled ? (
            <View style={styles.choiceSetting}>
              <Text style={styles.settingLabel}>{t("kiosk.maxBreaks")}</Text>
              <View accessibilityRole="radiogroup" style={styles.choiceRow}>
                {[1, 2, 3].map((count) => (
                  <Pressable accessibilityRole="radio" accessibilityState={{ checked: actions.max_breaks === count }} key={count} onPress={() => setActions((current) => ({ ...current, max_breaks: count }))} style={[styles.choice, actions.max_breaks === count && styles.choiceActive]}>
                    <Text style={[styles.choiceText, actions.max_breaks === count && styles.choiceTextActive]}>{count}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </SectionCard>

      <SectionCard title={t("groups.participation")} description={t("groups.participationHint")}>
        <View style={styles.settingsList}>
          <SettingSwitch label={t("groups.requireEmail")} value={participation.email_required} onValueChange={(value) => setParticipation((current) => ({ ...current, email_required: value }))} />
          <SettingSwitch label={t("groups.requirePin")} value={participation.pin_required} onValueChange={(value) => setParticipation((current) => ({ ...current, pin_required: value }))} />
          {group.group_type === "structured" && structuredAccess ? (
            <SettingSwitch label={t("groups.requireClassPin")} value={requireClassPin} onValueChange={setRequireClassPin} />
          ) : null}
        </View>
      </SectionCard>

      <SectionCard title={t("groups.afterAction")} description={t("groups.afterActionHint")}>
        {!senderReady ? <Text style={styles.settingHint}>{t("groups.afterActionBlocked")}</Text> : null}
        <View style={styles.settingsList}>
          {actions.check_in_enabled ? <NotificationSetting label={t("groups.afterCheckIn")} value={notifications.check_in} disabled={!senderReady} onEnabled={(value) => setNotification("check_in", value)} onMessage={(value) => setNotifications((current) => ({ ...current, check_in: { ...current.check_in, email_template: value } }))} onBlur={() => void autosave.flush()} t={t} /> : null}
          {actions.check_out_enabled ? <NotificationSetting label={t("groups.afterCheckOut")} value={notifications.check_out} disabled={!senderReady} onEnabled={(value) => setNotification("check_out", value)} onMessage={(value) => setNotifications((current) => ({ ...current, check_out: { ...current.check_out, email_template: value } }))} onBlur={() => void autosave.flush()} t={t} /> : null}
          {actions.breaks_enabled ? <NotificationSetting label={t("groups.afterBreak")} value={notifications.break} disabled={!senderReady} onEnabled={(value) => setNotification("break", value)} onMessage={(value) => setNotifications((current) => ({ ...current, break: { ...current.break, email_template: value } }))} onBlur={() => void autosave.flush()} t={t} /> : null}
        </View>
      </SectionCard>

      <GroupEmailSender groupId={groupId} onReadyChange={setSenderReady} />

      <SectionCard title={t("groups.forwardEmails")} description={forwardEmailsAccess ? t("groups.forwardEmailsHint") : t("groups.notificationsHint")}>
        {forwardEmailsAccess ? (
          <View style={styles.forwardEmailList}>
            {forwardEmails.map((email, index) => (
              <View key={`forward-email-${index}`} style={styles.forwardEmailRow}>
                <Field
                  autoCapitalize="none"
                  autoCorrect={false}
                  containerStyle={styles.forwardEmailField}
                  error={index === 0 ? fieldErrors.forward_emails : undefined}
                  onBlur={() => void autosave.flush()}
                  keyboardType="email-address"
                  label={forwardEmails.length > 1 ? t("groups.forwardEmailNumbered", { number: index + 1 }) : t("groups.forwardEmail")}
                  onChangeText={(value) => setForwardEmails((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))}
                  placeholder={t("groups.forwardEmailsPlaceholder")}
                  value={email}
                />
                {forwardEmails.length > 1 ? (
                  <Pressable accessibilityLabel={`${t("groups.remove")} ${index + 1}`} accessibilityRole="button" hitSlop={8} onPress={() => setForwardEmails((current) => normalizeForwardEmailSlots(current.filter((_, itemIndex) => itemIndex !== index)))} style={({ pressed }) => [styles.removeEmail, pressed && styles.tabPressed]}>
                    <Text style={styles.removeEmailText}>{t("groups.remove")}</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            {forwardEmails.length < MAX_PARTICIPATION_EMAILS ? (
              <Pressable accessibilityRole="button" onPress={() => setForwardEmails((current) => [...current, ""])} style={({ pressed }) => [styles.addEmailButton, pressed && styles.tabPressed]}>
                <Text style={styles.addEmailButtonText}>{t("groups.addAnotherForwardEmail")}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.lockedSetting}>
            <Text style={styles.settingLabel}>{t("groups.forwardEmails")}</Text>
            <Text style={styles.settingHint}>{t("groups.forwardEmailsLockedHint")}</Text>
          </View>
        )}
      </SectionCard>


      <View style={styles.dangerZone}>
        <Text style={styles.dangerTitle}>{t("groups.dangerZone")}</Text>
        <Text style={styles.dangerHint}>{group.status === "active" ? t("groups.archiveHint") : t("groups.restoreHint")}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={archiving || busy}
          onPress={group.status === "active" ? archive : () => void restore()}
          style={({ pressed }) => [styles.dangerAction, pressed && styles.dangerActionPressed, (archiving || busy) && styles.disabledAction]}
        >
          <Text style={styles.dangerActionText}>
            {group.status === "active" ? (archiving ? t("groups.archiving") : t("groups.archive")) : t("groups.restore")}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

function NotificationSetting({ label, value, disabled, onEnabled, onMessage, onBlur, t }: { label: string; value: { send_email: boolean; email_template: string }; disabled: boolean; onEnabled: (enabled: boolean) => void; onMessage: (message: string) => void; onBlur: () => void; t: (key: string) => string }) {
  return <View style={styles.notificationSetting}>
    <SettingSwitch label={label} value={value.send_email} disabled={disabled} onValueChange={onEnabled} />
    {value.send_email ? <Field multiline label={t("groups.emailMessage")} hint={t("groups.emailMessageHint")} value={value.email_template} onChangeText={onMessage} onBlur={onBlur} /> : null}
  </View>;
}

function SettingSwitch({ label, hint, value, onValueChange, disabled = false }: { label: string; hint?: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingCopy}>
        <Text style={styles.settingLabel}>{label}</Text>
        {hint ? <Text style={styles.settingHint}>{hint}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        ios_backgroundColor={colors.borderStrong}
        onValueChange={onValueChange}
        trackColor={{ false: colors.borderStrong, true: colors.blue }}
        thumbColor={colors.surface}
        value={value}
      />
    </View>
  );
}

function KioskSection({ groupId, group, api, t, canKiosk, canConfigure, router }: { groupId: string; group: Group; api: any; t: (key: string, vars?: Record<string, string | number>) => string; canKiosk: boolean; canConfigure: boolean; router: any }) {
  const [readiness, setReadiness] = useState<KioskSettingsReadiness | null>(null);
  const [loading, setLoading] = useState(canConfigure);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!canConfigure) { setLoading(false); return; }
    setLoading(true); setError("");
    try { setReadiness(kioskSettingsReadiness(await api.get(endpoints.kioskSettings(groupId)))); }
    catch (caught) { setReadiness(null); setError(caught instanceof Error ? caught.message : t("common.error")); }
    finally { setLoading(false); }
  }, [api, canConfigure, groupId, t]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const blocked = isKioskLaunchBlocked({ groupReadiness: group.readiness, canInspectKioskSettings: canConfigure, settingsLoading: loading, kioskReadiness: readiness });
  return (
    <SectionCard title="Kiosk">
      <Alert message={error} />
      {canKiosk ? (
        <Button disabled={blocked} label={t("groups.launchKiosk")} onPress={() => { if (!blocked) router.push(`/kiosk/${groupId}`); }} />
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
  lockedScreen: { gap: space.md, justifyContent: "center" },
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg },
  headerMeta: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: -space.sm },
  setupSummary: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A", borderWidth: 1, borderRadius: 10, paddingHorizontal: space.md, paddingVertical: space.sm, gap: 2, marginTop: -space.sm, marginBottom: -space.sm },
  setupSummaryText: { ...type.caption, color: colors.text, flexShrink: 1 },
  detailTabs: { flexDirection: "row", padding: 3, borderRadius: 10, backgroundColor: colors.surfaceSubtle },
  detailTab: { flex: 1, minWidth: 0, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 8, paddingHorizontal: 3 },
  detailTabActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  detailTabText: { fontSize: 12, fontWeight: "600", lineHeight: 16, color: colors.textMuted, textAlign: "center" },
  detailTabTextActive: { color: colors.bluePressed },
  tabPressed: { opacity: 0.7 },
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
  participantRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 64, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  participantCopy: { flex: 1, minWidth: 0, gap: space.xs },
  participantName: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
  participantCode: { ...type.caption, color: colors.textMuted, flexShrink: 1 },
  participantEdit: { width: 44, height: 44, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.primarySoft },
  actionLink: { ...type.captionStrong, color: colors.blue },
  sheet: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.md },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { ...type.headline, color: colors.text },
  sheetClose: { ...type.captionStrong, color: colors.blue },
  form: { gap: space.md },
  formLabel: { ...type.label, color: colors.textSecondary, marginTop: space.sm },
  settingsList: { marginHorizontal: -space.lg, marginVertical: -space.sm },
  settingRow: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  settingCopy: { flex: 1, gap: 2 },
  settingLabel: { ...type.body, color: colors.text },
  settingHint: { ...type.caption, color: colors.textMuted },
  readOnlyRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: space.md, paddingTop: space.xs },
  choiceSetting: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  choiceRow: { flexDirection: "row", gap: space.sm },
  choice: { width: 48, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  choiceActive: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  choiceText: { ...type.bodyStrong, color: colors.textSecondary },
  choiceTextActive: { color: colors.bluePressed },
  forwardEmailList: { gap: space.md },
  forwardEmailRow: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  participationEmailRow: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  forwardEmailField: { flex: 1 },
  removeEmail: { minHeight: 44, justifyContent: "center", paddingHorizontal: space.xs, marginBottom: 1 },
  removeEmailText: { ...type.captionStrong, color: colors.dangerText },
  addEmailButton: { alignSelf: "flex-start", minHeight: 40, justifyContent: "center", paddingHorizontal: space.xs },
  addEmailButtonText: { ...type.captionStrong, color: colors.blue },
  lockedSetting: { gap: space.xs, paddingVertical: space.sm },
  dangerZone: { borderRadius: 14, borderWidth: 1, borderColor: colors.dangerBorder, backgroundColor: colors.surface, padding: space.lg, gap: space.sm },
  dangerTitle: { ...type.bodyStrong, color: colors.dangerText },
  dangerHint: { ...type.caption, color: colors.textMuted },
  dangerAction: { alignSelf: "flex-start", minHeight: 40, justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: colors.dangerBorder, paddingHorizontal: space.lg, backgroundColor: colors.dangerSoft },
  dangerActionPressed: { backgroundColor: colors.dangerBorder },
  dangerActionText: { ...type.captionStrong, color: colors.dangerText },
  disabledAction: { opacity: 0.5 },
  clearRow: { flexDirection: "row", alignItems: "center" },
  clearToggle: { ...type.captionStrong, color: colors.danger },
  memberList: { maxHeight: 200 },
  memberOption: { paddingVertical: space.sm, paddingHorizontal: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, borderRadius: 8 },
  memberOptionSelected: { backgroundColor: colors.blueSoft },
  memberOptionText: { ...type.body, color: colors.text },
  memberOptionTextSelected: { color: colors.blue, fontWeight: "600" },
  emptyText: { ...type.caption, color: colors.textMuted, paddingVertical: space.lg, textAlign: "center" },
  addEmailLink: { ...type.captionStrong, color: colors.blue, marginTop: space.xs },
  notificationSetting: { paddingHorizontal: space.lg, paddingVertical: space.xs, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  readinessIssues: { gap: space.xs, marginBottom: space.md },
});
