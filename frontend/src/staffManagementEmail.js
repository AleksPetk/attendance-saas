/** Staff-management email field rules (UI hints only; backend is authoritative). */

export const STAFF_EMAIL_DUPLICATE_MESSAGE =
  "An account with this email already exists in this workspace.";

export function staffEmailFieldLabel(role) {
  return role === "admin" ? "Email" : "Email (optional)";
}

export function isStaffEmailRequired(role) {
  return role === "admin";
}
