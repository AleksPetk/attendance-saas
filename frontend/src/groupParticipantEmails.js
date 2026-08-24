/**
 * Participation email helpers for Group/Class participant forms.
 * Prefill is for NEW participation only — never overwrite saved edit values.
 */

export const MAX_PARTICIPATION_EMAILS = 3;

export function emailSlotsFromList(emails) {
  const list = Array.isArray(emails) ? emails.filter((value) => value != null) : [];
  return list.length > 0 ? list.map((value) => String(value)) : [""];
}

export function compactEmailSlots(slots) {
  return (slots || [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

/**
 * First participation email for a newly selected reusable Member.
 * Uses API suggestion when present; otherwise Member profile email.
 * Never invents #2/#3.
 */
export function suggestedFirstParticipationEmail(member) {
  if (!member) {
    return "";
  }
  const suggested = String(member.suggested_participation_email || "").trim();
  if (suggested) {
    return suggested;
  }
  return String(member.email || "").trim();
}

/**
 * Initial participation email slots when selecting a Member for add.
 * Returns [profileEmail] or [""] — never prefills slot 2/3.
 */
export function participationEmailsForNewMember(member) {
  const first = suggestedFirstParticipationEmail(member);
  return first ? [first] : [""];
}

/**
 * Load slots for editing an existing participation — saved list only.
 */
export function participationEmailsForEdit(savedEmails, legacyPrimary = "") {
  if (Array.isArray(savedEmails) && savedEmails.length) {
    return emailSlotsFromList(savedEmails);
  }
  if (legacyPrimary) {
    return [String(legacyPrimary)];
  }
  return [""];
}
