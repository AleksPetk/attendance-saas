import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { api } from "./api.js";
import { ConfirmDialog, ErrorBanner, LoadingState, PageHeader } from "./components.jsx";
import { EmptyState, PersonRow } from "./WorkspaceLayout.jsx";
import { localizedErrorMessage } from "./i18n/errorMessages.js";
import { usePageTitle } from "./i18n/usePageTitle.js";
import { memberSecondaryLine } from "./memberForm.js";
import { memberUsageMetrics } from "./memberUsage.js";
import {
  filterAndSortMembers,
  isMemberPlanLocked,
  partitionMembersByPlanAvailability,
} from "./membersListOrdering.js";
import PlanLockSelectionPanel from "./PlanLockSelectionPanel.jsx";
import { canManageOwnerAccount } from "./workspaceSession.js";
import {
  entitlementsFromSession,
  planLimitValue,
  selectionRequired,
  usageTotalValue,
  workspacePlanDisplayName,
} from "./workspaceEntitlements.js";

export default function MembersScreen({ session, setSession, onNavigate }) {
  const { t } = useTranslation(["members", "common", "errors"]);
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") === "archived" ? "archived" : "active";
  const [search, setSearch] = useState("");
  const [profileFilter, setProfileFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [selectionOpen, setSelectionOpen] = useState(false);

  usePageTitle("pageTitles.members", { ns: "workspace" });

  const owner = canManageOwnerAccount(session);
  const mustSelect = owner && selectionRequired(session, "members");
  const planName = workspacePlanDisplayName(session);
  const limit = planLimitValue(session, "members");
  const memberCount = usageTotalValue(session, "members");
  const entitlementLimits = entitlementsFromSession(session)?.limits;
  const hasMemberLimit = Boolean(
    entitlementLimits && Object.prototype.hasOwnProperty.call(entitlementLimits, "members"),
  );
  const usage = memberUsageMetrics(memberCount, limit, {
    unlimited: hasMemberLimit && entitlementLimits.members == null,
  });
  const selectionNotice =
    typeof limit === "number"
      ? t("planSelection.noticeWithLimit", { planName, limit, count: limit })
      : t("planSelection.noticeGeneric");

  async function load(searchValue = search) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ status: statusFilter });
    if (searchValue.trim()) {
      params.set("search", searchValue.trim());
    }
    try {
      const result = await api.listMembers(session, `?${params.toString()}`);
      setMembers(result.data);
    } catch (loadError) {
      setError(localizedErrorMessage(loadError, t));
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

  function clearFilters() {
    setSearch("");
    setProfileFilter("all");
    setSortOrder("newest");
    load("");
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
    if (!window.confirm(t("confirmArchive", { name: member.name }))) {
      return;
    }
    try {
      await api.archiveMember(session, member.id);
      await load();
    } catch (archiveError) {
      setError(localizedErrorMessage(archiveError, t));
    }
  }

  async function restoreMember(member) {
    try {
      await api.restoreMember(session, member.id);
      await load();
    } catch (restoreError) {
      setError(localizedErrorMessage(restoreError, t));
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
      setError(localizedErrorMessage(deleteError, t));
    } finally {
      setDeleting(false);
    }
  }

  const visibleMembers = useMemo(
    () => filterAndSortMembers(members, { profile: profileFilter, sort: sortOrder }),
    [members, profileFilter, sortOrder],
  );
  const { available: availableMembers, locked: lockedMembers } =
    partitionMembersByPlanAvailability(visibleMembers);
  const showPlanSections =
    statusFilter === "active" &&
    availableMembers.length > 0 &&
    lockedMembers.length > 0;
  const hasNarrowingFilters = Boolean(search.trim()) || profileFilter !== "all";
  const hasChangedControls = hasNarrowingFilters || sortOrder !== "newest";
  const availableHeadingCount =
    typeof limit === "number"
      ? t("count.availableOfLimit", { available: availableMembers.length, limit })
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
              <span className="plan-locked-copy">{t("planLockedCopy")}</span>
            </>
          ) : secondary.length > 0 ? (
            secondary.map((item) => <span key={item}>{item}</span>)
          ) : (
            <span>{t("noContactDetails")}</span>
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
                {t("restore")}
              </button>
              <button
                type="button"
                className="btn-danger-soft btn-sm"
                onClick={() => setPendingDelete(member)}
              >
                {t("deletePermanently")}
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
              {t("archive")}
            </button>
          )
        }
      />
    );
  }

  if (selectionOpen && mustSelect) {
    return (
      <div className="page">
        <PageHeader title={t("title")} description={selectionNotice} />
        <PlanLockSelectionPanel
          kind="members"
          title={t("planSelection.panelTitle")}
          description={t("planSelection.panelDescription")}
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
        title={t("title")}
        actions={
          !mustSelect && statusFilter === "active" ? (
            <button
              type="button"
              className="btn-primary"
              data-tutorial-target="members-add"
              onClick={() => onNavigate({ name: "member-create" })}
            >
              {t("addMember")}
            </button>
          ) : null
        }
      />
      {statusFilter === "active" && usage ? (
        <section className="members-usage" aria-label={t("usage.label")} aria-live="polite">
          <div className="members-usage-copy">
            <strong>{t("usage.memberCount", { count: usage.count })}</strong>
            <span>
              {usage.unlimited
                ? t("usage.unlimited")
                : t("usage.remaining", { count: usage.remaining })}
            </span>
          </div>
          {!usage.unlimited ? (
            <div
              className="members-usage-progress"
              role="progressbar"
              aria-label={t("usage.progressLabel")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={usage.percentage}
              aria-valuetext={t("usage.progressValue", {
                count: usage.count,
                limit: usage.limit,
              })}
            >
              <span style={{ width: `${usage.percentage}%` }} />
            </div>
          ) : null}
        </section>
      ) : null}

      <div
        className="history-view-switch groups-view-switch members-view-switch"
        data-tutorial-target="members-status-filter"
        role="tablist"
        aria-label={t("views.ariaLabel")}
      >
        {[
          { id: "active", label: t("views.active") },
          { id: "archived", label: t("views.archived") },
        ].map((view) => {
          const selected = statusFilter === view.id;
          return (
            <button
              key={view.id}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={`history-view-tab${selected ? " is-active" : ""}`}
              onClick={() => setStatusFilter(view.id)}
            >
              {view.label}
            </button>
          );
        })}
      </div>

      {mustSelect ? (
        <div className="plan-selection-notice" role="status">
          <div>
            <strong>{t("planSelection.needsDecision")}</strong>
            <p>{selectionNotice}</p>
            <p className="hint">{t("planSelection.hint")}</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setSelectionOpen(true)}>
            {t("planSelection.chooseButton")}
          </button>
        </div>
      ) : null}

      <div className="groups-toolbar members-toolbar card-surface" data-tutorial-target="members-list">
        <label className="groups-toolbar-field groups-toolbar-search">
          <span>{t("filters.search")}</span>
          <input
            className="search-input"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                load();
              }
            }}
          />
        </label>
        <label className="groups-toolbar-field">
          <span>{t("filters.profile")}</span>
          <select value={profileFilter} onChange={(event) => setProfileFilter(event.target.value)}>
            <option value="all">{t("filters.allMembers")}</option>
            <option value="with_email">{t("filters.withEmail")}</option>
            <option value="without_email">{t("filters.withoutEmail")}</option>
            <option value="with_phone">{t("filters.withPhone")}</option>
            <option value="without_phone">{t("filters.withoutPhone")}</option>
          </select>
        </label>
        <label className="groups-toolbar-field groups-toolbar-sort">
          <span>{t("filters.sortBy")}</span>
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
            <option value="newest">{t("sort.newest")}</option>
            <option value="oldest">{t("sort.oldest")}</option>
            <option value="name_asc">{t("sort.nameAsc")}</option>
            <option value="name_desc">{t("sort.nameDesc")}</option>
          </select>
        </label>
        <button type="button" className="btn-secondary groups-toolbar-submit" onClick={() => load()}>
          {t("common:search")}
        </button>
        <button
          type="button"
          className="btn-ghost groups-toolbar-clear"
          onClick={clearFilters}
          disabled={!hasChangedControls}
        >
          {t("filters.clear")}
        </button>
      </div>

      <ErrorBanner message={error} />

      {loading ? <LoadingState label={t("loading")} /> : null}

      {!loading && visibleMembers.length === 0 ? (
        <EmptyState
          title={
            hasNarrowingFilters
              ? t("empty.filteredTitle")
              : statusFilter === "archived"
                ? t("empty.archivedTitle")
                : t("empty.activeTitle")
          }
          body={
            hasNarrowingFilters
              ? t("empty.filteredBody")
              : statusFilter === "archived"
                ? t("empty.archivedBody")
                : t("empty.activeBody")
          }
          action={
            hasNarrowingFilters ? (
              <button type="button" className="btn-secondary" onClick={clearFilters}>
                {t("filters.clear")}
              </button>
            ) : statusFilter === "archived" || mustSelect ? null : (
              <button
                type="button"
                className="btn-primary"
                onClick={() => onNavigate({ name: "member-create" })}
              >
                {t("addMember")}
              </button>
            )
          }
        />
      ) : null}

      {!loading && visibleMembers.length > 0 && showPlanSections ? (
        <div className="groups-list-sections">
          <section className="groups-plan-section" aria-label={t("sections.availableAria")}>
            <header className="groups-plan-section-heading">
              <h3>{t("sections.available")}</h3>
              <p>{availableHeadingCount}</p>
            </header>
            <div className="list">{availableMembers.map(renderMemberRow)}</div>
          </section>
          <section className="groups-plan-section is-locked" aria-label={t("sections.lockedAria")}>
            <header className="groups-plan-section-heading">
              <h3>{t("sections.locked")}</h3>
              <p>{t("count.lockedMembers", { count: lockedMembers.length })}</p>
            </header>
            <div className="list">{lockedMembers.map(renderMemberRow)}</div>
          </section>
        </div>
      ) : null}

      {!loading && visibleMembers.length > 0 && !showPlanSections ? (
        <div className="list">{visibleMembers.map(renderMemberRow)}</div>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={t("confirmDeleteTitle")}
          body={t("confirmDeleteBody", { name: pendingDelete.name, id: pendingDelete.id })}
          confirmLabel={t("deletePermanently")}
          danger
          busy={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmPermanentDelete}
        />
      ) : null}
    </div>
  );
}
