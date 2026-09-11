export const MAX_PARTICIPATION_EMAILS = 3;

export type AvailableGroupMember = {
  id: number;
  name: string;
  email?: string;
  suggested_participation_email?: string;
};

export function participationEmailsForNewMember(member?: AvailableGroupMember | null): string[] {
  const suggested = String(member?.suggested_participation_email || "").trim();
  const profileEmail = String(member?.email || "").trim();
  return [suggested || profileEmail];
}

export function normalizeParticipationEmailSlots(values?: string[] | null): string[] {
  const slots = (values || []).slice(0, MAX_PARTICIPATION_EMAILS).map((value) => String(value || ""));
  return slots.length ? slots : [""];
}

export function compactParticipationEmails(values: string[]): string[] {
  return values.slice(0, MAX_PARTICIPATION_EMAILS).map((value) => value.trim()).filter(Boolean);
}

export function addParticipationEmailSlot(values: string[]): string[] {
  const slots = normalizeParticipationEmailSlots(values);
  return slots.length >= MAX_PARTICIPATION_EMAILS ? slots : [...slots, ""];
}

export function removeParticipationEmailSlot(values: string[], index: number): string[] {
  return normalizeParticipationEmailSlots(values.filter((_, itemIndex) => itemIndex !== index));
}

export function memberParticipationPayload(memberId: number, emails: string[], pin: string) {
  const participationEmails = compactParticipationEmails(emails);
  return {
    member_id: memberId,
    ...(participationEmails.length ? { participation_emails: participationEmails } : {}),
    ...(pin.trim() ? { participation_pin: pin.trim() } : {}),
  };
}

export function visitorParticipationPayload(name: string, emails: string[], pin: string) {
  return {
    name: name.trim(),
    participation_emails: compactParticipationEmails(emails),
    ...(pin.trim() ? { participation_pin: pin.trim() } : {}),
  };
}
