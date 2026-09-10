export type GroupTypeFilter = "all" | "standard" | "structured";
export type GroupSortOrder = "newest" | "oldest" | "participants_desc" | "participants_asc" | "structured_first" | "standard_first" | "name_asc" | "name_desc";

export type GroupListItem = {
  name?: string;
  group_type?: string;
  created_at?: string;
  participant_count?: number;
  member_count?: number;
  group_only_participant_count?: number;
  actions?: GroupAttendanceActions | null;
};

export type GroupAttendanceActions = {
  check_in_enabled?: boolean;
  check_out_enabled?: boolean;
  breaks_enabled?: boolean;
  max_breaks?: number | null;
};

export type EnabledGroupAction =
  | { kind: "check_in" }
  | { kind: "check_out" }
  | { kind: "breaks"; maxBreaks: number };

export function enabledGroupActions(actions: GroupAttendanceActions | null | undefined): EnabledGroupAction[] {
  if (!actions) return [];
  const enabled: EnabledGroupAction[] = [];
  if (actions.check_in_enabled) enabled.push({ kind: "check_in" });
  if (actions.check_out_enabled) enabled.push({ kind: "check_out" });
  if (actions.breaks_enabled) enabled.push({ kind: "breaks", maxBreaks: positiveInteger(actions.max_breaks, 1) });
  return enabled;
}

export function groupParticipantCounts(group: GroupListItem) {
  const members = nonNegativeNumber(group.member_count);
  const groupOnly = nonNegativeNumber(group.group_only_participant_count);
  const suppliedTotal = Number(group.participant_count);
  return {
    total: Number.isFinite(suppliedTotal) && suppliedTotal >= 0 ? suppliedTotal : members + groupOnly,
    members,
    groupOnly,
  };
}

export function groupUsageMetrics(count: number | null | undefined, limit: number | null | undefined) {
  if (!Number.isFinite(count) || !Number.isFinite(limit)) return null;
  const normalizedCount = Math.max(0, Number(count));
  const normalizedLimit = Math.max(0, Number(limit));
  return {
    count: normalizedCount,
    limit: normalizedLimit,
    remaining: Math.max(0, normalizedLimit - normalizedCount),
    percentage: normalizedLimit === 0 ? normalizedCount > 0 ? 100 : 0 : Math.min(100, (normalizedCount / normalizedLimit) * 100),
  };
}

export function filterAndSortGroups<T extends GroupListItem>(groups: T[], { type = "all", sort = "newest" }: { type?: GroupTypeFilter; sort?: GroupSortOrder } = {}): T[] {
  const filtered = groups.filter((group) => type === "all" || (type === "structured" ? group.group_type === "structured" : group.group_type !== "structured"));
  return [...filtered].sort((left, right) => {
    switch (sort) {
      case "oldest": return createdAt(left) - createdAt(right) || compareNames(left, right);
      case "participants_desc": return participantCount(right) - participantCount(left) || newest(left, right);
      case "participants_asc": return participantCount(left) - participantCount(right) || newest(left, right);
      case "structured_first": return Number(left.group_type !== "structured") - Number(right.group_type !== "structured") || newest(left, right);
      case "standard_first": return Number(left.group_type === "structured") - Number(right.group_type === "structured") || newest(left, right);
      case "name_asc": return compareNames(left, right);
      case "name_desc": return compareNames(right, left);
      default: return newest(left, right);
    }
  });
}

function name(group: GroupListItem) { return String(group.name || ""); }
function createdAt(group: GroupListItem) { const timestamp = Date.parse(group.created_at || ""); return Number.isFinite(timestamp) ? timestamp : 0; }
function participantCount(group: GroupListItem) { const count = Number(group.participant_count ?? 0); return Number.isFinite(count) ? count : 0; }
function compareNames(left: GroupListItem, right: GroupListItem) { return name(left).localeCompare(name(right), undefined, { sensitivity: "base", numeric: true }); }
function newest(left: GroupListItem, right: GroupListItem) { return createdAt(right) - createdAt(left) || compareNames(left, right); }
function nonNegativeNumber(value: number | null | undefined) { const number = Number(value ?? 0); return Number.isFinite(number) ? Math.max(0, number) : 0; }
function positiveInteger(value: number | null | undefined, fallback: number) { const number = Number(value); return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback; }
