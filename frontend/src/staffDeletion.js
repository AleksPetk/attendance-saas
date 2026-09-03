import i18n from "./i18n/index.js";

export function staffAccountLifecycleAction(account, planLocked = false) {
  const inactive = account?.status === "inactive";
  return {
    label: inactive
      ? i18n.t("staff:lifecycle.reactivate")
      : i18n.t("staff:lifecycle.deactivate"),
    disabled: inactive && Boolean(planLocked),
  };
}

export function canPermanentlyDeleteStaffAccount(account) {
  return account?.status === "inactive";
}

export function staffDeleteConfirmation(account) {
  if (!account) return null;
  const bodyKey =
    account.role === "admin" ? "staff:delete.bodyAdmin" : "staff:delete.bodyStaff";
  return {
    title: i18n.t("staff:delete.title"),
    body: i18n.t(bodyKey, { username: account.username }),
    confirmLabel: i18n.t("staff:delete.confirmLabel"),
  };
}

export function removeDeletedStaffAccount(accounts, deletedId) {
  return (accounts || []).filter((account) => account.id !== deletedId);
}

export function canCancelStaffDelete(busy) {
  return !busy;
}

export function canBeginStaffDelete(account, busy) {
  return Boolean(account) && !busy;
}
