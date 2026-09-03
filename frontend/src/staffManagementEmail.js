/** Staff-management email field rules (UI hints only; backend is authoritative). */

import i18n from "./i18n/index.js";

export function staffEmailDuplicateMessage() {
  return i18n.t("staff:email.duplicate");
}

export function staffEmailFieldLabel(role) {
  return role === "admin"
    ? i18n.t("staff:email.label")
    : i18n.t("staff:email.labelOptional");
}

export function isStaffEmailRequired(role) {
  return role === "admin";
}
