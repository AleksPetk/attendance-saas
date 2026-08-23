import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, errorMessage } from "./api.js";
import { ConfirmDialog, ErrorBanner, LoadingState, PageHeader } from "./components.jsx";
import { EmptyState, PersonRow } from "./WorkspaceLayout.jsx";
import { memberSecondaryLine } from "./memberForm.js";

export default function MembersScreen({ session, onNavigate }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") === "archived" ? "archived" : "active";
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState([]);
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

  return (
    <div className="page">
      <PageHeader
        title="Members"
        description="Reusable people in this workspace. They do not log in."
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => onNavigate({ name: "member-create" })}
          >
            Add Member
          </button>
        }
      />

      <div className="toolbar card-surface">
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
            statusFilter === "archived" ? null : (
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

      {!loading && members.length > 0 ? (
        <div className="list">
          {members.map((member) => {
            const secondary = memberSecondaryLine(member);
            const archived = member.status === "archived";
            return (
              <PersonRow
                key={member.id}
                person={member}
                status={member.status}
                inactive={archived}
                subtitle={
                  secondary.length > 0 ? (
                    secondary.map((item) => <span key={item}>{item}</span>)
                  ) : (
                    <span>No contact details</span>
                  )
                }
                onOpen={
                  archived
                    ? undefined
                    : () => onNavigate({ name: "member-profile", memberId: member.id })
                }
                actions={
                  archived ? (
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
          })}
        </div>
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
