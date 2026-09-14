import { useCallback, useRef, useState } from "react";
import { Alert as NativeAlert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ApiError, endpoints } from "@checkstation/api";
import {
  MEMBERS,
  canManageOwnerAccount,
  canManageWorkspace,
  canViewGlobalMembers,
  filterAndSortMembers,
  isPlanLocked,
  memberCapacityNotice,
  memberUsageMetrics,
  partitionByPlanLock,
  planLimitValue,
  selectionRequired,
  workspacePlanDisplayName,
  type MemberProfileFilter,
  type MemberSortOrder,
} from "@checkstation/domain";
import { Alert, Button, LoadingState, Screen } from "../../../src/components/ui";
import { AddButton, EmptyPanel, FilterTabs, PageHeader, SearchField, StatusPill } from "../../../src/components/mobile";
import { Avatar } from "../../../src/components/Avatar";
import { CapacityMeter } from "../../../src/components/CapacityMeter";
import { PlanCapacityNotice, PlanLockSelectionPanel } from "../../../src/components/PlanCapacity";
import { useApp } from "../../../src/lib/AppProvider";
import { useFormFactor } from "../../../src/lib/formFactor";
import { topComfortGap } from "../../../src/components/safeArea";
import { colors, radii, space, type } from "../../../src/theme/tokens";

type Member = {
  id: number;
  name: string;
  full_name?: string;
  email?: string;
  phone?: string;
  status?: string;
  photo_url?: string | null;
  is_plan_locked?: boolean;
  plan_unlocked?: boolean;
  created_at?: string;
};
type Status = "active" | "archived";

const PROFILES: MemberProfileFilter[] = ["all", "with_email", "without_email", "with_phone", "without_phone"];
const SORTS: MemberSortOrder[] = ["newest", "oldest", "name_asc", "name_desc"];

export default function MembersScreen() {
  const { api, authState, revision, t } = useApp();
  const { tablet } = useFormFactor();
  const [rows, setRows] = useState<Member[]>([]);
  const [status, setStatus] = useState<Status>("active");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [profile, setProfile] = useState<MemberProfileFilter>("all");
  const [sort, setSort] = useState<MemberSortOrder>("newest");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const allowed = canViewGlobalMembers(authState.session);
  const canManage = canManageWorkspace(authState.session);
  const owner = canManageOwnerAccount(authState.session);
  const mustSelect = owner && selectionRequired(authState.session, MEMBERS);
  const memberLimit = planLimitValue(authState.session, MEMBERS);
  const planName = workspacePlanDisplayName(authState.session);
  const generation = useRef(0);

  const load = useCallback(async (refresh = false, term = appliedSearch, nextStatus = status) => {
    if (!allowed) return;
    const request = ++generation.current;
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    const params = new URLSearchParams({ status: nextStatus });
    if (term.trim()) params.set("search", term.trim());
    try {
      const data = await api.get<Member[] | { results: Member[] }>(`${endpoints.members()}?${params.toString()}`);
      if (request === generation.current) setRows(Array.isArray(data) ? data : data.results || []);
    } catch (caught) {
      if (request === generation.current) setError(caught instanceof ApiError ? caught.message : t("common.error"));
    } finally {
      if (request === generation.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [allowed, api, appliedSearch, status, t]);

  useFocusEffect(useCallback(() => { if (allowed) void load(); }, [allowed, load, revision]));

  if (!allowed) return <Redirect href="/(app)/(tabs)/home" />;

  const visibleRows = filterAndSortMembers(rows, { profile, sort });
  const entitlements = authState.session?.workspace?.entitlements;
  const memberCount = entitlements?.usage_totals?.members;
  const usageLimit = entitlements?.limits?.members;
  const hasMemberLimit = Boolean(entitlements?.limits && Object.prototype.hasOwnProperty.call(entitlements.limits, "members"));
  const usage = memberUsageMetrics(memberCount, usageLimit, { unlimited: hasMemberLimit && usageLimit == null });
  const { available: availableMembers, locked: lockedMembers } = partitionByPlanLock(visibleRows);
  const showPlanSections = status === "active" && availableMembers.length > 0 && lockedMembers.length > 0;
  const filtered = Boolean(appliedSearch) || profile !== "all" || sort !== "newest";

  function applySearch() {
    const next = search.trim();
    if (next === appliedSearch) void load(false, next);
    else setAppliedSearch(next);
  }

  async function lifecycle(member: Member, action: "archive" | "restore" | "permanently-delete") {
    setBusyId(member.id);
    setError("");
    try {
      await api.post(endpoints.member(member.id) + action + "/", {});
      await load(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("common.error"));
    } finally {
      setBusyId(null);
    }
  }

  function confirmLifecycle(member: Member, action: "archive" | "permanently-delete") {
    NativeAlert.alert(
      t(action === "archive" ? "members.archive" : "members.delete"),
      t(action === "archive" ? "members.archiveConfirm" : "members.deleteConfirm", { name: member.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.confirm"), style: "destructive", onPress: () => void lifecycle(member, action) },
      ],
    );
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, tablet && styles.contentTablet]} keyboardDismissMode="on-drag" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.blue} />}>
        <PageHeader
          title={t("members.title")}
          description={t("members.description")}
          action={canManage && !mustSelect ? <AddButton label={t("members.add")} onPress={() => router.push("/(app)/member/new")} /> : undefined}
        />
        {usage ? (
          <CapacityMeter
            count={usage.count}
            label={t("members.usageLabel")}
            limit={usage.unlimited ? null : usage.limit}
            remainingLabel={usage.unlimited ? t("members.unlimited") : typeof usage.remaining === "number" ? t("members.remaining", { count: usage.remaining }) : undefined}
            unlimitedLabel={t("members.unlimited")}
          />
        ) : null}
        {mustSelect && !selectionOpen ? (
          <PlanCapacityNotice
            actionLabel={t("members.planSelection.chooseButton")}
            hint={t("members.planSelection.hint")}
            notice={memberCapacityNotice(t, { planName, limit: memberLimit })}
            onChoose={() => setSelectionOpen(true)}
            title={t("members.planSelection.needsDecision")}
          />
        ) : null}
        {selectionOpen && mustSelect ? (
          <PlanLockSelectionPanel
            description={t("members.planSelection.panelDescription")}
            enableSearch
            kind={MEMBERS}
            onCancel={() => setSelectionOpen(false)}
            onResolved={() => { setSelectionOpen(false); void load(true); }}
            title={t("members.planSelection.panelTitle")}
          />
        ) : null}
        <FilterTabs onChange={(next) => setStatus(next)} options={[{ value: "active", label: t("members.active") }, { value: "archived", label: t("members.archived") }]} selected="brand" value={status} />
        <SearchField onChangeText={setSearch} onSubmitEditing={applySearch} placeholder={t("members.searchPlaceholder")} value={search} />
        <View style={styles.filters}>
          <ChipRow label={t("members.profile")} onChange={setProfile} options={PROFILES.map((value) => ({ value, label: profileLabel(value, t) }))} value={profile} />
          <ChipRow label={t("members.sortBy")} onChange={setSort} options={SORTS.map((value) => ({ value, label: sortLabel(value, t) }))} value={sort} />
        </View>
        <Alert message={error} />
        {loading ? <View style={styles.loading}><LoadingState label={t("members.loading")} /></View> : visibleRows.length === 0 ? (
          <EmptyPanel
            body={filtered ? t("members.emptyFilteredBody") : status === "active" ? t("members.emptyActiveBody") : t("members.emptyArchivedBody")}
            icon="people-outline"
            title={filtered ? t("members.emptyFilteredTitle") : status === "active" ? t("members.emptyActiveTitle") : t("members.emptyArchivedTitle")}
          />
        ) : showPlanSections ? (
          <>
            <MemberSection title={t("members.sections.available")} members={availableMembers} mustSelect={mustSelect} status={status} canManage={canManage} busyId={busyId} onArchive={(member) => confirmLifecycle(member, "archive")} onRestore={(member) => void lifecycle(member, "restore")} onDelete={(member) => confirmLifecycle(member, "permanently-delete")} t={t} />
            <MemberSection title={t("members.sections.locked")} members={lockedMembers} mustSelect={mustSelect} status={status} canManage={canManage} busyId={busyId} onArchive={(member) => confirmLifecycle(member, "archive")} onRestore={(member) => void lifecycle(member, "restore")} onDelete={(member) => confirmLifecycle(member, "permanently-delete")} t={t} />
          </>
        ) : (
          <MemberSection members={visibleRows} mustSelect={mustSelect} status={status} canManage={canManage} busyId={busyId} onArchive={(member) => confirmLifecycle(member, "archive")} onRestore={(member) => void lifecycle(member, "restore")} onDelete={(member) => confirmLifecycle(member, "permanently-delete")} t={t} />
        )}
      </ScrollView>
    </Screen>
  );
}

function MemberSection({
  title,
  members,
  mustSelect,
  status,
  canManage,
  busyId,
  onArchive,
  onRestore,
  onDelete,
  t,
}: {
  title?: string;
  members: Member[];
  mustSelect: boolean;
  status: Status;
  canManage: boolean;
  busyId: number | null;
  onArchive: (member: Member) => void;
  onRestore: (member: Member) => void;
  onDelete: (member: Member) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.list}>
        {members.map((member) => {
          const locked = isPlanLocked(member) && status !== "archived";
          const blocked = locked || mustSelect;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: blocked }}
              disabled={blocked}
              key={member.id}
              onPress={() => router.push(`/(app)/member/${member.id}`)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed, blocked && styles.locked]}
            >
              <Avatar name={member.name} url={member.photo_url} />
              <View style={styles.rowMain}>
                <View style={styles.rowTitleLine}>
                  <Text numberOfLines={1} style={styles.name}>{member.name}</Text>
                  {locked ? <StatusPill label={t("members.planLocked")} tone="warning" /> : status === "archived" ? <StatusPill label={t("members.archivedLabel")} /> : null}
                </View>
                <Text numberOfLines={1} style={styles.secondary}>{member.email || member.phone || t("members.noContact")}</Text>
                {canManage && !mustSelect && !locked ? (
                  <View style={styles.rowActions}>
                    {status === "active" ? (
                      <Button label={t("members.archive")} onPress={() => onArchive(member)} variant="secondary" disabled={busyId === member.id} />
                    ) : (
                      <>
                        <Button label={t("members.restore")} onPress={() => onRestore(member)} variant="secondary" disabled={busyId === member.id} />
                        <Button label={t("members.delete")} onPress={() => onDelete(member)} variant="danger" disabled={busyId === member.id} />
                      </>
                    )}
                  </View>
                ) : null}
              </View>
              <Ionicons color={colors.textMuted} name={blocked ? "lock-closed-outline" : "chevron-forward"} size={18} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ChipRow<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <View style={styles.chipBlock}>
      <Text style={styles.chipLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chips}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable key={option.value} onPress={() => onChange(option.value)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function profileLabel(value: MemberProfileFilter, t: (key: string) => string) {
  if (value === "with_email") return t("members.withEmail");
  if (value === "without_email") return t("members.withoutEmail");
  if (value === "with_phone") return t("members.withPhone");
  if (value === "without_phone") return t("members.withoutPhone");
  return t("members.allMembers");
}

function sortLabel(value: MemberSortOrder, t: (key: string) => string) {
  if (value === "oldest") return t("members.oldest");
  if (value === "name_asc") return t("members.nameAsc");
  if (value === "name_desc") return t("members.nameDesc");
  return t("members.newest");
}

const styles = StyleSheet.create({
  screen: { padding: 0 },
  content: { padding: space.lg, paddingTop: topComfortGap, paddingBottom: space.xxxl, gap: space.lg, width: "100%", maxWidth: 720, alignSelf: "center" },
  contentTablet: { maxWidth: 1120 },
  filters: { gap: space.md, alignSelf: "stretch", width: "100%" },
  chipBlock: { alignSelf: "stretch", width: "100%", minWidth: 0, gap: space.xs },
  chipLabel: { ...type.captionStrong, color: colors.textSecondary },
  chipScroll: { width: "100%", flexGrow: 0 },
  chips: { gap: space.sm, paddingRight: space.xs },
  chip: { minHeight: 36, justifyContent: "center", paddingHorizontal: space.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  chipText: { ...type.captionStrong, color: colors.textSecondary },
  chipTextActive: { color: colors.bluePressed },
  loading: { minHeight: 260 },
  section: { gap: space.sm },
  sectionTitle: { ...type.bodyStrong, color: colors.text },
  list: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: "hidden" },
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  locked: { opacity: 0.65 },
  rowMain: { flex: 1, gap: 3 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  name: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
  secondary: { ...type.caption, color: colors.textMuted },
  rowActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
});
