import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert as NativeAlert, Text, View } from "react-native";
import { ApiError, endpoints, fieldErrorsFromBody } from "@checkstation/api";
import { hasPlanFeature } from "@checkstation/domain";
import { ManagementSheet } from "./ManagementSheet";
import { Alert, Button, Field, LoadingState, TextLink } from "./ui";
import { FilterTabs, SearchField, SectionCard, StatusPill } from "./mobile";
import { SelectField } from "../features/history/HistoryPicker";
import { useApp } from "../lib/AppProvider";
import { colors, space, type } from "../theme/tokens";

type ClassRecord = { id: number; name: string; status: string; has_class_pin: boolean; participant_count: number };
type Editor = { mode: "create" | "import" } | { mode: "edit"; section: ClassRecord };
export function GroupClasses({ groupId, canManage, renderParticipants }: { groupId: string; canManage: boolean; renderParticipants: (section: ClassRecord) => ReactNode }) {
  const { api, authState, t } = useApp();
  const [rows, setRows] = useState<ClassRecord[]>([]);
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ClassRecord | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows(await api.get<ClassRecord[]>(endpoints.groupClasses(groupId) + "?status=" + status)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); }
    finally { setLoading(false); }
  }, [api, groupId, status, t]);
  useEffect(() => { void load(); }, [load]);
  async function mutate(section: ClassRecord, operation: "archive" | "restore" | "permanently-delete") {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      if (operation === "archive") await api.delete(endpoints.groupClass(groupId, section.id));
      else await api.post(endpoints.groupClass(groupId, section.id) + operation + "/", {});
      setSelected(null); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("common.error")); }
    finally { lock.current = false; setBusy(false); }
  }
  function confirm(section: ClassRecord, operation: "archive" | "permanently-delete") {
    NativeAlert.alert(t(operation === "archive" ? "classes.archive" : "classes.delete"), t(operation === "archive" ? "classes.archiveHint" : "classes.deleteHint", { name: section.name }), [
      { text: t("common.cancel"), style: "cancel" }, { text: t("common.confirm"), style: "destructive", onPress: () => void mutate(section, operation) },
    ]);
  }
  return <View style={{ gap: space.lg }}>
    <Alert message={error} />
    {selected ? <>
      <Button variant="secondary" label={t("classes.back")} onPress={() => { setSelected(null); void load(); }} />
      <SectionCard title={selected.name}><View style={{ gap: space.md }}>
        <StatusPill label={t(selected.status === "archived" ? "groups.archivedLabel" : "groups.activeLabel")} />
        {canManage ? selected.status === "archived" ? <><Button label={t("classes.restore")} disabled={busy} onPress={() => void mutate(selected, "restore")} /><TextLink label={t("classes.delete")} disabled={busy} onPress={() => confirm(selected, "permanently-delete")} /></> : <><Button label={t("classes.edit")} variant="secondary" onPress={() => setEditor({ mode: "edit", section: selected })} /><TextLink label={t("classes.archive")} disabled={busy} onPress={() => confirm(selected, "archive")} /></> : null}
      </View></SectionCard>
      {renderParticipants(selected)}
    </> : <>
      <FilterTabs value={status} onChange={setStatus} options={[{ value: "active", label: t("groups.activeLabel") }, { value: "archived", label: t("groups.archivedLabel") }]} />
      <SearchField value={search} onChangeText={setSearch} placeholder={t("classes.search")} />
      {loading ? <LoadingState label={t("common.loading")} /> : rows.filter((row) => row.name.toLowerCase().includes(search.toLowerCase())).map((row) => <SectionCard key={row.id} title={row.name} description={t("groups.participants", { count: row.participant_count })}><Button variant="secondary" label={t("groups.participantLabel")} onPress={() => setSelected(row)} /></SectionCard>)}
      {!loading && !rows.length ? <Text style={{ ...type.body, color: colors.textMuted }}>{t("classes.empty")}</Text> : null}
      {canManage ? <><Button label={t("classes.create")} onPress={() => setEditor({ mode: "create" })} />{hasPlanFeature(authState.session, "structured_snapshot_import") ? <Button variant="secondary" label={t("classes.import")} onPress={() => setEditor({ mode: "import" })} /> : null}</> : null}
    </>}
    {editor ? <ClassEditor groupId={groupId} editor={editor} onClose={() => setEditor(null)} onSaved={(saved) => { setEditor(null); if (selected) setSelected(saved); void load(); }} /> : null}
  </View>;
}
function ClassEditor({ groupId, editor, onClose, onSaved }: { groupId: string; editor: Editor; onClose: () => void; onSaved: (section: ClassRecord) => void }) {
  const { api, t } = useApp();
  const original = editor.mode === "edit" ? editor.section.name : "";
  const [name, setName] = useState(original);
  const [pin, setPin] = useState("");
  const [source, setSource] = useState("");
  const [sources, setSources] = useState<Array<{ id: number; name: string }>>([]);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (editor.mode !== "import") return;
    let cancelled = false;
    void api.get<Array<{ id: number; name: string }>>(endpoints.groupClasses(groupId) + "import-sources/").then((rows) => { if (!cancelled) setSources(rows); }).catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : t("common.error")); });
    return () => { cancelled = true; };
  }, [api, editor.mode, groupId, t]);
  async function save() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setFields({});
    try {
      const payload = { name: name.trim(), ...(pin ? { class_pin: pin.trim() } : {}) };
      if (editor.mode === "edit") onSaved(await api.patch(endpoints.groupClass(groupId, editor.section.id), payload));
      else if (editor.mode === "import") {
        const result = await api.post<{ section: ClassRecord }>(endpoints.groupClasses(groupId) + "import-standard-group/", { ...payload, source_group_id: Number(source) });
        onSaved(result.section);
      } else onSaved(await api.post(endpoints.groupClasses(groupId), payload));
    } catch (caught) {
      if (caught instanceof ApiError) setFields(fieldErrorsFromBody(caught.data));
      setError(caught instanceof Error ? caught.message : t("common.error"));
    } finally { lock.current = false; setBusy(false); }
  }
  return <ManagementSheet title={t(editor.mode === "edit" ? "classes.edit" : editor.mode === "import" ? "classes.import" : "classes.create")} dirty={name !== original || !!pin || !!source} busy={busy} onClose={onClose}>
    <Alert message={error} />
    {editor.mode === "import" ? <SelectField placeholder={t("classes.source")} searchable label={t("classes.source")} value={source} options={sources.map((row) => ({ value: String(row.id), label: row.name }))} onChange={(value) => { setSource(value); setName(sources.find((row) => String(row.id) === value)?.name || ""); }} t={t} /> : null}
    <Field label={t("classes.name")} value={name} onChangeText={setName} error={fields.name} />
    <Field label={t("groups.requireClassPin")} hint={t("classes.pinHint")} value={pin} onChangeText={setPin} secureTextEntry autoCapitalize="none" error={fields.class_pin} />
    <Button label={t("common.save")} loading={busy} disabled={editor.mode === "import" && !source} onPress={() => void save()} />
  </ManagementSheet>;
}
