import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { canManageWorkspace, hasPlanFeature } from "@checkstation/domain";
import { Alert, Badge, Button, DataRow, Empty, Field, Input, Loading, Modal, Page, PageHeader, Segmented, Select, formatError } from "../components/ui";
import { useApp } from "../lib/AppProvider";

type Group = { id: number; name: string; group_type: "standard" | "structured"; status: string; participant_count?: number; member_count?: number; group_only_participant_count?: number; is_plan_locked?: boolean };

export function GroupsPage({ initialCreate = false }: { initialCreate?: boolean } = {}) {
  const { api, authState, t } = useApp();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Group[]>([]);
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(initialCreate);
  const canManage = canManageWorkspace(authState.session);
  const structuredAllowed = hasPlanFeature(authState.session, "structured_groups");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const query = new URLSearchParams({ status });
    if (search.trim()) query.set("search", search.trim());
    try {
      const data = await api.get<Group[] | { results: Group[] }>(`${endpoints.groups()}?${query}`);
      setRows(Array.isArray(data) ? data : data.results || []);
    } catch (caught) { setError(formatError(caught, t("common.error"))); }
    finally { setLoading(false); }
  }, [api, search, status, t]);
  useEffect(() => { void load(); }, [load]);

  return <Page>
    <PageHeader title={t("groups.title")} description={t("groups.description")} actions={canManage && status === "active" ? <Button onClick={() => setCreating(true)}>{t("groups.create")}</Button> : undefined} />
    <div className="tabs-line">
      <Segmented value={status} onChange={setStatus} options={[{ value: "active", label: t("groups.active") }, { value: "archived", label: t("groups.archived") }]} />
      <form className="toolbar" onSubmit={(event) => { event.preventDefault(); void load(); }}><Input className="input search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("groups.search")} /><Button type="submit" variant="secondary">{t("history.searchAction")}</Button></form>
    </div>
    <Alert>{error}</Alert>
    {loading ? <Loading label={t("groups.loading")} /> : rows.length ? <div className="data-list">{rows.map((group) => <DataRow key={group.id} title={group.name} detail={`${group.participant_count ?? ((group.member_count || 0) + (group.group_only_participant_count || 0))} ${t("groups.participantLabel")}`} badge={<><Badge tone="blue">{t(group.group_type === "structured" ? "groups.structured" : "groups.standard")}</Badge>{group.is_plan_locked ? <Badge tone="warning">{t("groups.planLocked")}</Badge> : status === "archived" ? <Badge>{t("groups.archivedLabel")}</Badge> : null}</>} onClick={() => navigate(`/groups/${group.id}`)} />)}</div> : <Empty title={search ? t("groups.emptyFilteredTitle") : t("groups.emptyTitle")} body={search ? t("groups.emptyFilteredBody") : t("groups.emptyBody")} />}
    {creating ? <GroupCreate structuredAllowed={structuredAllowed} onClose={() => setCreating(false)} onSaved={(group) => { setCreating(false); navigate(`/groups/${group.id}`); }} /> : null}
  </Page>;
}

function GroupCreate({ structuredAllowed, onClose, onSaved }: { structuredAllowed: boolean; onClose: () => void; onSaved: (group: Group) => void }) {
  const { api, t } = useApp(); const [name, setName] = useState(""); const [type, setType] = useState<"standard" | "structured">("standard"); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [fields, setFields] = useState<Record<string, string>>({});
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); setFields({}); try { onSaved(await api.post<Group>(endpoints.groups(), { name: name.trim(), group_type: type })); } catch (caught) { if (caught instanceof ApiError) setFields(fieldErrorsFromBody(caught.data)); setError(formatError(caught, t("common.error"))); } finally { setBusy(false); } }
  return <Modal title={t("groups.create")} onClose={onClose} actions={<><Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button form="group-create" type="submit" loading={busy}>{t("groups.create")}</Button></>}><form id="group-create" className="form" onSubmit={submit}><Field label={t("groups.name")} error={fields.name}><Input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label={t("groups.type")} error={fields.group_type}><Select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="standard">{t("groups.standard")}</option>{structuredAllowed ? <option value="structured">{t("groups.structured")}</option> : null}</Select></Field><Alert>{error}</Alert></form></Modal>;
}
