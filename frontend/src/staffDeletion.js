export function staffAccountLifecycleAction(account, planLocked = false) {
  const inactive = account?.status === "inactive";
  return {
    label: inactive ? "Reactivate" : "Deactivate",
    disabled: inactive && Boolean(planLocked),
  };
}

export function canPermanentlyDeleteStaffAccount(account) {
  return account?.status === "inactive";
}

export function staffDeleteConfirmation(account) {
  if (!account) return null;
  return {
    title: "Permanently delete account?",
    body: `Permanently delete the ${account.role} account “${account.username}”? Its sign-in credentials and private access assignments will be removed. This action cannot be undone.`,
    confirmLabel: "Delete permanently",
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
