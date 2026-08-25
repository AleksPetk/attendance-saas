import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "../api.js";
import {
  EmptyState,
  ErrorBanner,
  Field,
  LoadingState,
  StatusBadge,
} from "../components.jsx";
import { HistorySelect } from "./historyFormControls.jsx";
import { browserReportTimezone } from "./reportTimezone.js";
import {
  canExportAnyReport,
  canExportReportFormat,
} from "../workspaceEntitlements.js";

const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "custom", label: "Custom range" },
];

const EXPORT_OPTIONS = [
  { value: "pdf", label: "PDF" },
  { value: "xlsx", label: "Excel (.xlsx)" },
  { value: "csv", label: "CSV" },
];

const PRESET_LABELS = {
  today: "Today",
  this_week: "This week",
  this_month: "This month",
};

function groupOptionLabel(group) {
  if (group.status === "archived") return `${group.name} (Archived)`;
  if (group.status === "deleted") return `${group.name} (Deleted)`;
  return group.name;
}

function cellDisplay(value) {
  if (value == null || value === "") return "—";
  return value;
}

function reportPresetLabel(preset) {
  return PRESET_LABELS[preset] || "";
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
  const [groups, setGroups] = useState([]);
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
  const [preset, setPreset] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const reportRequestIdRef = useRef(0);
  const reportTimezone = useMemo(() => browserReportTimezone(), []);

  const selectedGroup = useMemo(
    () => groups.find((g) => String(g.source_group_id) === String(sourceGroupId)),
    [groups, sourceGroupId]
  );

  const hasGroupSelected = Boolean(sourceGroupId);
  const hasPresetSelected = Boolean(preset);
  const customRangeIncomplete = preset === "custom" && (!dateFrom || !dateTo);
  const customRangeInvalid =
    preset === "custom" && Boolean(dateFrom && dateTo && dateTo < dateFrom);
  const filtersReady =
    hasGroupSelected &&
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
      source_group_id: sourceGroupId,
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

  async function loadGroups() {
    setLoadingGroups(true);
    setGroupsError("");
    try {
      const result = await api.listHistoryReportGroups(session);
      setGroups(result.data.items || []);
    } catch (err) {
      setGroupsError(errorMessage(err));
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
      setError(errorMessage(err));
    } finally {
      if (requestId === reportRequestIdRef.current) {
        setLoadingReport(false);
      }
    }
  }

  useEffect(() => {
    loadGroups();
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
  }, [sourceGroupId, preset, dateFrom, dateTo, filtersReady]);

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
      setExportError("Choose a group and date range with report data before exporting.");
      return;
    }
    setExporting(true);
    try {
      const params = reportQueryParams({ export_format: exportFormat });
      const result = await api.exportAttendanceReport(session, `?${params.toString()}`);
      const fallbackName = `attendance-report.${exportFormat === "xlsx" ? "xlsx" : exportFormat}`;
      downloadBlob(result.blob, result.filename || fallbackName);
    } catch (err) {
      setExportError(errorMessage(err) || "Could not export this report.");
    } finally {
      setExporting(false);
    }
  }

  function handlePresetChange(nextPreset) {
    setPreset(nextPreset);
    if (nextPreset !== "custom") {
      setDateFrom("");
      setDateTo("");
    }
  }

  const showFiltersEmpty =
    !loadingGroups && !loadingReport && groups.length > 0 && !filtersReady;
  const showNoGroups = !loadingGroups && groups.length === 0;
  const showNoAttendance =
    !loadingGroups && !loadingReport && filtersReady && report && !hasSections;
  const presetCaption = report ? reportPresetLabel(report.date_preset) : "";

  return (
    <div className="history-panel attendance-report-panel">
      <ErrorBanner message={groupsError || error || exportError} />

      <div
        className={`history-toolbar attendance-report-toolbar${preset === "custom" ? " has-custom-range" : ""}`}
      >
        <div className="history-toolbar-filters attendance-report-filters">
          <HistorySelect
            id="attendance-report-group"
            label="Group"
            value={sourceGroupId}
            placeholder="Select a group"
            disabled={loadingGroups || groups.length === 0}
            onChange={(e) => setSourceGroupId(e.target.value)}
          >
            {groups.map((g) => (
              <option key={g.source_group_id} value={g.source_group_id}>
                {groupOptionLabel(g)}
              </option>
            ))}
          </HistorySelect>

          <HistorySelect
            id="attendance-report-preset"
            label="Date range"
            value={preset}
            placeholder="Select date range"
            onChange={(e) => handlePresetChange(e.target.value)}
          >
            {DATE_PRESETS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </HistorySelect>

          {preset === "custom" ? (
            <>
              <Field label="From" className="history-field">
                <input
                  className="history-input"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </Field>
              <Field label="To" className="history-field">
                <input
                  className="history-input"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </Field>
            </>
          ) : null}
        </div>

        <div className="history-toolbar-actions attendance-report-toolbar-actions">
          <div className="export-menu" ref={exportMenuRef}>
            <button
              type="button"
              className={`export-menu-trigger${exportsAllowed ? "" : " is-plan-locked"}`}
              onClick={() => {
                if (!exportsAllowed) {
                  setExportError(
                    "CSV, Excel, and PDF export require Plus or Business.",
                  );
                  return;
                }
                setExportOpen((open) => !open);
              }}
              disabled={exportsAllowed ? !canExport : false}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              aria-disabled={exportsAllowed ? !canExport : false}
              title={
                !exportsAllowed
                  ? "Report export requires Plus or Business"
                  : canExport
                    ? "Export the currently visible attendance report"
                    : "Select a group and date range to enable export"
              }
            >
              <ExportIcon />
              <span>
                {exporting ? "Exporting…" : exportsAllowed ? "Export" : "Export locked"}
              </span>
              <span className="export-menu-caret" aria-hidden="true">
                ▾
              </span>
            </button>
            {exportOpen && canExport ? (
              <div className="export-menu-panel" role="menu">
                {EXPORT_OPTIONS.filter((opt) => canExportReportFormat(session, opt.value)).map(
                  (opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="menuitem"
                    className="export-menu-item"
                    onClick={() => handleExport(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {loadingGroups ? <LoadingState label="Loading groups…" /> : null}

      {loadingReport ? <LoadingState label="Generating attendance report…" /> : null}

      {showNoGroups ? (
        <EmptyState
          title="No Groups available"
          body="Create a Group and record attendance actions to build reports."
        />
      ) : null}

      {showFiltersEmpty ? (
        <div className="attendance-report-empty card-surface">
          <p className="attendance-report-empty-title">No report yet</p>
          <p className="attendance-report-empty-body">
            Choose a group and date range to generate an attendance report.
          </p>
          {customRangeInvalid ? (
            <p className="attendance-report-empty-hint">To date must be on or after From date.</p>
          ) : null}
        </div>
      ) : null}

      {showNoAttendance ? (
        <EmptyState
          title="No attendance in this range"
          body="Try a different date range or Group. Reports only include days with Action Records."
        />
      ) : null}

      {!loadingGroups && !loadingReport && hasSections ? (
        <section className="attendance-report">
          <header className="attendance-report-header">
            <div className="attendance-report-header-copy">
              <div className="attendance-report-title-row">
                <h3>{report.group_name}</h3>
                {report.group_status === "archived" || report.group_status === "deleted" ? (
                  <StatusBadge status={report.group_status} />
                ) : null}
              </div>
              <p className="attendance-report-kicker">Attendance Report</p>
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
                      {showClassColumn ? <th scope="col">Class</th> : null}
                      <th scope="col">Name</th>
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
                        {showClassColumn ? (
                          <td className="attendance-report-class">{row.class_name || "Unknown Class"}</td>
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
