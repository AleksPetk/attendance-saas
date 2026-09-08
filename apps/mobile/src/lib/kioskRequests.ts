import type { ActionType } from "@checkstation/domain";
export type KioskIdentity = { participant_kind: "member" | "group_only_participant"; membership_id?: number; group_only_participant_id?: number };
export function kioskIdentityPayload(person: KioskIdentity) {
  if (person.participant_kind === "member") {
    if (!person.membership_id) throw new Error("Missing identified membership");
    return { participant_kind: person.participant_kind, membership_id: person.membership_id };
  }
  if (!person.group_only_participant_id) throw new Error("Missing identified visitor");
  return { participant_kind: person.participant_kind, group_only_participant_id: person.group_only_participant_id };
}
export function kioskActionPayload(person: KioskIdentity, action: ActionType, pin: string, timezone: string) {
  return { ...kioskIdentityPayload(person), action, ...(pin ? { pin } : {}), ...(timezone ? { timezone } : {}) };
}
