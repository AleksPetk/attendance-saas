import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  StatusBadge,
} from "../components.jsx";
import { localizedErrorMessage } from "../i18n/errorMessages.js";
import { HistorySelect } from "./historyFormControls.jsx";
import { browserReportTimezone } from "./reportTimezone.js";
import { attendanceReportDownloadFilename } from "./attendanceReportCsv.js";
import {
  reportSelectionParams,
  resetAttendanceReportMode,
} from "./attendanceReportFilters.js";
import {
  validateAttendanceReportDateRange,
} from "./attendanceReportDateRange.js";
import AttendanceDatePicker from "./AttendanceDatePicker.jsx";
import {
  canExportAnyReport,
  canExportReportFormat,
} from "../workspaceEntitlements.js";

const DATE_PRESET_VALUES = ["today", "this_week", "this_month", "custom"];

const EXPORT_FORMATS = [
  { value: "pdf", labelKey: "report.export.pdf" },
  { value: "xlsx", labelKey: "report.export.excel" },
  { value: "csv", labelKey: "report.export.csv" },
];

function groupOptionLabel(group, t) {
  if (group.status === "archived") {
    return `${group.name} (${t("common:status.archived")})`;
  }
  if (group.status === "deleted") {
    return `${group.name} (${t("common:status.deleted")})`;
  }
  return group.name;
}

function cellDisplay(value) {
  if (value == null || value === "") return "—";
  return value;
}

function reportPresetLabel(preset, t) {
  const map = {
    today: t("report.presets.today"),
    this_week: t("report.presets.thisWeek"),
    this_month: t("report.presets.thisMonth"),
  };
  return map[preset] || "";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "attendance-report";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ExportIcon() {
  return (
    <svg
      className="export-menu-icon"
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 3.5v8.2M10 11.7 7.2 8.9M10 11.7l2.8-2.8M4.5 13.5v1.8c0 .7.6 1.2 1.3 1.2h8.4c.7 0 1.3-.5 1.3-1.2v-1.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AttendanceReportPanel({ session }) {
  const { t, i18n } = useTranslation(["history", "common", "errors"]);
  const [reportBy, setReportBy] = useState("group");
  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [memberGroups, setMemberGroups] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [groupsError, setGroupsError] = useState("");
  const [exportError, setExportError] = useState("");
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef(null);

  const [sourceGroupId, setSourceGroupId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [participantSelection, setParticipantSelection] = useState("");
  const [preset, setPreset] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateFromIssue, setDateFromIssue] = useState(null);
  const [dateToIssue, setDateToIssue] = useState(null);
  const reportRequestIdRef = useRef(0);
  const reportTimezone = useMemo(() => browserReportTimezone(), []);

  const datePresets = useMemo(
    () =>
      DATE_PRESET_VALUES.map((value) => ({
        value,
        label:
          value === "today"
            ? t("report.presets.today")
            : value === "this_week"
              ? t("report.presets.thisWeek")
              : value === "this_month"
                ? t("report.presets.thisMonth")
                : t("report.presets.custom"),
      })),
    [t],
  );

  const hasPrimarySelected = reportBy === "member" ? Boolean(memberId) : Boolean(sourceGroupId);
  const hasPresetSelected = Boolean(preset);
  const customDateValidation = useMemo(
    () => validateAttendanceReportDateRange(dateFrom, dateTo),
    [dateFrom, dateTo],
  );
  const customRangeIncomplete =
    preset === "custom" && customDateValidation.reason === "incomplete";
  const customRangeInvalid =
    preset === "custom" && ["invalid", "order"].includes(customDateValidation.reason);
  const customRangeOrderInvalid =
    preset === "custom" && customDateValidation.reason === "order";
  const filtersReady =
    hasPrimarySelected &&
    hasPresetSelected &&
    !customRangeIncomplete &&
    !customRangeInvalid;

  const hasSections = report && Array.isArray(report.sections) && report.sections.length > 0;
  const columns = report?.columns || [];
  const showClassColumn = report?.group_type === "structured";
  const exportsAllowed = canExportAnyReport(session);
  const canExport =
    Boolean(hasSections) && filtersReady && !loadingReport && !exporting && exportsAllowed;

  function reportQueryParams(extra = {}) {
    const params = new URLSearchParams({
      ...reportSelectionParams({ reportBy, memberId, sourceGroupId, participantSelection }),
      preset,
      ...extra,
    });
    if (reportTimezone) {
      params.set("timezone", reportTimezone);
    }
    if (preset === "custom") {
      params.set("date_from", dateFrom);
      params.set("date_to", dateTo);
    }
    return params;
  }

  async function loadOptions(params = "") {
    setLoadingGroups(true);
    setGroupsError("");
    try {
      const result = await api.getAttendanceReportOptions(session, params);
      setGroups(result.data.groups || []);
      setMembers(result.data.members || []);
      if ("member_groups" in result.data) setMemberGroups(result.data.member_groups || []);
      if ("participants" in result.data) setParticipants(result.data.participants || []);
    } catch (err) {
      setGroupsError(localizedErrorMessage(err, t));
    } finally {
      setLoadingGroups(false);
    }
  }

  async function loadReport() {
    const requestId = ++reportRequestIdRef.current;
    setLoadingReport(true);
    setReport(null);
    setError("");
    setExportError("");
    setExportOpen(false);
    try {
      const result = await api.getAttendanceReport(session, `?${reportQueryParams().toString()}`);
      if (requestId !== reportRequestIdRef.current) return;
      setReport(result.data);
    } catch (err) {
      if (requestId !== reportRequestIdRef.current) return;
      setReport(null);
      setError(localizedErrorMessage(err, t));
    } finally {
      if (requestId === reportRequestIdRef.current) {
        setLoadingReport(false);
      }
    }
  }

  useEffect(() => {
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!filtersReady) {
      setReport(null);
      setError("");
      setExportError("");
      setExportOpen(false);
      return;
    }
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportBy, memberId, sourceGroupId, participantSelection, preset, dateFrom, dateTo, filtersReady]);

  useEffect(() => {
    if (reportBy !== "member" || !memberId) {
      setMemberGroups([]);
      return;
    }
    loadOptions(`?member_id=${encodeURIComponent(memberId)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportBy, memberId]);

  useEffect(() => {
    if (reportBy !== "group" || !sourceGroupId) {
      setParticipants([]);
      return;
    }
    loadOptions(`?source_group_id=${encodeURIComponent(sourceGroupId)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportBy, sourceGroupId]);

  useEffect(() => {
    function onPointerDown(event) {
      if (!exportMenuRef.current) return;
      if (!exportMenuRef.current.contains(event.target)) {
        setExportOpen(false);
      }
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setExportOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function handleExport(exportFormat) {
    setExportOpen(false);
    setExportError("");
    if (!canExport) {
      setExportError(t("report.export.filtersRequired"));
      return;
    }
    setExporting(true);
    try {
      const params = reportQueryParams({ export_format: exportFormat });
      const result = await api.exportAttendanceReport(session, `?${params.toString()}`);
      const fallbackName = attendanceReportDownloadFilename(report, exportFormat);
      downloadBlob(result.blob, result.filename || fallbackName);
    } catch (err) {
      setExportError(localizedErrorMessage(err, t) || t("report.export.failed"));
    } finally {
      setExporting(false);
    }
  }

  function handlePresetChange(nextPreset) {
    setPreset(nextPreset);
    if (nextPreset !== "custom") {
      setDateFrom("");
      setDateTo("");
      setDateFromIssue(null);
      setDateToIssue(null);
    }
  }

  function handleModeChange(nextMode) {
    const cleared = resetAttendanceReportMode();
    setReportBy(nextMode);
    setMemberId(cleared.memberId);
    setSourceGroupId(cleared.sourceGroupId);
    setParticipantSelection(cleared.participantSelection);
    setMemberGroups([]);
    setParticipants([]);
  }

  function handleMemberChange(nextMemberId) {
    setMemberId(nextMemberId);
    setSourceGroupId("");
    setMemberGroups([]);
  }

  function handleGroupChange(nextGroupId) {
    setSourceGroupId(nextGroupId);
    if (reportBy === "group") {
      setParticipantSelection("");
      setParticipants([]);
    }
  }

  const hasPrimaryOptions = reportBy === "group" ? groups.length > 0 : members.length > 0;
  const showFiltersEmpty =
    !loadingGroups && !loadingReport && hasPrimaryOptions && !filtersReady;
  const showNoGroups = !loadingGroups && (reportBy === "group" ? groups.length === 0 : members.length === 0);
  const showNoAttendance =
    !loadingGroups && !loadingReport && filtersReady && report && !hasSections;
  const presetCaption = report ? reportPresetLabel(report.date_preset, t) : "";

  const exportButtonTitle = !exportsAllowed
    ? t("report.export.planRequiredTitle")
    : canExport
      ? t("report.export.readyTitle")
      : t("report.export.disabledTitle");

  return (
    <div className="history-panel attendance-report-panel">
      <ErrorBanner message={groupsError || error || exportError} />

      <div
        className={`history-toolbar attendance-report-toolbar${preset === "custom" ? " has-custom-range" : ""}`}
      >
        <div
          className="history-toolbar-filters attendance-report-filters"
          data-tutorial-target="attendance-report-filters"
        >
          <HistorySelect
            id="attendance-report-mode"
            label={t("report.reportBy")}
            value={reportBy}
            onChange={(e) => handleModeChange(e.target.value)}
          >
            <option value="member">{t("report.member")}</option>
            <option value="group">{t("report.group")}</option>
          </HistorySelect>

          {reportBy === "member" ? (
            <>
              <HistorySelect
                id="attendance-report-member"
                label={t("report.member")}
                value={memberId}
                placeholder={t("report.selectMember")}
                disabled={loadingGroups || members.length === 0}
                onChange={(e) => handleMemberChange(e.target.value)}
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                    {member.status === "archived" ? ` (${t("common:status.archived")})` : ""}
                  </option>
                ))}
              </HistorySelect>
              <HistorySelect
                id="attendance-report-member-group"
                label={t("report.groupOptional")}
                value={sourceGroupId}
                disabled={!memberId}
                onChange={(e) => handleGroupChange(e.target.value)}
              >
                <option value="">{t("report.allMemberGroups")}</option>
                {memberGroups.map((group) => (
                  <option key={group.source_group_id} value={group.source_group_id}>
                    {groupOptionLabel(group, t)}
                  </option>
                ))}
              </HistorySelect>
            </>
          ) : (
            <>
              <HistorySelect
                id="attendance-report-group"
                label={t("report.group")}
                value={sourceGroupId}
                placeholder={t("report.selectGroup")}
                disabled={loadingGroups || groups.length === 0}
                onChange={(e) => handleGroupChange(e.target.value)}
              >
                {groups.map((group) => (
                  <option key={group.source_group_id} value={group.source_group_id}>
                    {groupOptionLabel(group, t)}
                  </option>
                ))}
              </HistorySelect>
              <HistorySelect
                id="attendance-report-participant"
                label={t("report.participantOptional")}
                value={participantSelection}
                disabled={!sourceGroupId}
                onChange={(e) => setParticipantSelection(e.target.value)}
              >
                <option value="">{t("report.allParticipants")}</option>
                {participants.map((participant) => (
                  <option
                    key={`${participant.kind}:${participant.id}`}
                    value={`${participant.kind}:${participant.id}`}
                  >
                    {participant.name}
                    {participant.participant_code ? ` · ${participant.participant_code}` : ""}
                  </option>
                ))}
              </HistorySelect>
            </>
          )}

          <HistorySelect
            id="attendance-report-preset"
            label={t("report.dateRange")}
            value={preset}
            placeholder={t("report.selectDateRange")}
            onChange={(e) => handlePresetChange(e.target.value)}
          >
            {datePresets.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </HistorySelect>

          {preset === "custom" ? (
            <>
              <AttendanceDatePicker
                id="attendance-report-date-from"
                label={t("report.from")}
                value={dateFrom}
                fallbackValue={dateTo}
                issue={dateFromIssue}
                locale={i18n.language}
                t={t}
                onCommit={setDateFrom}
                onIssue={setDateFromIssue}
              />
              <AttendanceDatePicker
                id="attendance-report-date-to"
                label={t("report.to")}
                value={dateTo}
                fallbackValue={dateFrom}
                issue={dateToIssue}
                rangeError={
                  customRangeOrderInvalid
                    ? t("report.filtersEmpty.dateRangeInvalid")
                    : ""
                }
                locale={i18n.language}
                t={t}
                onCommit={setDateTo}
                onIssue={setDateToIssue}
              />
            </>
          ) : null}
        </div>

        <div className="history-toolbar-actions attendance-report-toolbar-actions">
          <div
            className="export-menu"
            ref={exportMenuRef}
            data-tutorial-target="attendance-report-export"
          >
            <button
              type="button"
              className={`export-menu-trigger${exportsAllowed ? "" : " is-plan-locked"}`}
              onClick={() => {
                if (!exportsAllowed) {
                  setExportError(t("report.export.planRequired"));
                  return;
                }
                setExportOpen((open) => !open);
              }}
              disabled={exportsAllowed ? !canExport : false}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              aria-disabled={exportsAllowed ? !canExport : false}
              title={exportButtonTitle}
            >
              <ExportIcon />
              <span>
                {exporting
                  ? t("report.export.exporting")
                  : exportsAllowed
                    ? t("report.export.label")
                    : t("report.export.locked")}
              </span>
              <span className="export-menu-caret" aria-hidden="true">
                ▾
              </span>
            </button>
            {exportOpen && canExport ? (
              <div className="export-menu-panel" role="menu">
                {EXPORT_FORMATS.filter((opt) => canExportReportFormat(session, opt.value)).map(
                  (opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="menuitem"
                      className="export-menu-item"
                      onClick={() => handleExport(opt.value)}
                    >
                      {t(opt.labelKey)}
                    </button>
                  ),
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {loadingGroups ? <LoadingState label={t("report.loadingGroups")} /> : null}

      {loadingReport ? <LoadingState label={t("report.generating")} /> : null}

      {showNoGroups ? (
        <EmptyState
          title={
            reportBy === "member" ? t("report.noMembers.title") : t("report.noGroups.title")
          }
          body={
            reportBy === "member" ? t("report.noMembers.body") : t("report.noGroups.body")
          }
        />
      ) : null}

      {showFiltersEmpty ? (
        <div className="attendance-report-empty card-surface">
          <p className="attendance-report-empty-title">{t("report.filtersEmpty.title")}</p>
          <p className="attendance-report-empty-body">
            {reportBy === "member"
              ? t("report.filtersEmpty.bodyMember")
              : t("report.filtersEmpty.bodyGroup")}
          </p>
          {customRangeOrderInvalid ? (
            <p className="attendance-report-empty-hint">
              {t("report.filtersEmpty.dateRangeInvalid")}
            </p>
          ) : null}
        </div>
      ) : null}

      {showNoAttendance ? (
        <EmptyState title={t("report.noAttendance.title")} body={t("report.noAttendance.body")} />
      ) : null}

      {!loadingGroups && !loadingReport && hasSections ? (
        <section className="attendance-report">
          <header className="attendance-report-header">
            <div className="attendance-report-header-copy">
              <div className="attendance-report-title-row">
                <h3>{report.report_by === "member" ? report.member_name : report.group_name}</h3>
                {report.group_status === "archived" || report.group_status === "deleted" ? (
                  <StatusBadge status={report.group_status} />
                ) : null}
              </div>
              <p className="attendance-report-kicker">{t("report.header.kicker")}</p>
              <p className="attendance-report-context">
                {report.report_by === "member"
                  ? report.source_group_id
                    ? t("report.header.group", { name: report.group_name })
                    : t("report.header.allMemberGroups")
                  : report.participant
                    ? t("report.header.participant", { name: report.participant.name })
                    : t("report.header.allParticipants")}
              </p>
              {presetCaption && report.date_preset !== "custom" ? (
                <p className="attendance-report-preset">{presetCaption}</p>
              ) : null}
              <p className="attendance-report-period">{report.date_label}</p>
            </div>
          </header>

          {report.sections.map((section) => (
            <div key={section.date} className="attendance-report-section">
              <h4 className="attendance-report-section-label">{section.label}</h4>
              <div className="attendance-report-table-wrap">
                <table className="attendance-report-table">
                  <thead>
                    <tr>
                      {report.show_group_column ? (
                        <th scope="col">{t("report.table.group")}</th>
                      ) : null}
                      {(report.show_class_column ?? showClassColumn) ? (
                        <th scope="col">{t("report.table.class")}</th>
                      ) : null}
                      <th scope="col">{t("report.table.name")}</th>
                      {columns.map((col) => (
                        <th key={col.key} scope="col">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row) => (
                      <tr key={`${section.date}-${row.participant_key}`}>
                        {report.show_group_column ? <td>{row.group_name}</td> : null}
                        {(report.show_class_column ?? showClassColumn) ? (
                          <td className="attendance-report-class">
                            {row.class_name || t("report.table.unknownClass")}
                          </td>
                        ) : null}
                        <th scope="row">{row.name}</th>
                        {columns.map((col) => (
                          <td key={col.key}>{cellDisplay(row.cells?.[col.key])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
