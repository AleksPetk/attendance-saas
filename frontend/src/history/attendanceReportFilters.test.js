import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  parseParticipantSelection,
  reportSelectionParams,
  resetAttendanceReportMode,
} from "./attendanceReportFilters.js";

test("report modes build stable ID filters", () => {
  assert.deepEqual(
    reportSelectionParams({ reportBy: "member", memberId: "12", sourceGroupId: "", participantSelection: "" }),
    { report_by: "member", member_id: "12" },
  );
  assert.deepEqual(
    reportSelectionParams({ reportBy: "group", sourceGroupId: "8", participantSelection: "member:27" }),
    { report_by: "group", source_group_id: "8", participant_kind: "member", participant_id: "27" },
  );
  assert.deepEqual(parseParticipantSelection("group_only_participant:9"), {
    kind: "group_only_participant",
    id: 9,
  });
});

test("changing primary report context clears every dependent selection", () => {
  assert.deepEqual(resetAttendanceReportMode(), {
    memberId: "",
    sourceGroupId: "",
    participantSelection: "",
  });
});

test("Attendance Report UI uses canonical dynamic options and dependent resets", () => {
  const source = readFileSync(new URL("./AttendanceReportPanel.jsx", import.meta.url), "utf8");
  assert.match(source, /getAttendanceReportOptions/);
  assert.match(source, /member_id=/);
  assert.match(source, /source_group_id=/);
  assert.match(source, /setSourceGroupId\(""\)/);
  assert.match(source, /setParticipantSelection\(""\)/);
  assert.doesNotMatch(source, /participant\.name\s*===|participant\.email\s*===/);
});
