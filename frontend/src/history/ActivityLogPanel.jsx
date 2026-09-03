import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import {
  ActionBadge,
  EmptyState,
  ErrorBanner,
  LoadingState,
} from "../components.jsx";
import { localizedErrorMessage } from "../i18n/errorMessages.js";
import { formatDate } from "../i18n/format.js";
import { formatTime24 } from "./formatDateTime.js";
import { HistoryInput, HistorySelect } from "./historyFormControls.jsx";

const ACTION_OPTIONS = [
  { value: "check_in", labelKey: "actions.checkIn" },
  { value: "check_out", labelKey: "actions.checkOut" },
  { value: "break_start", labelKey: "actions.breakStart" },
  { value: "break_end", labelKey: "actions.breakEnd" },
];

function historyRowClass(action) {
  if (action === "check_in") return "history-row history-row-check-in";
  if (action === "check_out") return "history-row history-row-check-out";
  if (action === "break_start" || action === "break_end") return "history-row history-row-break";
  return "history-row";
}

export default function ActivityLogPanel({ session }) {
  const { t, i18n } = useTranslation(["history", "common", "errors"]);
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
      setError(localizedErrorMessage(err, t));
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

  const hasFilters = groupId || action || search || day;

  return (
    <div className="history-panel activity-log-panel">
      <ErrorBanner message={error} />

      <div className="history-toolbar activity-log-toolbar">
        <div className="history-toolbar-filters" data-tutorial-target="activity-log-filters">
          <HistorySelect
            id="activity-log-group"
            label={t("activity.group")}
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">{t("activity.allGroups")}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </HistorySelect>

          <HistorySelect
            id="activity-log-action"
            label={t("activity.action")}
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">{t("activity.anyAction")}</option>
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(`common:${opt.labelKey}`)}
              </option>
            ))}
          </HistorySelect>

          <HistoryInput
            id="activity-log-search"
            label={t("activity.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("activity.searchPlaceholder")}
          />

          <HistoryInput
            id="activity-log-day"
            label={t("activity.day")}
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </div>

        {hasFilters ? (
          <div className="history-toolbar-actions">
            <button
              type="button"
              className="btn-ghost groups-toolbar-clear"
              onClick={() => {
                setGroupId("");
                setAction("");
                setSearch("");
                setDay("");
              }}
            >
              {t("activity.clear")}
            </button>
          </div>
        ) : null}
      </div>

      {loading ? <LoadingState label={t("activity.loading")} /> : null}

      {!loading && history.length === 0 ? (
        <EmptyState title={t("activity.empty.title")} body={t("activity.empty.body")} />
      ) : null}

      {!loading && history.length > 0 ? (
        <div className="history-list">
          {history.map((item) => {
            const when = new Date(item.performed_at);
            return (
              <article key={item.id} className={historyRowClass(item.action)}>
                <div className="history-time">
                  <strong>{formatTime24(when)}</strong>
                  <span className="history-date">
                    {formatDate(when, i18n.language, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="history-main">
                  <strong>{item.person?.name || t("common:unknown")}</strong>
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
