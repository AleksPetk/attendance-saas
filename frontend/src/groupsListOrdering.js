/** Split Groups list into available vs plan-locked buckets (order preserved). */

export function isGroupPlanLocked(group) {
  return Boolean(group?.is_plan_locked || group?.plan_unlocked === false);
}

export function partitionGroupsByPlanAvailability(groups) {
  const available = [];
  const locked = [];
  for (const group of Array.isArray(groups) ? groups : []) {
    if (isGroupPlanLocked(group)) {
      locked.push(group);
    } else {
      available.push(group);
    }
  }
  return { available, locked };
}

export function participantSummaryForGroup(group) {
  const count = Number(group?.participant_count ?? 0);
  return {
    translationKey:
      group?.group_type === "structured" ? "participants.count" : "participants.summary",
    values: {
      total: count,
      count,
      members: Number(group?.member_count ?? 0),
      groupOnly: Number(group?.group_only_participant_count ?? 0),
    },
  };
}

function groupName(group) {
  return String(group?.name || "");
}

function groupCreatedAt(group) {
  const timestamp = Date.parse(group?.created_at || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function groupParticipantCount(group) {
  const count = Number(group?.participant_count ?? 0);
  return Number.isFinite(count) ? count : 0;
}

function compareNames(left, right) {
  return groupName(left).localeCompare(groupName(right), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

function compareNewest(left, right) {
  return groupCreatedAt(right) - groupCreatedAt(left) || compareNames(left, right);
}

export function filterAndSortGroups(groups, { type = "all", sort = "newest" } = {}) {
  const filtered = (Array.isArray(groups) ? groups : []).filter((group) => {
    if (type === "standard") return group?.group_type !== "structured";
    if (type === "structured") return group?.group_type === "structured";
    return true;
  });

  return filtered.sort((left, right) => {
    switch (sort) {
      case "oldest":
        return groupCreatedAt(left) - groupCreatedAt(right) || compareNames(left, right);
      case "participants_desc":
        return groupParticipantCount(right) - groupParticipantCount(left) || compareNewest(left, right);
      case "participants_asc":
        return groupParticipantCount(left) - groupParticipantCount(right) || compareNewest(left, right);
      case "structured_first":
        return (
          Number(left?.group_type !== "structured") -
            Number(right?.group_type !== "structured") || compareNewest(left, right)
        );
      case "standard_first":
        return (
          Number(left?.group_type === "structured") -
            Number(right?.group_type === "structured") || compareNewest(left, right)
        );
      case "name_asc":
        return compareNames(left, right);
      case "name_desc":
        return compareNames(right, left);
      case "newest":
      default:
        return compareNewest(left, right);
    }
  });
}

export function groupUsageMetrics(count, limit) {
  if (!Number.isFinite(count) || !Number.isFinite(limit)) return null;
  const normalizedCount = Math.max(0, count);
  const normalizedLimit = Math.max(0, limit);
  return {
    count: normalizedCount,
    limit: normalizedLimit,
    remaining: Math.max(0, normalizedLimit - normalizedCount),
    percentage:
      normalizedLimit === 0
        ? normalizedCount > 0
          ? 100
          : 0
        : Math.min(100, (normalizedCount / normalizedLimit) * 100),
  };
}
