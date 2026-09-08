import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTranslator, type AppLocale } from "@checkstation/i18n";
import { exportFilename, isValidIsoDate, reportQuery, validCustomRange } from "../features/history/report";

describe("attendance report filters", () => {
  it("uses the production Group participant contract", () => {
    const params = new URLSearchParams(reportQuery({ mode: "group", groupId: "7", memberId: "", participant: "group_only_participant:11", preset: "custom", dateFrom: "2026-09-01", dateTo: "2026-09-08" }));
    assert.equal(params.get("source_group_id"), "7");
    assert.equal(params.get("participant_kind"), "group_only_participant");
    assert.equal(params.get("participant_id"), "11");
    assert.equal(params.get("date_from"), "2026-09-01");
    assert.equal(params.get("date_to"), "2026-09-08");
  });

  it("uses the production Member and optional Group contract", () => {
    const params = new URLSearchParams(reportQuery({ mode: "member", groupId: "4", memberId: "9", participant: "member:12", preset: "today", dateFrom: "", dateTo: "", exportFormat: "xlsx" }));
    assert.equal(params.get("member_id"), "9");
    assert.equal(params.get("source_group_id"), "4");
    assert.equal(params.get("participant_id"), null);
    assert.equal(params.get("export_format"), "xlsx");
  });

  it("validates real calendar dates and ordered custom ranges", () => {
    assert.equal(isValidIsoDate("2024-02-29"), true);
    assert.equal(isValidIsoDate("2025-02-29"), false);
    assert.equal(validCustomRange("2026-09-08", "2026-09-01"), false);
  });

  it("preserves and sanitizes the server export filename", () => {
    assert.equal(exportFilename('attachment; filename="attendance_team_20260908.csv"', "csv"), "attendance_team_20260908.csv");
    assert.equal(exportFilename('attachment; filename="../report.pdf"', "pdf"), "..-report.pdf");
  });
});

const translationKeys = [
  "history.activityLog", "history.attendanceReport", "history.reportBy", "history.group",
  "history.member", "history.selectGroup", "history.selectMember", "history.participantOptional",
  "history.allParticipants", "history.dateRange", "history.preset.today", "history.preset.this_week",
  "history.preset.this_month", "history.preset.custom", "history.exportReport",
  "history.generatingReport", "history.noAttendanceTitle", "common.close",
] as const;

describe("History translations", () => {
  for (const locale of ["en", "ja"] satisfies AppLocale[]) {
    it(`does not expose raw History keys in ${locale}`, () => {
      const t = createTranslator(locale);
      for (const key of translationKeys) assert.notEqual(t(key), key, key);
    });
  }
});
