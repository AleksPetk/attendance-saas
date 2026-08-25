/** Split Workspace Staff/Admin accounts by plan availability (order preserved). */

export function isStaffAccountPlanLocked(account) {
  return Boolean(account?.is_plan_locked || account?.plan_unlocked === false);
}

export function partitionStaffByPlanAvailability(accounts) {
  const availableAdmins = [];
  const availableStaff = [];
  const lockedAdmins = [];
  const lockedStaff = [];
  for (const account of Array.isArray(accounts) ? accounts : []) {
    const locked = isStaffAccountPlanLocked(account);
    if (account.role === "admin") {
      (locked ? lockedAdmins : availableAdmins).push(account);
    } else {
      (locked ? lockedStaff : availableStaff).push(account);
    }
  }
  return { availableAdmins, availableStaff, lockedAdmins, lockedStaff };
}
