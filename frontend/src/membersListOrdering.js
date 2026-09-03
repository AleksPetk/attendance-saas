/** Member list ordering helpers for plan availability sections. */

export function isMemberPlanLocked(member) {
  return Boolean(member?.is_plan_locked || member?.plan_unlocked === false);
}

export function partitionMembersByPlanAvailability(members) {
  const available = [];
  const locked = [];
  for (const member of members || []) {
    if (isMemberPlanLocked(member)) {
      locked.push(member);
    } else {
      available.push(member);
    }
  }
  return { available, locked };
}

function memberName(member) {
  return String(member?.name || "");
}

function memberCreatedAt(member) {
  const timestamp = Date.parse(member?.created_at || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareMemberNames(left, right) {
  return memberName(left).localeCompare(memberName(right), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

function compareNewestMembers(left, right) {
  return memberCreatedAt(right) - memberCreatedAt(left) || compareMemberNames(left, right);
}

function hasProfileValue(value) {
  return Boolean(String(value || "").trim());
}

export function filterAndSortMembers(members, { profile = "all", sort = "newest" } = {}) {
  const filtered = (Array.isArray(members) ? members : []).filter((member) => {
    if (profile === "with_email") return hasProfileValue(member?.email);
    if (profile === "without_email") return !hasProfileValue(member?.email);
    if (profile === "with_phone") return hasProfileValue(member?.phone);
    if (profile === "without_phone") return !hasProfileValue(member?.phone);
    return true;
  });

  return filtered.sort((left, right) => {
    switch (sort) {
      case "oldest":
        return memberCreatedAt(left) - memberCreatedAt(right) || compareMemberNames(left, right);
      case "name_asc":
        return compareMemberNames(left, right);
      case "name_desc":
        return compareMemberNames(right, left);
      case "newest":
      default:
        return compareNewestMembers(left, right);
    }
  });
}
