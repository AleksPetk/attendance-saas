/** UI helpers for Account page settings sections (no API or auth logic). */

export const DEFAULT_ACCOUNT_ACCORDION_STATE = {
  emailExpanded: false,
  passwordExpanded: false,
};

export function toggleAccountAccordionSection(state, section) {
  if (section === "email") {
    return { ...state, emailExpanded: !state.emailExpanded };
  }
  if (section === "password") {
    return { ...state, passwordExpanded: !state.passwordExpanded };
  }
  return state;
}

function backupStatusLabel(backupStatus) {
  if (backupStatus === "verified") return "Verified";
  if (backupStatus === "pending") return "Pending";
  return "Not added";
}

export function emailAccordionStatusSummary(account) {
  if (!account) return "";
  const loginStatus = account.email_verified ? "Verified" : "Unverified";
  const backupLabel = backupStatusLabel(account.backup_email_status || "none");
  return `Login: ${loginStatus}\nBackup: ${backupLabel}`;
}

export function emailAccordionStatusPills(account) {
  if (!account) return [];
  const pills = [
    {
      label: account.email_verified ? "Verified" : "Unverified",
      variant: account.email_verified ? "live" : "default",
    },
  ];
  const backupStatus = account.backup_email_status || "none";
  if (backupStatus === "verified") {
    pills.push({ label: "Backup verified", variant: "live" });
  } else if (backupStatus === "pending") {
    pills.push({ label: "Backup pending", variant: "default" });
  } else {
    pills.push({ label: "No backup", variant: "default" });
  }
  return pills;
}

export function twoFactorStatusPills(twoFactorStatus) {
  const status = twoFactorStatus || "not_enabled";
  return [
    { label: "Recommended", variant: "pro" },
    {
      label: status === "enabled" ? "Enabled" : "Not enabled",
      variant: status === "enabled" ? "live" : "default",
    },
  ];
}
