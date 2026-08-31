export function parseParticipantSelection(value) {
  const [kind, rawId] = String(value || "").split(":");
  const id = Number(rawId);
  if (!value || !["member", "group_only_participant"].includes(kind) || !Number.isInteger(id) || id < 1) {
    return null;
  }
  return { kind, id };
}

export function resetAttendanceReportMode() {
  return { memberId: "", sourceGroupId: "", participantSelection: "" };
}

export function reportSelectionParams({ reportBy, memberId, sourceGroupId, participantSelection }) {
  const params = { report_by: reportBy };
  if (reportBy === "member") {
    params.member_id = memberId;
    if (sourceGroupId) params.source_group_id = sourceGroupId;
  } else {
    params.source_group_id = sourceGroupId;
    const participant = parseParticipantSelection(participantSelection);
    if (participant) {
      params.participant_kind = participant.kind;
      params.participant_id = String(participant.id);
    }
  }
  return params;
}
