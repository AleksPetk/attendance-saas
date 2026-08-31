export function staffTutorialRequestsGroupAccess(search = "") {
  return new URLSearchParams(search).get("tutorial") === "group-access";
}

export function firstTutorialStaffAccount(accounts) {
  return (Array.isArray(accounts) ? accounts : []).find(
    (account) =>
      account.role === "staff" &&
      !account.is_plan_locked &&
      account.plan_unlocked !== false,
  ) || null;
}
