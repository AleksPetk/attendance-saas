import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { canManageWorkspace, hasPlanFeature } from "@checkstation/domain";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, Modal, Page, Segmented, Select, formatError } from "../components/ui";
import { useApp } from "../lib/AppProvider";
import { enabledGroupActions, filterAndSortGroups, groupParticipantCounts, groupUsageMetrics, type EnabledGroupAction, type GroupListItem, type GroupSortOrder, type GroupTypeFilter } from "../lib/groups";

type Group = GroupListItem & {
  id: number;
  name: string;
  group_type: "standard" | "structured";
  status: string;
  member_count?: number;
  group_only_participant_count?: number;
  is_plan_locked?: boolean;
  readiness?: { setup_complete?: boolean } | null;
};

export function GroupsPage({ initialCreate = false }: { initialCreate?: boolean } = {}) {
  const { api, authState, t } = useApp();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Group[]>([]);
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [type, setType] = useState<GroupTypeFilter>("all");
  const [sort, setSort] = useState<GroupSortOrder>("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(initialCreate);
  const canManage = canManageWorkspace(authState.session);
  const structuredAllowed = hasPlanFeature(authState.session, "structured_groups");

  const load = useCallback(async (searchValue: string) => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ status });
    if (searchValue.trim()) query.set("search", searchValue.trim());
    try {
      const data = await api.get<Group[] | { results: Group[] }>(`${endpoints.groups()}?${query}`);
      setRows(Array.isArray(data) ? data : data.results || []);
    } catch (caught) {
      setError(formatError(caught, t("common.error")));
    } finally {
      setLoading(false);
    }
  }, [api, status, t]);

  useEffect(() => { void load(appliedSearch); }, [appliedSearch, load]);

  const entitlements = authState.session?.workspace?.entitlements;
  const standardUsage = groupUsageMetrics(entitlements?.usage_totals?.active_standard_groups ?? entitlements?.usage?.active_standard_groups, entitlements?.limits?.active_standard_groups);
  const structuredUsage = groupUsageMetrics(entitlements?.usage_totals?.active_structured_groups ?? entitlements?.usage?.active_structured_groups, entitlements?.limits?.active_structured_groups);
  const visibleRows = filterAndSortGroups(rows, { type, sort }) as Group[];
  const hasChangedControls = Boolean(appliedSearch) || type !== "all" || sort !== "newest";
  const hasNarrowingFilters = Boolean(appliedSearch) || type !== "all";

  function applyFilters() {
    const nextSearch = search.trim();
    if (nextSearch === appliedSearch) void load(nextSearch);
    else setAppliedSearch(nextSearch);
  }

  function clearFilters() {
    setSearch("");
    setType("all");
    setSort("newest");
    if (appliedSearch) setAppliedSearch("");
    else void load("");
  }

  return <Page>
    <div className="groups-controls-head">
      {standardUsage || structuredUsage ? <section aria-label={t("groups.usageLabel")} aria-live="polite" className="groups-usage">
        <GroupUsage label={t("groups.standardGroups")} tone="standard" usage={standardUsage} />
        <GroupUsage label={t("groups.structuredGroups")} tone="structured" usage={structuredUsage} />
      </section> : <span />}
      {canManage && status === "active" ? <Button onClick={() => setCreating(true)}>{t("groups.create")}</Button> : null}
    </div>

    <div className="groups-status-switch">
      <Segmented label={t("groups.viewsLabel")} onChange={setStatus} options={[{ value: "active", label: t("groups.activeGroups") }, { value: "archived", label: t("groups.archivedGroups") }]} value={status} />
    </div>

    <Card className="groups-filter-card">
      <form className="groups-filter-form" onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
        <Field label={t("groups.filterSearch")}>
          <Input onChange={(event) => setSearch(event.target.value)} placeholder={t("groups.searchPlaceholder")} value={search} />
        </Field>
        <div className="groups-filter-grid">
          <Field label={t("groups.filterType")}>
            <Select onChange={(event) => setType(event.target.value as GroupTypeFilter)} value={type}>
              <option value="all">{t("groups.allGroups")}</option>
              <option value="standard">{t("groups.standard")}</option>
              <option value="structured">{t("groups.structured")}</option>
            </Select>
          </Field>
          <Field label={t("groups.filterSort")}>
            <Select onChange={(event) => setSort(event.target.value as GroupSortOrder)} value={sort}>
              <option value="newest">{t("groups.newest")}</option>
              <option value="oldest">{t("groups.oldest")}</option>
              <option value="participants_desc">{t("groups.mostParticipants")}</option>
              <option value="participants_asc">{t("groups.fewestParticipants")}</option>
              <option value="structured_first">{t("groups.structuredFirst")}</option>
              <option value="standard_first">{t("groups.standardFirst")}</option>
              <option value="name_asc">{t("groups.nameAsc")}</option>
              <option value="name_desc">{t("groups.nameDesc")}</option>
            </Select>
          </Field>
        </div>
        <div className="groups-filter-actions">
          <Button type="submit">{t("history.searchAction")}</Button>
          <Button disabled={!hasChangedControls && !search.trim()} onClick={clearFilters} type="button" variant="ghost">{t("groups.clear")}</Button>
        </div>
      </form>
    </Card>

    <Alert>{error}</Alert>
    {loading ? <Loading label={t("groups.loading")} /> : visibleRows.length ? <div className="groups-card-grid">{visibleRows.map((group) => <GroupResultCard group={group} key={group.id} onOpen={() => navigate(`/groups/${group.id}`)} />)}</div> : <Empty title={hasNarrowingFilters ? t("groups.emptyFilteredTitle") : status === "active" ? t("groups.emptyActiveTitle") : t("groups.emptyArchivedTitle")} body={hasNarrowingFilters ? t("groups.emptyFilteredBody") : status === "active" ? t("groups.emptyActiveBody") : t("groups.emptyArchivedBody")} />}
    {creating ? <GroupCreate structuredAllowed={structuredAllowed} onClose={() => setCreating(false)} onSaved={(group) => { setCreating(false); navigate(`/groups/${group.id}`); }} /> : null}
  </Page>;
}

function GroupResultCard({ group, onOpen }: { group: Group; onOpen: () => void }) {
  const { t } = useApp();
  const structured = group.group_type === "structured";
  const archived = group.status === "archived";
  const actions = enabledGroupActions(group.actions);
  const participants = groupParticipantCounts(group);
  const statusBadge = archived
    ? <Badge>{t("groups.archivedLabel")}</Badge>
    : group.readiness && !group.readiness.setup_complete
      ? <Badge tone="warning">{t("groups.setupIncomplete")}</Badge>
      : <Badge tone="green">{t("groups.activeLabel")}</Badge>;

  return <button className={`group-result-card is-${structured ? "structured" : "standard"}${archived ? " is-archived" : ""}`} onClick={onOpen} type="button">
    <span className="group-result-card-top">
      <span className="group-result-card-heading">
        <strong>{group.name}</strong>
        <span className="group-result-card-meta">
          <span>{t("groups.groupId", { id: group.id })}</span>
          <span className="group-result-card-type">{t(structured ? "groups.structuredGroup" : "groups.standardGroup")}</span>
        </span>
      </span>
      <span className="group-result-card-badges">
        {group.is_plan_locked ? <Badge tone="warning">{t("groups.planLocked")}</Badge> : null}
        {statusBadge}
      </span>
    </span>
    <span className="group-result-card-actions">
      <span className="group-result-card-label">{t("groups.attendanceActions")}</span>
      {actions.length ? <span className="group-result-action-list">{actions.map((action) => <GroupAction action={action} key={action.kind} />)}</span> : <span className="group-result-card-empty">{t("groups.noAttendanceActions")}</span>}
    </span>
    <span className="group-result-card-participants">
      {structured
        ? t("groups.participantTotal", { count: participants.total })
        : t("groups.participantComposition", { total: participants.total, members: participants.members, groupOnly: participants.groupOnly })}
    </span>
  </button>;
}

function GroupAction({ action }: { action: EnabledGroupAction }) {
  const { t } = useApp();
  const label = action.kind === "check_in"
    ? t("groups.checkInAction")
    : action.kind === "check_out"
      ? t("groups.checkOutAction")
      : t("groups.breaksAction", { max: action.maxBreaks });
  return <span className={`group-result-action is-${action.kind.replace("_", "-")}`}>{label}</span>;
}

function GroupUsage({ label, tone, usage }: { label: string; tone: "standard" | "structured"; usage: ReturnType<typeof groupUsageMetrics> }) {
  const { t } = useApp();
  if (!usage) return null;
  return <div className={`groups-usage-item is-${tone}`}>
    <div className="groups-usage-copy"><strong>{label}</strong><span>{t("groups.usageSummary", { count: usage.count, remaining: usage.remaining })}</span></div>
    <div aria-label={t("groups.usageProgress", { type: label })} aria-valuemax={100} aria-valuemin={0} aria-valuenow={usage.percentage} aria-valuetext={t("groups.usageProgressValue", { type: label, count: usage.count, limit: usage.limit })} className="groups-usage-progress" role="progressbar"><span style={{ width: `${usage.percentage}%` }} /></div>
  </div>;
}

function GroupCreate({ structuredAllowed, onClose, onSaved }: { structuredAllowed: boolean; onClose: () => void; onSaved: (group: Group) => void }) {
  const { api, t } = useApp(); const [name, setName] = useState(""); const [type, setType] = useState<"standard" | "structured">("standard"); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [fields, setFields] = useState<Record<string, string>>({});
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); setFields({}); try { onSaved(await api.post<Group>(endpoints.groups(), { name: name.trim(), group_type: type })); } catch (caught) { if (caught instanceof ApiError) setFields(fieldErrorsFromBody(caught.data)); setError(formatError(caught, t("common.error"))); } finally { setBusy(false); } }
  return <Modal title={t("groups.create")} onClose={onClose} actions={<><Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button form="group-create" type="submit" loading={busy}>{t("groups.create")}</Button></>}><form id="group-create" className="form" onSubmit={submit}><Field label={t("groups.name")} error={fields.name}><Input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label={t("groups.type")} error={fields.group_type}><Select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="standard">{t("groups.standard")}</option>{structuredAllowed ? <option value="structured">{t("groups.structured")}</option> : null}</Select></Field><Alert>{error}</Alert></form></Modal>;
}
