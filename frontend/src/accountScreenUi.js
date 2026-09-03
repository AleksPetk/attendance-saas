/** UI helpers for Account page settings sections (no API or auth logic). */

import i18n from "./i18n/index.js";

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
  if (backupStatus === "verified") return i18n.t("account:emailStatus.verified");
  if (backupStatus === "pending") return i18n.t("account:emailStatus.pending");
  return i18n.t("account:emailStatus.notAdded");
}

export function emailAccordionStatusSummary(account) {
  if (!account) return "";
  const loginStatus = account.email_verified
    ? i18n.t("account:emailStatus.verified")
    : i18n.t("account:emailStatus.unverified");
  const backupLabel = backupStatusLabel(account.backup_email_status || "none");
  return `${i18n.t("account:emailStatus.loginSummary", { status: loginStatus })}\n${i18n.t("account:emailStatus.backupSummary", { status: backupLabel })}`;
}

export function emailAccordionStatusPills(account) {
  if (!account) return [];
  const pills = [
    {
      label: account.email_verified
        ? i18n.t("account:emailStatus.verified")
        : i18n.t("account:emailStatus.unverified"),
      variant: account.email_verified ? "live" : "default",
    },
  ];
  const backupStatus = account.backup_email_status || "none";
  if (backupStatus === "verified") {
    pills.push({ label: i18n.t("account:emailStatus.backupVerified"), variant: "live" });
  } else if (backupStatus === "pending") {
    pills.push({ label: i18n.t("account:emailStatus.backupPending"), variant: "default" });
  } else {
    pills.push({ label: i18n.t("account:emailStatus.noBackup"), variant: "default" });
  }
  return pills;
}

export function twoFactorStatusPills(twoFactorStatus) {
  const status = twoFactorStatus || "not_enabled";
  return [
    { label: i18n.t("account:twoFactor.recommended"), variant: "pro" },
    {
      label:
        status === "enabled"
          ? i18n.t("account:twoFactor.enabled")
          : i18n.t("account:twoFactor.notEnabled"),
      variant: status === "enabled" ? "live" : "default",
    },
  ];
}
