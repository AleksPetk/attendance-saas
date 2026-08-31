import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, errorMessage } from "./api.js";
import { ConfirmDialog, ErrorBanner, LoadingState, PageHeader } from "./components.jsx";
import { EmptyState, PersonRow } from "./WorkspaceLayout.jsx";
import { memberSecondaryLine } from "./memberForm.js";
import {
  isMemberPlanLocked,
  partitionMembersByPlanAvailability,
} from "./membersListOrdering.js";
import PlanLockSelectionPanel from "./PlanLockSelectionPanel.jsx";
import { canManageOwnerAccount } from "./workspaceSession.js";
import {
  groupsCapacityCaption,
  planLimitValue,
  selectionRequired,
  workspacePlanDisplayName,
} from "./workspaceEntitlements.js";

export default function MembersScreen({ session, setSession, onNavigate }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") === "archived" ? "archived" : "active";
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [selectionOpen, setSelectionOpen] = useState(false);

  const owner = canManageOwnerAccount(session);
  const mustSelect = owner && selectionRequired(session, "members");
  const planName = workspacePlanDisplayName(session);
  const limit = planLimitValue(session, "members");
  const capacityCaption =
    statusFilter === "active"
      ? groupsCapacityCaption(session, "members", "Members")
      : "";
  const selectionNotice =
    typeof limit === "number"
      ? `Your ${planName} plan includes ${limit} Member${limit === 1 ? "" : "s"}. Choose the ${limit} Members you want to keep available.`
      : "Choose which Members remain available under the current plan.";

  async function load() {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ status: statusFilter });
    if (search.trim()) {
      params.set("search", search.trim());
    }
    try {
      const result = await api.listMembers(session, `?${params.toString()}`);
      setMembers(result.data);
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

  async function saveAvailability(selectedIds) {
    await api.putPlanLockSelection(session, {
      kind: "members",
      selected_ids: selectedIds,
    });
    const result = await api.loadWorkspace(session);
    if (typeof setSession === "function") {
      setSession({ workspace: result.data });
    }
    setSelectionOpen(false);
    await load();
  }

  async function archiveMember(member) {
    if (
      !window.confirm(
        `Archive ${member.name}? They will be hidden from Groups and kiosks until restored.`
      )
    ) {
      return;
    }
    try {
      await api.archiveMember(session, member.id);
      await load();
    } catch (archiveError) {
      setError(errorMessage(archiveError));
    }
  }

  async function restoreMember(member) {
    try {
      await api.restoreMember(session, member.id);
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
      await api.permanentlyDeleteMember(session, pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setDeleting(false);
    }
  }

  const { available: availableMembers, locked: lockedMembers } =
    partitionMembersByPlanAvailability(members);
  const showPlanSections =
    statusFilter === "active" &&
    availableMembers.length > 0 &&
    lockedMembers.length > 0;
  const availableHeadingCount =
    typeof limit === "number"
      ? `${availableMembers.length} of ${limit}`
      : String(availableMembers.length);

  function renderMemberRow(member) {
    const secondary = memberSecondaryLine(member);
    const archived = member.status === "archived";
    const planLocked = !archived && isMemberPlanLocked(member);
    return (
      <PersonRow
        key={member.id}
        person={member}
        status={member.status}
        inactive={archived}
        planLocked={planLocked}
        subtitle={
          planLocked ? (
            <>
              {secondary.length > 0
                ? secondary.map((item) => <span key={item}>{item}</span>)
                : null}
              <span className="plan-locked-copy">Locked by current plan</span>
            </>
          ) : secondary.length > 0 ? (
            secondary.map((item) => <span key={item}>{item}</span>)
          ) : (
            <span>No contact details</span>
          )
        }
        onOpen={
          archived || planLocked || mustSelect
            ? undefined
            : () => onNavigate({ name: "member-profile", memberId: member.id })
        }
        actions={
          mustSelect || planLocked ? null : archived ? (
            <>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => restoreMember(member)}
              >
                Restore
              </button>
              <button
                type="button"
                className="btn-danger-soft btn-sm"
                onClick={() => setPendingDelete(member)}
              >
                Delete permanently
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={(event) => {
                event.stopPropagation();
                archiveMember(member);
              }}
            >
              Archive
            </button>
          )
        }
      />
    );
  }

  if (selectionOpen && mustSelect) {
    return (
      <div className="page">
        <PageHeader title="Members" description={selectionNotice} />
        <PlanLockSelectionPanel
          kind="members"
          title="Choose available Members"
          description="No Members are preselected. Select exactly the plan allowance. Search to find people in large workspaces."
          startEmpty
          enableSearch
          onSave={saveAvailability}
          onCancel={() => setSelectionOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Members"
        description="Reusable people in this workspace. They do not log in."
        actions={
          !mustSelect && statusFilter === "active" ? (
            <button
              type="button"
              className="btn-primary"
              data-tutorial-target="members-add"
              onClick={() => onNavigate({ name: "member-create" })}
            >
              Add Member
            </button>
          ) : null
        }
      />
      {capacityCaption ? (
        <p className="plan-usage-hint" aria-live="polite">
          {capacityCaption}
        </p>
      ) : null}

      {mustSelect ? (
        <div className="plan-selection-notice" role="status">
          <div>
            <strong>Plan capacity needs a decision</strong>
            <p>{selectionNotice}</p>
            <p className="hint">
              Until you choose, Member profile management stays locked. Existing Group
              participation is preserved.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setSelectionOpen(true)}>
            Choose available Members
          </button>
        </div>
      ) : null}

      <div className="toolbar card-surface" data-tutorial-target="members-list">
        <input
          className="search-input"
          placeholder="Search name, email, phone, address, or #ID"
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

      {loading ? <LoadingState label="Loading Members…" /> : null}

      {!loading && members.length === 0 ? (
        <EmptyState
          title={statusFilter === "archived" ? "No archived Members" : "No Members yet"}
          body={
            statusFilter === "archived"
              ? "Archived Members appear here. Restore them or delete them permanently."
              : "Add a reusable person with just a name, then attach them to Groups when needed."
          }
          action={
            statusFilter === "archived" || mustSelect ? null : (
              <button
                type="button"
                className="btn-primary"
                onClick={() => onNavigate({ name: "member-create" })}
              >
                Add Member
              </button>
            )
          }
        />
      ) : null}

      {!loading && members.length > 0 && showPlanSections ? (
        <div className="groups-list-sections">
          <section className="groups-plan-section" aria-label="Available Members">
            <header className="groups-plan-section-heading">
              <h3>Available Members</h3>
              <p>{availableHeadingCount}</p>
            </header>
            <div className="list">{availableMembers.map(renderMemberRow)}</div>
          </section>
          <section className="groups-plan-section is-locked" aria-label="Locked by current plan">
            <header className="groups-plan-section-heading">
              <h3>Locked by current plan</h3>
              <p>
                {lockedMembers.length} Member{lockedMembers.length === 1 ? "" : "s"}
              </p>
            </header>
            <div className="list">{lockedMembers.map(renderMemberRow)}</div>
          </section>
        </div>
      ) : null}

      {!loading && members.length > 0 && !showPlanSections ? (
        <div className="list">{members.map(renderMemberRow)}</div>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="Permanently delete Member?"
          body={`Permanently delete ${pendingDelete.name} (#${pendingDelete.id})? This action cannot be undone.`}
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
