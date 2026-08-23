import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, errorMessage } from "./api.js";
import { ConfirmDialog, ErrorBanner, LoadingState, PageHeader, StatusBadge } from "./components.jsx";
import { formatGroupId, groupTypeLabel, isStructuredGroup, setupIncompleteSummary } from "./groupForm.js";

export default function GroupsScreen({ session, onNavigate }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") === "archived" ? "archived" : "active";
  const [search, setSearch] = useState("");
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ status: statusFilter });
    if (search.trim()) {
      params.set("search", search.trim());
    }
    try {
      const result = await api.listGroups(session, `?${params.toString()}`);
      setGroups(result.data);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  function setStatusFilter(value) {
    if (value === "archived") {
      setSearchParams({ status: "archived" });
    } else {
      setSearchParams({});
    }
  }

  async function restoreGroup(group) {
    try {
      await api.restoreGroup(session, group.id);
      await load();
    } catch (restoreError) {
      setError(errorMessage(restoreError));
    }
  }

  async function confirmPermanentDelete() {
    if (!pendingDelete) {
      return;
    }
    setDeleting(true);
    setError("");
    try {
      await api.permanentlyDeleteGroup(session, pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setDeleting(false);
    }
  }

  const archived = statusFilter === "archived";

  return (
    <div className="page">
      <PageHeader
        title="Groups"
        description="Reusable participation and activity configurations for this workspace."
        actions={
          <button type="button" className="btn-primary" onClick={() => onNavigate({ name: "group-editor" })}>
            Create Group
          </button>
        }
      />
      <div className="toolbar card-surface toolbar-compact">
        <input
          className="search-input"
          placeholder="Search Group name"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              load();
            }
          }}
        />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        <button type="button" className="btn-secondary" onClick={load}>
          Search
        </button>
      </div>
      <ErrorBanner message={error} />
      {loading ? <LoadingState label="Loading Groups…" /> : null}
      {!loading && groups.length === 0 ? (
        <div className="empty-state">
          <h2>{archived ? "No archived Groups" : "No Groups yet"}</h2>
          <p>
            {archived
              ? "Archived Groups appear here. Restore them or delete them permanently."
              : "Create a Group to configure check-in behavior and add people."}
          </p>
          {archived ? null : (
            <div className="empty-state-action">
              <button type="button" className="btn-primary" onClick={() => onNavigate({ name: "group-editor" })}>
                Create Group
              </button>
            </div>
          )}
        </div>
      ) : null}
      {!loading && groups.length > 0 ? (
        <div className="card-grid">
          {groups.map((group) => {
            const isArchived = group.status === "archived";
            const structured = isStructuredGroup(group);
            const participantCount =
              (group.member_count || 0) + (group.group_only_participant_count || 0);
            return (
              <article
                key={group.id}
                className={`group-card${
                  structured ? " group-card-structured" : " group-card-standard"
                }${isArchived ? " group-card-archived" : ""}`}
                data-group-type={structured ? "structured" : "standard"}
                onClick={
                  isArchived
                    ? undefined
                    : () => onNavigate({ name: "group-detail", groupId: group.id })
                }
                role={isArchived ? undefined : "button"}
                tabIndex={isArchived ? undefined : 0}
                onKeyDown={
                  isArchived
                    ? undefined
                    : (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onNavigate({ name: "group-detail", groupId: group.id });
                        }
                      }
                }
              >
                <div className="group-card-top">
                  <div>
                    <h3>{group.name}</h3>
                    <div className="group-card-meta">
                      <p className="entity-kicker">{formatGroupId(group.id)}</p>
                      <p className="group-type-label">{groupTypeLabel(group)}</p>
                    </div>
                  </div>
                  <div className="group-card-badges">
                    {isArchived ? (
                      <StatusBadge status="archived" />
                    ) : group.readiness && !group.readiness.setup_complete ? (
                      <StatusBadge status="setup_incomplete" />
                    ) : (
                      <StatusBadge status="active" />
                    )}
                  </div>
                </div>
                <p>{actionSummary(group.actions)}</p>
                {!isArchived && group.readiness && !group.readiness.setup_complete ? (
                  <p className="muted warning-text">{setupIncompleteSummary(group.readiness)}</p>
                ) : null}
                <p className="muted">
                  {participantCount} participant{participantCount === 1 ? "" : "s"}
                  {` · ${group.member_count || 0} Members · ${
                    group.group_only_participant_count || 0
                  } Group-only`}
                </p>
                {isArchived ? (
                  <div className="group-card-actions">
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => restoreGroup(group)}
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      className="btn-danger-soft btn-sm"
                      onClick={() => setPendingDelete(group)}
                    >
                      Delete permanently
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
      {pendingDelete ? (
        <ConfirmDialog
          title="Permanently delete Group?"
          body={`Permanently delete ${pendingDelete.name}? This action cannot be undone.`}
          confirmLabel="Delete permanently"
          danger
          busy={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmPermanentDelete}
        />
      ) : null}
    </div>
  );
}

export function actionSummary(actions) {
  if (!actions) {
    return "No Actions configured";
  }
  const parts = [];
  if (actions.check_in_enabled) {
    parts.push("Check-in");
  }
  if (actions.check_out_enabled) {
    parts.push("Check-out");
  }
  if (actions.breaks_enabled) {
    parts.push(`Breaks (max ${actions.max_breaks || 1})`);
  }
  return parts.length ? parts.join(" · ") : "No check-in/check-out/break Actions";
}
