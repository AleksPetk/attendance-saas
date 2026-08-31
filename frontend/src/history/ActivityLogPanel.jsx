import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../api.js";
import {
  ActionBadge,
  EmptyState,
  ErrorBanner,
  LoadingState,
} from "../components.jsx";
import { formatTime24 } from "./formatDateTime.js";
import { HistoryInput, HistorySelect } from "./historyFormControls.jsx";

const ACTION_OPTIONS = [
  { value: "check_in", label: "Check-in" },
  { value: "check_out", label: "Check-out" },
  { value: "break_start", label: "Break start" },
  { value: "break_end", label: "Break end" },
];

function historyRowClass(action) {
  if (action === "check_in") return "history-row history-row-check-in";
  if (action === "check_out") return "history-row history-row-check-out";
  if (action === "break_start" || action === "break_end") return "history-row history-row-break";
  return "history-row";
}

export default function ActivityLogPanel({ session }) {
  const [groups, setGroups] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [groupId, setGroupId] = useState("");
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [day, setDay] = useState("");

  async function loadGroups() {
    const result = await api.listGroups(session, "?status=active");
    setGroups(result.data);
  }

  async function loadHistory() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (groupId) params.set("group_id", groupId);
      if (action) params.set("action", action);
      if (search) params.set("search", search);
      if (day) params.set("day", day);
      const result = await api.listHistory(session, `?${params.toString()}`);
      setHistory(result.data.items || []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, action, search, day]);

  const groupLabel = useMemo(() => {
    if (!groupId) return "All groups";
    const g = groups.find((x) => String(x.id) === String(groupId));
    return g ? g.name : "Group";
  }, [groupId, groups]);

  const hasFilters = groupId || action || search || day;

  return (
    <div className="history-panel activity-log-panel">
      <p className="history-view-lede">
        Action records from kiosk check-in, check-out, and break operations. Showing:{" "}
        <span className="history-view-lede-emphasis">{groupLabel}</span>
      </p>

      <ErrorBanner message={error} />

      <div className="history-toolbar activity-log-toolbar">
        <div className="history-toolbar-filters" data-tutorial-target="activity-log-filters">
          <HistorySelect
            id="activity-log-group"
            label="Group"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </HistorySelect>

          <HistorySelect
            id="activity-log-action"
            label="Action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">Any action</option>
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </HistorySelect>

          <HistoryInput
            id="activity-log-search"
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email, or identifier"
          />

          <HistoryInput
            id="activity-log-day"
            label="Day"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </div>

        {hasFilters ? (
          <div className="history-toolbar-actions">
            <button
              type="button"
              className="history-clear-filters"
              onClick={() => {
                setGroupId("");
                setAction("");
                setSearch("");
                setDay("");
              }}
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </div>

      {loading ? <LoadingState label="Loading history…" /> : null}

      {!loading && history.length === 0 ? (
        <EmptyState
          title="No history yet"
          body="Run a kiosk action and records will appear here. Try adjusting filters if you expected results."
        />
      ) : null}

      {!loading && history.length > 0 ? (
        <div className="history-list">
          {history.map((item) => {
            const when = new Date(item.performed_at);
            return (
              <article key={item.id} className={historyRowClass(item.action)}>
                <div className="history-time">
                  <strong>
                    {formatTime24(when)}
                  </strong>
                  <span className="history-date">
                    {when.toLocaleDateString([], {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="history-main">
                  <strong>{item.person?.name || "Unknown"}</strong>
                  <p className="history-sub">{item.group_name}</p>
                </div>
                <div className="history-meta">
                  <ActionBadge action={item.action} />
                  <span className="source-label">{item.source}</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
