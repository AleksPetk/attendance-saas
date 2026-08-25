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
