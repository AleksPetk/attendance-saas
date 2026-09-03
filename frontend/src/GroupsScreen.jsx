import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { api } from "./api.js";
import { ConfirmDialog, EmptyState, ErrorBanner, LoadingState, PageHeader, StatusBadge } from "./components.jsx";
import { localizedErrorMessage } from "./i18n/errorMessages.js";
import { usePageTitle } from "./i18n/usePageTitle.js";
import {
  canManageGroupConfiguration,
  canManageOwnerAccount,
  isGroupScopedStaff,
} from "./workspaceSession.js";
import {
  canCreateStructuredGroups,
  planLimitValue,
  selectionRequired,
  usageTotalValue,
  workspacePlanDisplayName,
} from "./workspaceEntitlements.js";
import {
  actionSummary,
  formatGroupId,
  groupTypeLabel,
  isStructuredGroup,
  setupIncompleteSummary,
} from "./groupForm.js";
import {
  filterAndSortGroups,
  groupUsageMetrics,
  isGroupPlanLocked,
  participantSummaryForGroup,
  partitionGroupsByPlanAvailability,
} from "./groupsListOrdering.js";
import PlanLockSelectionPanel from "./PlanLockSelectionPanel.jsx";
import AdBanner from "./advertising/AdBanner.jsx";
import { PLACEMENT_GROUPS_BANNER } from "./advertising/placements.js";

export default function GroupsScreen({ session, onNavigate, setSession }) {
  const { t } = useTranslation(["groups", "common", "errors"]);
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") === "archived" ? "archived" : "active";
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [selectionOpen, setSelectionOpen] = useState(false);

  usePageTitle("pageTitles.groups", { ns: "workspace" });

  async function load(searchValue = search) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ status: statusFilter });
    if (searchValue.trim()) {
      params.set("search", searchValue.trim());
    }
    try {
      const result = await api.listGroups(session, `?${params.toString()}`);
      setGroups(result.data);
    } catch (loadError) {
      setError(localizedErrorMessage(loadError, t));
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

  function clearFilters() {
    setSearch("");
    setTypeFilter("all");
    setSortOrder("newest");
    load("");
  }

  async function restoreGroup(group) {
    try {
      await api.restoreGroup(session, group.id);
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
      await api.permanentlyDeleteGroup(session, pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (deleteError) {
      setError(localizedErrorMessage(deleteError, t));
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
  const standardUsage = groupUsageMetrics(
    usageTotalValue(session, "active_standard_groups"),
    planLimitValue(session, "active_standard_groups"),
  );
  const structuredUsage = groupUsageMetrics(
    usageTotalValue(session, "active_structured_groups"),
    planLimitValue(session, "active_structured_groups"),
  );

  const selectionTitle = archived ? t("planSelection.chooseArchived") : t("planSelection.chooseActive");
  const selectionNotice =
    typeof limit === "number"
      ? archived
        ? t("planSelection.noticeArchivedWithLimit", { planName, limit, count: limit })
        : t("planSelection.noticeStandardWithLimit", { planName, limit, count: limit })
      : t("planSelection.noticeGeneric");

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

  const visibleGroups = useMemo(
    () => filterAndSortGroups(groups, { type: typeFilter, sort: sortOrder }),
    [groups, sortOrder, typeFilter],
  );
  const { available: availableGroups, locked: lockedGroups } =
    partitionGroupsByPlanAvailability(visibleGroups);
  const showPlanSections = availableGroups.length > 0 && lockedGroups.length > 0;
  const hasNarrowingFilters = Boolean(search.trim()) || typeFilter !== "all";
  const hasChangedControls = hasNarrowingFilters || sortOrder !== "newest";
  const availableHeadingCount =
    typeof limit === "number"
      ? t("count.availableOfLimit", { available: availableGroups.length, limit })
      : String(availableGroups.length);

  function renderGroupCard(group) {
    const isArchived = group.status === "archived";
    const structured = isStructuredGroup(group);
    const planLocked = isGroupPlanLocked(group);
    const structuredFeatureLocked = structured && !canCreateStructuredGroups(session);
    const openable = !isArchived && !planLocked;
    const participantSummary = participantSummaryForGroup(group);
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
            {planLocked ? <span className="plan-locked-badge">{t("planLocked")}</span> : null}
            {structuredFeatureLocked ? (
              <span className="plan-locked-badge">{t("businessFeature")}</span>
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
            {structuredFeatureLocked ? t("upgradeForStructured") : t("planLockedCopy")}
          </p>
        ) : null}
        {!isArchived && group.readiness && !group.readiness.setup_complete ? (
          <p className="muted warning-text">{setupIncompleteSummary(group.readiness)}</p>
        ) : null}
        <p className="muted">
          {t(participantSummary.translationKey, participantSummary.values)}
        </p>
        {isArchived ? (
          <div className="group-card-actions">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => restoreGroup(group)}
              disabled={planLocked}
              title={planLocked ? t("planLockedCopy") : undefined}
            >
              {t("restore")}
            </button>
            <button
              type="button"
              className="btn-danger-soft btn-sm"
              onClick={() => setPendingDelete(group)}
            >
              {t("deletePermanently")}
            </button>
          </div>
        ) : null}
      </article>
    );
  }

  if (selectionOpen && mustSelect) {
    return (
      <div className="page">
        <PageHeader title={t("title")} description={selectionNotice} />
        <PlanLockSelectionPanel
          kind={selectionKind}
          title={selectionTitle}
          description={
            archived
              ? t("planSelection.panelDescriptionArchived")
              : t("planSelection.panelDescriptionActive")
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
        title={t("title")}
        actions={
          canConfigure && !mustSelect ? (
            <button type="button" className="btn-primary" data-tutorial-target="groups-create" onClick={() => onNavigate({ name: "group-editor" })}>
              {t("createGroup")}
            </button>
          ) : null
        }
      />
      {standardUsage || structuredUsage ? (
        <div className="groups-usage" aria-label={t("usage.label")} aria-live="polite">
          {[
            { key: "standard", label: t("usage.standard"), usage: standardUsage },
            { key: "structured", label: t("usage.structured"), usage: structuredUsage },
          ].map((item) =>
            item.usage ? (
              <section className={`groups-usage-item is-${item.key}`} key={item.key}>
                <div className="groups-usage-copy">
                  <strong>{item.label}</strong>
                  <span>
                    {t("usage.summary", {
                      count: item.usage.count,
                      remaining: item.usage.remaining,
                    })}
                  </span>
                </div>
                <div
                  className="groups-usage-progress"
                  role="progressbar"
                  aria-label={t("usage.progressLabel", { type: item.label })}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={item.usage.percentage}
                  aria-valuetext={t("usage.progressValue", {
                    type: item.label,
                    count: item.usage.count,
                    limit: item.usage.limit,
                  })}
                >
                  <span style={{ width: `${item.usage.percentage}%` }} />
                </div>
              </section>
            ) : null,
          )}
        </div>
      ) : null}
      <AdBanner session={session} placement={PLACEMENT_GROUPS_BANNER} />
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
      <div
        className="history-view-switch groups-view-switch"
        data-tutorial-target="groups-status-filter"
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
      <div className="groups-toolbar card-surface" data-tutorial-target="groups-list">
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
          <span>{t("filters.type")}</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">{t("filters.allGroups")}</option>
            <option value="standard">{t("filters.standardGroups")}</option>
            <option value="structured">{t("filters.structuredGroups")}</option>
          </select>
        </label>
        <label className="groups-toolbar-field groups-toolbar-sort">
          <span>{t("filters.sortBy")}</span>
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
            <option value="newest">{t("sort.newest")}</option>
            <option value="oldest">{t("sort.oldest")}</option>
            <option value="participants_desc">{t("sort.mostParticipants")}</option>
            <option value="participants_asc">{t("sort.fewestParticipants")}</option>
            <option value="structured_first">{t("sort.structuredFirst")}</option>
            <option value="standard_first">{t("sort.standardFirst")}</option>
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
      {!loading && visibleGroups.length === 0 ? (
        <div className="empty-state">
          <h2>
            {hasNarrowingFilters
              ? t("empty.filteredTitle")
              : archived
              ? t("empty.archivedTitle")
              : staffScoped
                ? t("empty.staffTitle")
                : t("empty.activeTitle")}
          </h2>
          <p>
            {hasNarrowingFilters
              ? t("empty.filteredBody")
              : archived
              ? t("empty.archivedBody")
              : staffScoped
                ? t("empty.staffBody")
                : t("empty.activeBody")}
          </p>
          {hasNarrowingFilters ? (
            <div className="empty-state-action">
              <button type="button" className="btn-secondary" onClick={clearFilters}>
                {t("filters.clear")}
              </button>
            </div>
          ) : archived || staffScoped || mustSelect ? null : (
            <div className="empty-state-action">
              <button type="button" className="btn-primary" onClick={() => onNavigate({ name: "group-editor" })}>
                {t("createGroup")}
              </button>
            </div>
          )}
        </div>
      ) : null}
      {!loading && visibleGroups.length > 0 ? (
        <div className="groups-list-sections">
          {showPlanSections ? (
            <>
              <section className="groups-plan-section" aria-label={t("sections.availableAria")}>
                <header className="groups-plan-section-heading">
                  <h3>{t("sections.available")}</h3>
                  <p>{availableHeadingCount}</p>
                </header>
                <div className="card-grid">{availableGroups.map(renderGroupCard)}</div>
              </section>
              <section className="groups-plan-section is-locked" aria-label={t("sections.lockedAria")}>
                <header className="groups-plan-section-heading">
                  <h3>{t("sections.locked")}</h3>
                  <p>{t("count.lockedGroups", { count: lockedGroups.length })}</p>
                </header>
                <div className="card-grid">{lockedGroups.map(renderGroupCard)}</div>
              </section>
            </>
          ) : (
            <div className="card-grid">{visibleGroups.map(renderGroupCard)}</div>
          )}
        </div>
      ) : null}
      {pendingDelete ? (
        <ConfirmDialog
          title={t("confirmDeleteTitle")}
          body={t("confirmDeleteBody", { name: pendingDelete.name })}
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
