import { useCallback, useRef, useState } from "react";
import { Alert as NativeAlert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ApiError, endpoints } from "@checkstation/api";
import {
  ACTIVE_STANDARD_GROUPS,
  ARCHIVED_GROUPS,
  canManageGroupConfiguration,
  canManageOwnerAccount,
  filterAndSortGroups,
  groupCapacityNotice,
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
import { AddButton, EmptyPanel, FilterTabs, PageHeader, SearchField } from "../../../src/components/mobile";
import {
  GroupListRow,
  groupActionSummary,
  groupCompositionLabel,
  type GroupListItem,
  type GroupSwipeableRef,
} from "../../../src/components/GroupListRow";
import { CapacityMeter } from "../../../src/components/CapacityMeter";
import { PlanCapacityNotice, PlanLockSelectionPanel } from "../../../src/components/PlanCapacity";
import { useApp } from "../../../src/lib/AppProvider";
import { useFormFactor } from "../../../src/lib/formFactor";
import { topComfortGap } from "../../../src/components/safeArea";
import { colors, radii, space, type } from "../../../src/theme/tokens";

type Group = GroupListItem & { created_at?: string };
type Status = "active" | "archived";
type LifecycleAction = "archive" | "restore" | "permanently-delete";

const TYPES: GroupTypeFilter[] = ["all", "standard", "structured"];
const SORTS: GroupSortOrder[] = ["newest", "oldest", "participants_desc", "participants_asc", "structured_first", "standard_first", "name_asc", "name_desc"];

export default function GroupsScreen() {
  const { api, authState, revision, refreshWorkspace, t } = useApp();
  const { tablet, columns } = useFormFactor();
  const [rows, setRows] = useState<Group[]>([]);
  const [status, setStatus] = useState<Status>("active");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<GroupTypeFilter>("all");
  const [sort, setSort] = useState<GroupSortOrder>("newest");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const openRowRef = useRef<GroupSwipeableRef | null>(null);
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

  async function lifecycle(group: Group, action: LifecycleAction) {
    setBusyId(group.id);
    setError("");
    try {
      if (action === "archive") await api.post(endpoints.groupArchive(group.id), {});
      else if (action === "restore") await api.post(endpoints.groupRestore(group.id), {});
      else await api.post(endpoints.groupPermanentDelete(group.id), {});
      await refreshWorkspace();
      await load(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("common.error"));
    } finally {
      setBusyId(null);
    }
  }

  function confirmLifecycle(group: Group, action: "archive" | "permanently-delete") {
    NativeAlert.alert(
      t(action === "archive" ? "groups.archiveTitle" : "groups.deleteTitle"),
      t(action === "archive" ? "groups.archiveConfirm" : "groups.deleteConfirm", { name: group.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t(action === "archive" ? "groups.swipeArchive" : "groups.delete"),
          style: "destructive",
          onPress: () => void lifecycle(group, action),
        },
      ],
    );
  }

  const visible = filterAndSortGroups(rows, { type, sort });
  const entitlements = authState.session?.workspace?.entitlements;
  const standardUsage = groupUsageMetrics(entitlements?.usage_totals?.active_standard_groups ?? entitlements?.usage?.active_standard_groups, entitlements?.limits?.active_standard_groups);
  const structuredUsage = groupUsageMetrics(entitlements?.usage_totals?.active_structured_groups ?? entitlements?.usage?.active_structured_groups, entitlements?.limits?.active_structured_groups);
  const { available, locked } = partitionByPlanLock(visible);
  const showPlanSections = available.length > 0 && locked.length > 0;

  const sectionProps = {
    status,
    mustSelect,
    canConfigure,
    structuredAccess,
    busyId,
    openRowRef,
    onArchive: (group: Group) => confirmLifecycle(group, "archive"),
    onRestore: (group: Group) => void lifecycle(group, "restore"),
    onDelete: (group: Group) => confirmLifecycle(group, "permanently-delete"),
    t,
  };

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
            <GroupGrid columns={columns} groups={available} title={t("groups.sections.available")} {...sectionProps} />
            <GroupGrid columns={columns} groups={locked} title={t("groups.sections.locked")} {...sectionProps} />
          </>
        ) : (
          <GroupGrid columns={columns} groups={visible} {...sectionProps} />
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
  canConfigure,
  structuredAccess,
  busyId,
  openRowRef,
  onArchive,
  onRestore,
  onDelete,
  t,
  title,
}: {
  groups: Group[];
  columns: number;
  status: Status;
  mustSelect: boolean;
  canConfigure: boolean;
  structuredAccess: boolean;
  busyId: number | null;
  openRowRef: React.MutableRefObject<GroupSwipeableRef | null>;
  onArchive: (group: Group) => void;
  onRestore: (group: Group) => void;
  onDelete: (group: Group) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  title?: string;
}) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={[styles.grid, columns > 1 && styles.gridMulti]}>
        {groups.map((group) => {
          const planLocked = isPlanLocked(group);
          const blocked = planLocked || mustSelect;
          // Same swipe UX for Standard and Structured; lifecycle endpoints are shared.
          const showSwipeActions = canConfigure && !mustSelect && (status === "archived" || !planLocked);
          return (
            <View key={group.id} style={columns > 1 ? { width: columns === 3 ? "32%" : "48%" } : undefined}>
              <GroupListRow
                group={group}
                status={status}
                blocked={blocked}
                showSwipeActions={showSwipeActions}
                busy={busyId === group.id}
                structuredAccess={structuredAccess}
                archiveLabel={t("groups.swipeArchive")}
                restoreLabel={t("groups.swipeRestore")}
                deleteLabel={t("groups.delete")}
                activeLabel={t("groups.activeLabel")}
                archivedLabel={t("groups.archivedLabel")}
                planLockedLabel={t("groups.planLocked")}
                setupIncompleteLabel={t("groups.setupIncomplete")}
                standardGroupLabel={t("groups.standardGroup")}
                structuredGroupLabel={t("groups.structuredGroup")}
                groupIdLabel={t("groups.groupId", { id: group.id })}
                participantComposition={groupCompositionLabel(group, t)}
                noAttendanceActions={t("groups.noAttendanceActions")}
                planLockedCopy={t("groups.planLockedCopy")}
                upgradeForStructured={t("groups.upgradeForStructured")}
                actionSummary={groupActionSummary(group, t)}
                openRowRef={openRowRef}
                onOpenDetail={() => router.push(`/(app)/group/${group.id}`)}
                onArchive={() => onArchive(group)}
                onRestore={() => onRestore(group)}
                onDelete={() => onDelete(group)}
              />
            </View>
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
});
