import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, errorMessage } from "./api.js";
import { ConfirmDialog, EmptyState, ErrorBanner, LoadingState, PageHeader, StatusBadge } from "./components.jsx";
import {
  canManageGroupConfiguration,
  canManageOwnerAccount,
  isGroupScopedStaff,
} from "./workspaceSession.js";
import {
  canCreateStructuredGroups,
  groupsCapacityCaption,
  planLimitValue,
  selectionRequired,
  workspacePlanDisplayName,
} from "./workspaceEntitlements.js";
import { formatGroupId, groupTypeLabel, isStructuredGroup, setupIncompleteSummary } from "./groupForm.js";
import { isGroupPlanLocked, partitionGroupsByPlanAvailability } from "./groupsListOrdering.js";
import PlanLockSelectionPanel from "./PlanLockSelectionPanel.jsx";
import AdBanner from "./advertising/AdBanner.jsx";
import { PLACEMENT_GROUPS_BANNER } from "./advertising/placements.js";

export default function GroupsScreen({ session, onNavigate, setSession }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") === "archived" ? "archived" : "active";
  const [search, setSearch] = useState("");
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [selectionOpen, setSelectionOpen] = useState(false);

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
    setSelectionOpen(false);
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
  const canConfigure = canManageGroupConfiguration(session);
  const owner = canManageOwnerAccount(session);
  const staffScoped = isGroupScopedStaff(session);
  const selectionKind = archived ? "archived_groups" : "active_standard_groups";
  const mustSelect = owner && selectionRequired(session, selectionKind);
  const planName = workspacePlanDisplayName(session);
  const limit = planLimitValue(session, selectionKind);
  const capacityCaption = archived
    ? groupsCapacityCaption(session, "archived_groups", "archived records")
    : canCreateStructuredGroups(session)
      ? [
          groupsCapacityCaption(session, "active_standard_groups", "active Standard records"),
          groupsCapacityCaption(session, "active_structured_groups", "active Structured records"),
        ]
          .filter(Boolean)
          .join(" · ")
      : groupsCapacityCaption(session, "active_standard_groups", "active records");

  const selectionTitle = archived
    ? "Choose available archived Groups"
    : "Choose available Groups";
  const selectionNotice =
    typeof limit === "number"
      ? archived
        ? `Your ${planName} plan includes ${limit} accessible archived Group${limit === 1 ? "" : "s"}. Choose the ${limit} you want to keep available.`
        : `Your ${planName} plan includes ${limit} active Standard Group${limit === 1 ? "" : "s"}. Choose the ${limit} Groups you want to keep available.`
      : "Choose which Groups remain available under the current plan.";

  async function saveAvailability(selectedIds) {
    await api.putPlanLockSelection(session, {
      kind: selectionKind,
      selected_ids: selectedIds,
    });
    const result = await api.loadWorkspace(session);
    if (typeof setSession === "function") {
      setSession({ workspace: result.data });
    }
    setSelectionOpen(false);
    await load();
  }

  const { available: availableGroups, locked: lockedGroups } =
    partitionGroupsByPlanAvailability(groups);
  const showPlanSections = availableGroups.length > 0 && lockedGroups.length > 0;
  const availableHeadingCount =
    typeof limit === "number"
      ? `${availableGroups.length} of ${limit}`
      : String(availableGroups.length);

  function renderGroupCard(group) {
    const isArchived = group.status === "archived";
    const structured = isStructuredGroup(group);
    const planLocked = isGroupPlanLocked(group);
    const structuredFeatureLocked = structured && !canCreateStructuredGroups(session);
    const openable = !isArchived && !planLocked;
    const participantCount =
      (group.member_count || 0) + (group.group_only_participant_count || 0);
    return (
      <article
        key={group.id}
        className={`group-card${
          structured ? " group-card-structured" : " group-card-standard"
        }${isArchived ? " group-card-archived" : ""}${
          planLocked ? " group-card-plan-locked" : ""
        }`}
        data-group-type={structured ? "structured" : "standard"}
        data-plan-locked={planLocked ? "true" : "false"}
        onClick={
          openable
            ? () => onNavigate({ name: "group-detail", groupId: group.id })
            : undefined
        }
        role={openable ? "button" : undefined}
        tabIndex={openable ? 0 : undefined}
        aria-disabled={planLocked ? "true" : undefined}
        onKeyDown={
          openable
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onNavigate({ name: "group-detail", groupId: group.id });
                }
              }
            : undefined
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
            {planLocked ? <span className="plan-locked-badge">Plan locked</span> : null}
            {structuredFeatureLocked ? (
              <span className="plan-locked-badge">Business feature</span>
            ) : null}
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
        {planLocked ? (
          <p className="plan-locked-copy">
            {structuredFeatureLocked
              ? "Upgrade to Business to access this Group."
              : "Locked by current plan"}
          </p>
        ) : null}
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
              disabled={planLocked}
              title={planLocked ? "Locked by current plan" : undefined}
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
  }

  if (selectionOpen && mustSelect) {
    return (
      <div className="page">
        <PageHeader title="Groups" description={selectionNotice} />
        <PlanLockSelectionPanel
          kind={selectionKind}
          title={selectionTitle}
          description={
            archived
              ? "No archived Groups are preselected. Select exactly the plan allowance."
              : "No Groups are preselected. Select exactly the plan allowance."
          }
          startEmpty
          onSave={saveAvailability}
          onCancel={() => setSelectionOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Groups"
        description={
          staffScoped
            ? "Groups assigned to your staff account."
            : "Reusable participation and activity configurations for this workspace."
        }
        actions={
          canConfigure && !mustSelect ? (
            <button type="button" className="btn-primary" onClick={() => onNavigate({ name: "group-editor" })}>
              Create Group
            </button>
          ) : null
        }
      />
      {capacityCaption ? (
        <p className="plan-usage-hint" aria-live="polite">
          {capacityCaption}
        </p>
      ) : null}
      <AdBanner session={session} placement={PLACEMENT_GROUPS_BANNER} />
      {mustSelect ? (
        <div className="plan-selection-notice" role="status">
          <div>
            <strong>Plan capacity needs a decision</strong>
            <p>{selectionNotice}</p>
            <p className="hint">
              Until you choose, affected Groups stay plan-locked. Kiosk launch and operational
              changes are blocked.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setSelectionOpen(true)}>
            Choose available Groups
          </button>
        </div>
      ) : null}
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
          <h2>{archived ? "No archived Groups" : staffScoped ? "No Groups assigned" : "No Groups yet"}</h2>
          <p>
            {archived
              ? "Archived Groups appear here. Restore them or delete them permanently."
              : staffScoped
                ? "No Groups have been assigned to your account. Contact your workspace owner or admin."
                : "Create a Group to configure check-in behavior and add people."}
          </p>
          {archived || staffScoped || mustSelect ? null : (
            <div className="empty-state-action">
              <button type="button" className="btn-primary" onClick={() => onNavigate({ name: "group-editor" })}>
                Create Group
              </button>
            </div>
          )}
        </div>
      ) : null}
      {!loading && groups.length > 0 ? (
        <div className="groups-list-sections">
          {showPlanSections ? (
            <>
              <section className="groups-plan-section" aria-label="Available Groups">
                <header className="groups-plan-section-heading">
                  <h3>Available Groups</h3>
                  <p>{availableHeadingCount}</p>
                </header>
                <div className="card-grid">{availableGroups.map(renderGroupCard)}</div>
              </section>
              <section className="groups-plan-section is-locked" aria-label="Locked by current plan">
                <header className="groups-plan-section-heading">
                  <h3>Locked by current plan</h3>
                  <p>
                    {lockedGroups.length} Group{lockedGroups.length === 1 ? "" : "s"}
                  </p>
                </header>
                <div className="card-grid">{lockedGroups.map(renderGroupCard)}</div>
              </section>
            </>
          ) : (
            <div className="card-grid">{groups.map(renderGroupCard)}</div>
          )}
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
