import { useCallback, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ApiError, endpoints } from "@checkstation/api";
import {
  ACTIVE_STANDARD_GROUPS,
  ARCHIVED_GROUPS,
  canManageGroupConfiguration,
  canManageOwnerAccount,
  enabledGroupActions,
  filterAndSortGroups,
  groupCapacityNotice,
  groupParticipantCounts,
  groupUsageMetrics,
  hasPlanFeature,
  isGroupScopedStaff,
  isPlanLocked,
  partitionByPlanLock,
  planLimitValue,
  selectionRequired,
  workspacePlanDisplayName,
  type GroupSortOrder,
  type GroupTypeFilter,
} from "@checkstation/domain";
import { Alert, LoadingState, Screen } from "../../../src/components/ui";
import { AddButton, EmptyPanel, FilterTabs, PageHeader, SearchField, StatusPill } from "../../../src/components/mobile";
import { CapacityMeter } from "../../../src/components/CapacityMeter";
import { PlanCapacityNotice, PlanLockSelectionPanel } from "../../../src/components/PlanCapacity";
import { useApp } from "../../../src/lib/AppProvider";
import { useFormFactor } from "../../../src/lib/formFactor";
import { topComfortGap } from "../../../src/components/safeArea";
import { colors, radii, space, type } from "../../../src/theme/tokens";

type Group = {
  id: number;
  name: string;
  status?: string;
  group_type?: string;
  participant_count?: number;
  member_count?: number;
  group_only_participant_count?: number;
  is_plan_locked?: boolean;
  plan_unlocked?: boolean;
  created_at?: string;
  actions?: { check_in_enabled?: boolean; check_out_enabled?: boolean; breaks_enabled?: boolean; max_breaks?: number | null };
  readiness?: { setup_complete?: boolean };
};
type Status = "active" | "archived";

const TYPES: GroupTypeFilter[] = ["all", "standard", "structured"];
const SORTS: GroupSortOrder[] = ["newest", "oldest", "participants_desc", "participants_asc", "structured_first", "standard_first", "name_asc", "name_desc"];

export default function GroupsScreen() {
  const { api, authState, revision, t } = useApp();
  const { tablet, columns } = useFormFactor();
  const [rows, setRows] = useState<Group[]>([]);
  const [status, setStatus] = useState<Status>("active");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<GroupTypeFilter>("all");
  const [sort, setSort] = useState<GroupSortOrder>("newest");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectionOpen, setSelectionOpen] = useState(false);
  const canConfigure = canManageGroupConfiguration(authState.session);
  const staffScoped = isGroupScopedStaff(authState.session);
  const owner = canManageOwnerAccount(authState.session);
  const structuredAccess = hasPlanFeature(authState.session, "structured_groups");
  const selectionKind = status === "archived" ? ARCHIVED_GROUPS : ACTIVE_STANDARD_GROUPS;
  const mustSelect = owner && selectionRequired(authState.session, selectionKind);
  const planName = workspacePlanDisplayName(authState.session);
  const selectionLimit = planLimitValue(authState.session, selectionKind);
  const generation = useRef(0);

  const load = useCallback(async (refresh = false, term = search, nextStatus = status) => {
    const request = ++generation.current;
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    const params = new URLSearchParams({ status: nextStatus });
    if (term.trim()) params.set("search", term.trim());
    try {
      const next = await api.get<Group[]>(`${endpoints.groups()}?${params.toString()}`);
      if (request === generation.current) setRows(next);
    } catch (caught) {
      if (request === generation.current) setError(caught instanceof ApiError ? caught.message : t("common.error"));
    } finally {
      if (request === generation.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [api, search, status, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load, revision]));

  const visible = filterAndSortGroups(rows, { type, sort });
  const entitlements = authState.session?.workspace?.entitlements;
  const standardUsage = groupUsageMetrics(entitlements?.usage_totals?.active_standard_groups ?? entitlements?.usage?.active_standard_groups, entitlements?.limits?.active_standard_groups);
  const structuredUsage = groupUsageMetrics(entitlements?.usage_totals?.active_structured_groups ?? entitlements?.usage?.active_structured_groups, entitlements?.limits?.active_structured_groups);
  const { available, locked } = partitionByPlanLock(visible);
  const showPlanSections = available.length > 0 && locked.length > 0;

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, tablet && styles.contentTablet]} keyboardDismissMode="on-drag" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.blue} />}>
        <PageHeader
          title={t("groups.title")}
          description={staffScoped ? t("groups.staffDescription") : t("groups.description")}
          action={canConfigure && status === "active" && !mustSelect ? <AddButton label={t("groups.add")} onPress={() => router.push("/(app)/group/new")} /> : undefined}
        />
        <View style={[styles.usage, tablet && styles.usageTablet]}>
          {standardUsage ? <CapacityMeter count={standardUsage.count} label={t("groups.standardGroups")} limit={standardUsage.limit} remainingLabel={t("groups.usageSummary", { count: standardUsage.count, remaining: standardUsage.remaining })} /> : null}
          {structuredUsage ? <CapacityMeter count={structuredUsage.count} label={t("groups.structuredGroups")} limit={structuredUsage.limit} remainingLabel={t("groups.usageSummary", { count: structuredUsage.count, remaining: structuredUsage.remaining })} /> : null}
        </View>
        {mustSelect && !selectionOpen ? (
          <PlanCapacityNotice
            actionLabel={t(status === "archived" ? "groups.planSelection.chooseArchived" : "groups.planSelection.chooseButton")}
            hint={t("groups.planSelection.hint")}
            notice={groupCapacityNotice(t, { archived: status === "archived", planName, limit: selectionLimit })}
            onChoose={() => setSelectionOpen(true)}
            title={t("groups.planSelection.needsDecision")}
          />
        ) : null}
        {selectionOpen && mustSelect ? (
          <PlanLockSelectionPanel
            description={t(status === "archived" ? "groups.planSelection.panelDescriptionArchived" : "groups.planSelection.panelDescriptionActive")}
            kind={selectionKind}
            onCancel={() => setSelectionOpen(false)}
            onResolved={() => { setSelectionOpen(false); void load(true); }}
            title={t(status === "archived" ? "groups.planSelection.chooseArchived" : "groups.planSelection.chooseButton")}
          />
        ) : null}
        <FilterTabs onChange={(next) => { setStatus(next); setSelectionOpen(false); }} options={[{ value: "active", label: t("groups.active") }, { value: "archived", label: t("groups.archived") }]} selected="brand" value={status} />
        <SearchField onChangeText={setSearch} onSubmitEditing={() => void load(false)} placeholder={t("groups.searchPlaceholder")} value={search} />
        <ChipRow label={t("groups.filterType")} onChange={setType} options={TYPES.map((value) => ({ value, label: typeLabel(value, t) }))} value={type} />
        <ChipRow label={t("groups.filterSort")} onChange={setSort} options={SORTS.map((value) => ({ value, label: sortLabel(value, t) }))} value={sort} />
        <Alert message={error} />
        {loading ? <View style={styles.loading}><LoadingState label={t("groups.loading")} /></View> : visible.length === 0 ? (
          <EmptyPanel
            body={search ? t("groups.emptyFilteredBody") : staffScoped ? t("groups.emptyStaffBody") : status === "active" ? t("groups.emptyActiveBody") : t("groups.emptyArchivedBody")}
            icon="layers-outline"
            title={search ? t("groups.emptyFilteredTitle") : staffScoped ? t("groups.emptyStaffTitle") : status === "active" ? t("groups.emptyActiveTitle") : t("groups.emptyArchivedTitle")}
          />
        ) : showPlanSections ? (
          <>
            <GroupGrid columns={columns} groups={available} status={status} mustSelect={mustSelect} structuredAccess={structuredAccess} t={t} title={t("groups.sections.available")} />
            <GroupGrid columns={columns} groups={locked} status={status} mustSelect={mustSelect} structuredAccess={structuredAccess} t={t} title={t("groups.sections.locked")} />
          </>
        ) : (
          <GroupGrid columns={columns} groups={visible} status={status} mustSelect={mustSelect} structuredAccess={structuredAccess} t={t} />
        )}
      </ScrollView>
    </Screen>
  );
}

function GroupGrid({
  groups,
  columns,
  status,
  mustSelect,
  structuredAccess,
  t,
  title,
}: {
  groups: Group[];
  columns: number;
  status: Status;
  mustSelect: boolean;
  structuredAccess: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
  title?: string;
}) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={[styles.grid, columns > 1 && styles.gridMulti]}>
        {groups.map((group) => (
          <View key={group.id} style={columns > 1 ? { width: columns === 3 ? "32%" : "48%" } : undefined}>
            <GroupCard group={group} mustSelect={mustSelect} status={status} structuredAccess={structuredAccess} t={t} />
          </View>
        ))}
      </View>
    </View>
  );
}

function GroupCard({
  group,
  status,
  mustSelect,
  structuredAccess,
  t,
}: {
  group: Group;
  status: Status;
  mustSelect: boolean;
  structuredAccess: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const locked = isPlanLocked(group);
  const structured = group.group_type === "structured";
  const structuredFeatureLocked = structured && !structuredAccess;
  const blocked = locked || mustSelect;
  const incomplete = status === "active" && group.readiness && !group.readiness.setup_complete;
  const counts = groupParticipantCounts(group);
  const actions = enabledGroupActions(group.actions);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked }}
      disabled={blocked}
      onPress={() => router.push(`/(app)/group/${group.id}`)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, blocked && styles.cardMuted]}
    >
      <View style={[styles.groupIcon, structured && styles.structuredIcon]}>
        <Ionicons color={structured ? colors.blue : colors.green} name={structured ? "grid-outline" : "layers-outline"} size={22} />
      </View>
      <View style={styles.cardMain}>
        <View style={styles.cardTop}>
          <Text numberOfLines={1} style={styles.name}>{group.name}</Text>
          {locked ? <StatusPill label={t("groups.planLocked")} tone="warning" /> : incomplete ? <StatusPill label={t("groups.setupIncomplete")} tone="warning" /> : status === "archived" ? <StatusPill label={t("groups.archivedLabel")} /> : <StatusPill label={t("groups.activeLabel")} tone="green" />}
        </View>
        <Text style={styles.meta}>{structured ? t("groups.structuredGroup") : t("groups.standardGroup")} · {t("groups.groupId", { id: group.id })}</Text>
        <Text style={styles.meta}>{t("groups.participantComposition", { total: counts.total, members: counts.members, groupOnly: counts.groupOnly })}</Text>
        <Text style={styles.id}>{actions.length ? actions.map((action) => action.kind === "breaks" ? t("groups.breaksAction", { max: action.maxBreaks }) : t(action.kind === "check_in" ? "groups.checkInAction" : "groups.checkOutAction")).join(" · ") : t("groups.noAttendanceActions")}</Text>
        {locked ? <Text style={styles.lockedCopy}>{structuredFeatureLocked ? t("groups.upgradeForStructured") : t("groups.planLockedCopy")}</Text> : null}
      </View>
      <Ionicons color={colors.textMuted} name={blocked ? "lock-closed-outline" : "chevron-forward"} size={18} />
    </Pressable>
  );
}

function ChipRow<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <View style={styles.chipBlock}>
      <Text style={styles.chipLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
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

function typeLabel(value: GroupTypeFilter, t: (key: string) => string) {
  if (value === "standard") return t("groups.standard");
  if (value === "structured") return t("groups.structured");
  return t("groups.allGroups");
}

function sortLabel(value: GroupSortOrder, t: (key: string) => string) {
  if (value === "oldest") return t("groups.oldest");
  if (value === "participants_desc") return t("groups.mostParticipants");
  if (value === "participants_asc") return t("groups.fewestParticipants");
  if (value === "structured_first") return t("groups.structuredFirst");
  if (value === "standard_first") return t("groups.standardFirst");
  if (value === "name_asc") return t("groups.nameAsc");
  if (value === "name_desc") return t("groups.nameDesc");
  return t("groups.newest");
}

const styles = StyleSheet.create({
  screen: { padding: 0 },
  content: { padding: space.lg, paddingTop: topComfortGap, paddingBottom: space.xxxl, gap: space.lg, width: "100%", maxWidth: 720, alignSelf: "center" },
  contentTablet: { maxWidth: 1120 },
  usage: { gap: space.md },
  usageTablet: { flexDirection: "row" },
  chipBlock: { gap: space.xs },
  chipLabel: { ...type.captionStrong, color: colors.textSecondary },
  chips: { gap: space.sm },
  chip: { minHeight: 36, justifyContent: "center", paddingHorizontal: space.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  chipText: { ...type.captionStrong, color: colors.textSecondary },
  chipTextActive: { color: colors.bluePressed },
  loading: { minHeight: 260 },
  section: { gap: space.sm },
  sectionTitle: { ...type.bodyStrong, color: colors.text },
  grid: { gap: space.md },
  gridMulti: { flexDirection: "row", flexWrap: "wrap" },
  card: { minHeight: 94, flexDirection: "row", alignItems: "flex-start", gap: space.md, padding: space.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface },
  cardPressed: { backgroundColor: colors.surfaceMuted },
  cardMuted: { opacity: 0.72 },
  groupIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" },
  structuredIcon: { backgroundColor: colors.blueSoft },
  cardMain: { flex: 1, gap: 3 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  name: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
  meta: { ...type.caption, color: colors.textSecondary },
  id: { fontSize: 12, color: colors.textMuted },
  lockedCopy: { ...type.caption, color: colors.warningText, marginTop: space.xs },
});
