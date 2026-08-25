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
