import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { endpoints } from "@checkstation/api";
import { canManageGroupConfiguration } from "@checkstation/domain";
import { Alert, Loading, Switch, formatError } from "../components/ui";
import { DesktopKioskRenderer } from "../components/DesktopKioskRenderer";
import { normalizeKioskDesignDocument, type Background, type KioskDesignConfig, type KioskDesignDocument, type TextStyle } from "../lib/kioskDesign";
import type { KioskSettingsApi } from "../lib/kioskSettingsForm";
import { useApp } from "../lib/AppProvider";
import { useForegroundRefresh } from "../lib/useForegroundRefresh";
import { kioskCardHelperKey } from "../lib/kioskCardHelper";
// @ts-expect-error Workspace's unchanged JavaScript template module has no declarations.
import { CARD_TEMPLATE_IDS, patchMainWithCardTemplate } from "../../../../frontend/src/kiosk/cardTemplates.js";
import "../components/cardTemplatePreviews.css";
import "../components/inputTemplatePreviews.css";

type Section = "header" | "main" | "footer" | "cards" | "input";
type Mode = "card" | "input";
type DesignResponse = KioskDesignDocument;
type Preset = { label?: string; description?: string; layout?: string; card?: string; button?: string; input?: string };
type Catalog = Record<"main_layouts" | "button_styles" | "input_styles" | "card_styles" | "card_templates" | "input_templates" | "fonts", Record<string, Preset>>;
type GroupSummary = { name?: string; group_type?: string };
type MediaState = { headerLogo: File | null; footerLogo: File | null; background: File | null; removeHeaderLogo: boolean; removeFooterLogo: boolean; removeBackground: boolean };
type Snapshot = { config: KioskDesignConfig; media: MediaState };

const EMPTY_MEDIA: MediaState = { headerLogo: null, footerLogo: null, background: null, removeHeaderLogo: false, removeFooterLogo: false, removeBackground: false };
const SWATCHES = ["#FFFFFF", "#F8FAFC", "#E2E8F0", "#94A3B8", "#1E293B", "#0F172A", "#000000", "#2563EB", "#3B82F6", "#22C55E", "#16A34A", "#F59E0B", "#EF4444", "#A855F7"];
const SAMPLE_PEOPLE = [["Ada Lovelace", "G12-1001", "ada@example.com"], ["Alex Chen", "G12-1002", "alex@example.com"], ["Grace Hopper", "G12-1005", "grace@example.com"], ["Jordan Lee", "G12-1025", "jordan@example.com"], ["Li Wei", "G12-2210", "li@example.com"], ["Maya Smith", "G12-1024", "maya@example.com"]];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function KioskDesignPage() {
  const { id = "" } = useParams();
  const { api, authState, t } = useApp();
  const navigate = useNavigate();
  const [response, setResponse] = useState<DesignResponse | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [mode, setMode] = useState<Mode>("card");
  const [settings, setSettings] = useState<KioskSettingsApi | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [savedSignature, setSavedSignature] = useState("");
  const [section, setSection] = useState<Section>("header");
  const [sampleCount, setSampleCount] = useState(12);
  const [minimized, setMinimized] = useState(false);
  const [panelPosition, setPanelPosition] = useState(() => ({ x: Math.max(20, window.innerWidth - 410), y: 20 }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [design, presets, groupData, settingsData] = await Promise.all([
        api.get<DesignResponse>(endpoints.kioskDesign(id)), api.get<Catalog>(endpoints.kioskPresets()).catch(() => null),
        api.get<GroupSummary>(endpoints.group(id)), api.get<KioskSettingsApi>(endpoints.kioskSettings(id)).catch(() => null),
      ]);
      const normalized = normalizeKioskDesignDocument(design);
      const kioskMode: Mode = groupData.group_type === "structured" ? "card" : settingsData?.mode === "input" ? "input" : "card";
      const initial = { config: clone(normalized.config), media: { ...EMPTY_MEDIA } };
      setResponse(normalized); setCatalog(presets); setGroup(groupData); setSettings(settingsData); setMode(kioskMode); setSection("header");
      setHistory([initial]); setHistoryIndex(0); setSavedSignature(signature(initial));
    } catch (caught) { setError(formatError(caught, t("common.error"))); }
    finally { setLoading(false); }
  }, [api, id, t]);
  useEffect(() => { void load(); }, [load]);

  const snapshot = history[historyIndex] || null;
  const dirty = Boolean(snapshot && signature(snapshot) !== savedSignature);
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  useEffect(() => { const handler = (event: BeforeUnloadEvent) => { if (!dirty) return; event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler); }, [dirty]);
  const draftState = useRef({ dirty, saving, savedSignature });
  draftState.current = { dirty, saving, savedSignature };
  useForegroundRefresh(async () => {
    if (loading) return;
    const before = draftState.current;
    const latest = normalizeKioskDesignDocument(await api.get<DesignResponse>(endpoints.kioskDesign(id)));
    // Never replace an active draft, including an edit started during the request.
    if (before.dirty || before.saving || draftState.current.dirty || draftState.current.saving || before.savedSignature !== draftState.current.savedSignature) return;
    const saved = { config: clone(latest.config), media: { ...EMPTY_MEDIA } };
    setResponse(latest);
    if (signature(saved) !== before.savedSignature) {
      setHistory([saved]); setHistoryIndex(0); setSavedSignature(signature(saved));
    }
    // Keep section, panel position, minimization and scroll container mounted.
  });

  const commit = useCallback((mutator: (next: Snapshot) => void) => {
    setHistory((current) => {
      const base = current[historyIndex]; if (!base) return current;
      const next = cloneSnapshot(base); mutator(next);
      if (signature(next) === signature(base)) return current;
      const updated = [...current.slice(0, historyIndex + 1), next].slice(-60);
      setHistoryIndex(updated.length - 1); setMessage(""); return updated;
    });
  }, [historyIndex]);

  function back() { if (!dirty || confirm(t("kiosk.unsavedDesignMessage"))) navigate(`/groups/${id}`); }
  async function save() {
    if (!snapshot || !dirty || saving) return;
    const validation = validate(snapshot.config, t); if (validation) { setError(validation); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      const body = new FormData(); body.append("config", JSON.stringify(snapshot.config));
      if (snapshot.media.headerLogo) body.append("header_logo", snapshot.media.headerLogo); else if (snapshot.media.removeHeaderLogo) body.append("remove_header_logo", "true");
      if (snapshot.media.footerLogo) body.append("footer_logo", snapshot.media.footerLogo); else if (snapshot.media.removeFooterLogo) body.append("remove_footer_logo", "true");
      if (snapshot.media.background) body.append("main_background_image", snapshot.media.background); else if (snapshot.media.removeBackground) body.append("remove_main_background_image", "true");
      const result = normalizeKioskDesignDocument(await api.request<DesignResponse>(endpoints.kioskDesign(id), { method: "PUT", formData: body }));
      const saved = { config: clone(result.config), media: { ...EMPTY_MEDIA } };
      setResponse(result); setHistory([saved]); setHistoryIndex(0); setSavedSignature(signature(saved)); setMessage(t("kiosk.designSaved"));
    } catch (caught) { setError(formatError(caught, t("common.error"))); }
    finally { setSaving(false); }
  }

  if (!canManageGroupConfiguration(authState.session)) return <FullscreenState><Alert tone="warning">{t("more.staffRoleDescription")}</Alert></FullscreenState>;
  if (loading || !snapshot) return <FullscreenState>{error ? <Alert>{error}</Alert> : <Loading label={t("kiosk.designLoading")} />}</FullscreenState>;
  const presentationSection: Section = mode === "input" ? "input" : "cards";
  const sections: Section[] = ["header", "main", "footer", presentationSection];
  const display = { showName: settings?.card_show_name !== false, showCode: settings?.card_show_participant_code !== false, showEmail: Boolean(settings?.card_show_email) };

  return <div className="desktop-kiosk-builder">
    <div className="desktop-kiosk-builder-canvas"><EditorPreview snapshot={snapshot} response={response} mode={mode} groupType={group?.group_type} display={display} settings={settings} sampleCount={sampleCount} /></div>
    <div className="desktop-kiosk-builder-chrome">
      {minimized ? <button className="desktop-kiosk-builder-restore" type="button" onClick={() => setMinimized(false)}>✎ {t("kiosk.editor")}</button> : <FloatingPanel title={group?.name || t("groups.title")} section={section} sections={sections} position={panelPosition} onPosition={setPanelPosition} onSection={setSection} onMinimize={() => setMinimized(true)} footer={<><div className="desktop-kiosk-builder-history"><button type="button" disabled={!canUndo} onClick={() => setHistoryIndex((value) => Math.max(0, value - 1))}>↩ {t("kiosk.undo")}</button><button type="button" disabled={!canRedo} onClick={() => setHistoryIndex((value) => Math.min(history.length - 1, value + 1))}>↪ {t("kiosk.redo")}</button><span className={dirty ? "is-dirty" : ""}>{saving ? t("kiosk.savingDesign") : dirty ? t("kiosk.unsaved") : t("kiosk.saved")}</span></div><div className="desktop-kiosk-builder-actions"><button type="button" onClick={back}>{t("common.cancel")}</button><button className="is-primary" type="button" disabled={!dirty || saving} onClick={() => void save()}>{saving ? t("kiosk.savingDesign") : t("common.save")}</button></div></>}>
        <div className="desktop-kiosk-builder-feedback"><Alert>{error}</Alert><Alert tone="success">{message}</Alert></div>
        {section === "header" ? <HeaderEditor snapshot={snapshot} commit={commit} catalog={catalog} response={response} /> : null}
        {section === "main" ? <MainEditor snapshot={snapshot} commit={commit} catalog={catalog} response={response} /> : null}
        {section === "footer" ? <FooterEditor snapshot={snapshot} commit={commit} catalog={catalog} response={response} /> : null}
        {section === "cards" ? <PresentationEditor kind="cards" snapshot={snapshot} commit={commit} catalog={catalog} sampleCount={sampleCount} onSampleCount={setSampleCount} /> : null}
        {section === "input" ? <PresentationEditor kind="input" snapshot={snapshot} commit={commit} catalog={catalog} /> : null}
      </FloatingPanel>}
    </div>
  </div>;
}

function FullscreenState({ children }: { children: React.ReactNode }) { return <div className="desktop-kiosk-builder desktop-kiosk-builder-state">{children}</div>; }
function EditorPreview({ snapshot, response, mode, groupType, display, settings, sampleCount }: { snapshot: Snapshot; response: DesignResponse | null; mode: Mode; groupType?: string; display: { showName: boolean; showCode: boolean; showEmail: boolean }; settings: KioskSettingsApi | null; sampleCount: number }) {
  const { t } = useApp();
  const headerLogo = useObjectUrl(snapshot.media.headerLogo) || (snapshot.media.removeHeaderLogo ? "" : response?.header_logo_url || "");
  const footerLogo = useObjectUrl(snapshot.media.footerLogo) || (snapshot.media.removeFooterLogo ? "" : response?.footer_logo_url || "");
  const background = useObjectUrl(snapshot.media.background) || (snapshot.media.removeBackground ? "" : response?.main_background_image_url || "");
  const design: DesignResponse = { ...(response || {}), config: snapshot.config, header_logo_url: headerLogo, footer_logo_url: footerLogo, main_background_image_url: background };
  const people = Array.from({ length: sampleCount }, (_, index) => {
    const person = SAMPLE_PEOPLE[index % SAMPLE_PEOPLE.length];
    return [person[0], `${person[1]}-${Math.floor(index / SAMPLE_PEOPLE.length) + 1}`, person[2]];
  });
  const helperKey = kioskCardHelperKey({ mode, structured: groupType === "structured", step: "start", participantCount: people.length });
  const helperText = helperKey ? t(helperKey) : "";
  return <DesktopKioskRenderer design={design} kioskMode={mode} helperText={helperText} exitLabel="" onExit={() => undefined} showExit={false}>{mode === "card" ? <div className="kiosk-people-grid desktop-kiosk-builder-samples">{people.map(([name, code, email]) => <article className="kiosk-person-card" key={code}><span className="kiosk-person-avatar kiosk-person-avatar--fallback"><span className="kiosk-person-initials">{initials(name)}</span></span><span className="kiosk-person-content">{display.showName ? <strong className="kiosk-person-name">{name}</strong> : null}{display.showCode ? <span className="kiosk-person-code kiosk-person-sub">{code}</span> : null}{display.showEmail ? <span className="kiosk-person-email kiosk-person-sub">{email}</span> : null}</span></article>)}</div> : <form className="kiosk-flow kiosk-flow--identify kiosk-identify-form desktop-kiosk-builder-input" onSubmit={(event) => event.preventDefault()}><h2>{t("kiosk.previewPerson")}</h2><label><span>{t("kiosk.participantCode")}</span><input readOnly value="G12-1042" /></label>{settings?.input_field_count === 2 ? <label><span>{t(settings.input_second_field === "email" ? "auth.email" : settings.input_second_field === "pin" ? "kiosk.pin" : "members.name")}</span><input readOnly value={settings.input_second_field === "email" ? "jordan@example.com" : settings.input_second_field === "pin" ? "••••" : "Jordan Lee"} /></label> : null}<button className="kiosk-submit" type="button">{t("auth.continue")}</button></form>}</DesktopKioskRenderer>;
}

function FloatingPanel({ title, section, sections, position, onPosition, onSection, onMinimize, footer, children }: { title: string; section: Section; sections: Section[]; position: { x: number; y: number }; onPosition: (position: { x: number; y: number }) => void; onSection: (section: Section) => void; onMinimize: () => void; footer: React.ReactNode; children: React.ReactNode }) {
  const { t } = useApp(); const panelRef = useRef<HTMLElement | null>(null); const dragRef = useRef<{ startX: number; startY: number; x: number; y: number; width: number; height: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = useCallback((x: number, y: number, width: number, height: number) => ({ x: Math.max(16, Math.min(x, window.innerWidth - width - 16)), y: Math.max(16, Math.min(y, window.innerHeight - Math.min(height, window.innerHeight - 32) - 16)) }), []);
  const reclamp = useCallback(() => { const rect = panelRef.current?.getBoundingClientRect(); if (!rect) return; const next = clamp(position.x, position.y, rect.width, rect.height); if (next.x !== position.x || next.y !== position.y) onPosition(next); }, [clamp, onPosition, position.x, position.y]);
  useEffect(() => { window.addEventListener("resize", reclamp); const frame = requestAnimationFrame(reclamp); return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", reclamp); }; }, [reclamp]);
  function start(event: ReactPointerEvent<HTMLDivElement>) { if (event.button !== 0) return; const rect = panelRef.current?.getBoundingClientRect(); if (!rect) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { startX: event.clientX, startY: event.clientY, x: position.x, y: position.y, width: rect.width, height: rect.height }; setDragging(true); }
  function move(event: ReactPointerEvent<HTMLDivElement>) { const drag = dragRef.current; if (drag) onPosition(clamp(drag.x + event.clientX - drag.startX, drag.y + event.clientY - drag.startY, drag.width, drag.height)); }
  function end(event: ReactPointerEvent<HTMLDivElement>) { if (!dragRef.current) return; dragRef.current = null; setDragging(false); try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ } }
  return <aside ref={panelRef} className={`desktop-kiosk-builder-panel${dragging ? " is-dragging" : ""}`} style={{ left: position.x, top: position.y }}><div className="desktop-kiosk-builder-panel-head" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}><span className="desktop-kiosk-builder-grip">⋮⋮</span><span><strong>{t("kiosk.editor")}</strong><small>{title}</small></span><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={onMinimize}>{t("kiosk.minimize")}</button></div><div className="desktop-kiosk-builder-tabs" role="tablist">{sections.map((item) => <button key={item} role="tab" type="button" aria-selected={section === item} className={section === item ? "is-active" : ""} onClick={() => onSection(item)}>{t(`kiosk.${item}`)}</button>)}</div><div className="desktop-kiosk-builder-panel-body">{children}</div><footer className="desktop-kiosk-builder-panel-foot">{footer}</footer></aside>;
}

type EditorProps = { snapshot: Snapshot; commit: (mutator: (next: Snapshot) => void) => void; catalog: Catalog | null; response: DesignResponse | null };
function HeaderEditor({ snapshot, commit, catalog, response }: EditorProps) { const { t } = useApp(); const { header } = snapshot.config; return <EditorSection><BackgroundEditor value={header.background} modes={["solid", "gradient"]} onChange={(background) => commit((next) => { next.config.header.background = background; })} /><Alignment value={header.alignment} onChange={(alignment) => commit((next) => { next.config.header.alignment = alignment; })} /><EditorGroup title={t("kiosk.headerTitle")}><input maxLength={150} placeholder={t("kiosk.optionalTitle")} value={header.title.text || ""} onChange={(event) => commit((next) => { next.config.header.title.text = event.target.value; })} /></EditorGroup><TextEditor value={header.title} catalog={catalog} onChange={(value) => commit((next) => { next.config.header.title = { ...next.config.header.title, ...value }; })} /><MediaEditor kind="header" current={Boolean(snapshot.media.headerLogo || (!snapshot.media.removeHeaderLogo && response?.header_logo_url))} file={snapshot.media.headerLogo} onPick={(file) => commit((next) => { next.media.headerLogo = file; next.media.removeHeaderLogo = false; next.config.header.logo ||= { size: .75 }; })} onRemove={() => commit((next) => { next.media.headerLogo = null; next.media.removeHeaderLogo = true; next.config.header.logo = null; })} />{header.logo ? <Range label={t("kiosk.logoSize")} value={Number(header.logo.size) || .75} min={.35} max={1} step={.05} format={(value) => `${Math.round(value * 100)}%`} onChange={(size) => commit((next) => { next.config.header.logo = { ...(next.config.header.logo || {}), size }; })} /> : null}</EditorSection>; }
function MainEditor({ snapshot, commit, catalog, response }: EditorProps) { const { t } = useApp(); const { main } = snapshot.config; const hasImage = Boolean(snapshot.media.background || (!snapshot.media.removeBackground && response?.main_background_image_url)); return <EditorSection><BackgroundEditor value={main.background} modes={["solid", "gradient", "image"]} onChange={(background) => commit((next) => { next.config.main.background = background; })} />{main.background.mode === "image" ? <><MediaEditor kind="background" current={hasImage} file={snapshot.media.background} onPick={(file) => commit((next) => { next.media.background = file; next.media.removeBackground = false; next.config.main.background.mode = "image"; })} onRemove={() => commit((next) => { next.media.background = null; next.media.removeBackground = true; next.config.main.background.mode = "solid"; })} />{hasImage ? <><Range label={t("kiosk.backgroundZoom")} value={main.image_transform.zoom} min={1} max={5} step={.05} format={(value) => `${value.toFixed(2)}×`} onChange={(zoom) => commit((next) => { next.config.main.image_transform.zoom = zoom; })} /><Range label={t("kiosk.horizontalPosition")} value={main.image_transform.focal_x} min={0} max={1} step={.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(focal_x) => commit((next) => { next.config.main.image_transform.focal_x = focal_x; })} /><Range label={t("kiosk.verticalPosition")} value={main.image_transform.focal_y} min={0} max={1} step={.01} format={(value) => `${Math.round(value * 100)}%`} onChange={(focal_y) => commit((next) => { next.config.main.image_transform.focal_y = focal_y; })} /></> : null}</> : null}<Range label={t("kiosk.overlay")} value={main.overlay} min={-1} max={1} step={.05} format={(value) => value === 0 ? t("kiosk.none") : `${value < 0 ? t("kiosk.darker") : t("kiosk.lighter")} ${Math.round(Math.abs(value) * 100)}%`} onChange={(overlay) => commit((next) => { next.config.main.overlay = overlay; })} /><EditorGroup title={t("kiosk.mainTitle")}><input maxLength={150} placeholder={t("kiosk.optionalTitle")} value={main.title.text || ""} onChange={(event) => commit((next) => { next.config.main.title.text = event.target.value; })} /></EditorGroup><Alignment value={main.title.alignment} onChange={(alignment) => commit((next) => { next.config.main.title.alignment = alignment; })} /><TextEditor value={main.title} catalog={catalog} onChange={(value) => commit((next) => { next.config.main.title = { ...next.config.main.title, ...value }; })} /></EditorSection>; }
function FooterEditor({ snapshot, commit, catalog, response }: EditorProps) { const { t } = useApp(); const { footer } = snapshot.config; const line = footer.text.lines[0] || ""; return <EditorSection><BackgroundEditor value={footer.background} modes={["solid", "gradient"]} onChange={(background) => commit((next) => { next.config.footer.background = background; })} /><EditorGroup title={t("kiosk.footerText")}><input maxLength={200} placeholder={t("kiosk.optionalFooterText")} value={line} onChange={(event) => commit((next) => { const value = event.target.value.replace(/[\r\n]+/g, " "); next.config.footer.text.lines = value ? [value] : []; })} /></EditorGroup><Alignment value={footer.text.alignment} onChange={(alignment) => commit((next) => { next.config.footer.text.alignment = alignment; })} /><TextEditor value={footer.text} catalog={catalog} onChange={(value) => commit((next) => { next.config.footer.text = { ...next.config.footer.text, ...value }; })} /><MediaEditor kind="footer" current={Boolean(snapshot.media.footerLogo || (!snapshot.media.removeFooterLogo && response?.footer_logo_url))} file={snapshot.media.footerLogo} onPick={(file) => commit((next) => { next.media.footerLogo = file; next.media.removeFooterLogo = false; next.config.footer.logo ||= { alignment: "left", size: .75 }; })} onRemove={() => commit((next) => { next.media.footerLogo = null; next.media.removeFooterLogo = true; next.config.footer.logo = null; })} />{footer.logo ? <><Alignment value={footer.logo.alignment || "left"} label={t("kiosk.imagePosition")} onChange={(alignment) => commit((next) => { next.config.footer.logo = { ...(next.config.footer.logo || {}), alignment }; })} /><Range label={t("kiosk.imageSize")} value={Number(footer.logo.size) || .75} min={.35} max={1} step={.05} format={(value) => `${Math.round(value * 100)}%`} onChange={(size) => commit((next) => { next.config.footer.logo = { ...(next.config.footer.logo || {}), size }; })} /></> : null}</EditorSection>; }
function PresentationEditor({ kind, snapshot, commit, catalog, sampleCount, onSampleCount }: { kind: "cards" | "input"; snapshot: Snapshot; commit: EditorProps["commit"]; catalog: Catalog | null; sampleCount?: number; onSampleCount?: (count: number) => void }) { const { t } = useApp(); const main = snapshot.config.main; const items = kind === "cards" ? catalog?.card_templates : catalog?.input_templates; const value = kind === "cards" ? main.card_template : main.input_template; return <EditorSection>{kind === "cards" ? <EditorGroup title={t("kiosk.testParticipants")}><p className="desktop-kiosk-builder-hint">{t("kiosk.fakeParticipantsHint")}</p><div className="desktop-kiosk-builder-chips" role="group" aria-label={t("kiosk.fakeCountAria")}>{[6, 12, 20, 50, 100].map((count) => <button type="button" className={sampleCount === count ? "is-active" : ""} key={count} onClick={() => onSampleCount?.(count)}>{count}</button>)}</div></EditorGroup> : null}<EditorGroup title={t(kind === "cards" ? "kiosk.cardTemplate" : "kiosk.inputTemplate")}><div className="desktop-kiosk-builder-presets">{(kind === "cards" ? (CARD_TEMPLATE_IDS as string[]).map((id) => [id, items?.[id] || { label: humanize(id) }] as [string, Preset]) : Object.entries(items || { [value]: { label: value } })).map(([itemId, meta]) => <button type="button" className={itemId === value ? "is-active" : ""} aria-pressed={itemId === value} key={itemId} onClick={() => commit((next) => { if (kind === "cards") { next.config.main = patchMainWithCardTemplate(next.config.main, itemId); } else { next.config.main.input_template = itemId; if (meta.layout) next.config.main.layout_preset = meta.layout; if (meta.button) next.config.main.button_preset = meta.button; if (meta.input) next.config.main.input_preset = meta.input; } })}>{kind === "cards" ? <CardTemplateMini id={itemId} /> : <InputTemplateMini id={itemId} />}<strong>{meta.label || humanize(itemId)}</strong>{meta.description ? <small>{meta.description}</small> : null}</button>)}</div></EditorGroup></EditorSection>; }

function CardTemplateMini({ id }: { id: string }) {
  return <span className={`kb-card-template-mini kb-card-template-mini--${id}`} aria-hidden="true"><span className="kb-card-mini-deco" /><span className="kb-card-mini-avatar" /><span className="kb-card-mini-body"><span className="kb-card-mini-line kb-card-mini-line-strong" /><span className="kb-card-mini-line" /></span></span>;
}

/** Same miniature structure as browser Workspace InputTemplatePicker. */
function InputTemplateMini({ id }: { id: string }) {
  return (
    <span className={`kb-template-mini kb-template-mini--${id}`} aria-hidden="true">
      <span className="kb-template-mini-deco" />
      <span className="kb-template-mini-field" />
      <span className="kb-template-mini-btn" />
    </span>
  );
}
function EditorSection({ children }: { children: React.ReactNode }) { return <section className="desktop-kiosk-builder-section">{children}</section>; }
function EditorGroup({ title, children }: { title: string; children: React.ReactNode }) { return <div className="desktop-kiosk-builder-group"><h3>{title}</h3><div>{children}</div></div>; }
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) { const { t } = useApp(); return <EditorGroup title={label}><div className="desktop-kiosk-builder-toggle"><span>{t(value ? "kiosk.on" : "kiosk.off")}</span><Switch label={label} checked={value} onChange={onChange} /></div></EditorGroup>; }
function Alignment({ value, onChange, label }: { value: string; onChange: (value: string) => void; label?: string }) { const { t } = useApp(); return <EditorGroup title={label || t("kiosk.alignment")}><div className="desktop-kiosk-builder-chips">{["left", "center", "right"].map((item) => <button type="button" className={value === item ? "is-active" : ""} key={item} onClick={() => onChange(item)}>{t(`kiosk.${item}`)}</button>)}</div></EditorGroup>; }
function BackgroundEditor({ value, modes, onChange }: { value: Background; modes: Array<"solid" | "gradient" | "image">; onChange: (value: Background) => void }) { const { t } = useApp(); return <EditorGroup title={t("kiosk.background")}><div className="desktop-kiosk-builder-chips">{modes.map((mode) => <button type="button" className={value.mode === mode ? "is-active" : ""} key={mode} onClick={() => onChange({ ...value, mode, color2: mode === "gradient" ? value.color2 || "#0F172A" : value.color2 })}>{t(`kiosk.background.${mode}`)}</button>)}</div>{value.mode !== "image" ? <><Color label={value.mode === "gradient" ? t("kiosk.primaryColor") : t("kiosk.backgroundColor")} value={value.color} onChange={(color) => onChange({ ...value, color })} />{value.mode === "gradient" ? <><Color label={t("kiosk.secondaryColor")} value={value.color2 || "#0F172A"} onChange={(color2) => onChange({ ...value, color2 })} /><label className="desktop-kiosk-builder-label"><span>{t("kiosk.gradientAngle")}</span><select value={value.gradient_angle} onChange={(event) => onChange({ ...value, gradient_angle: Number(event.target.value) })}>{[0, 45, 90, 135, 180].map((angle) => <option key={angle} value={angle}>{angle}°</option>)}</select></label></> : null}</> : null}</EditorGroup>; }
function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { const [draft, setDraft] = useState(value); useEffect(() => setDraft(value), [value]); function commitDraft() { const next = normalizeHex(draft); if (next) onChange(next); else setDraft(value); } return <div className="desktop-kiosk-builder-color"><span>{label}</span><div className="desktop-kiosk-builder-swatches">{SWATCHES.map((color) => <button aria-label={color} type="button" className={color.toUpperCase() === value.toUpperCase() ? "is-active" : ""} style={{ background: color }} key={color} onClick={() => onChange(color)} />)}</div><label><input type="color" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} /><input value={draft} maxLength={7} onChange={(event) => setDraft(event.target.value)} onBlur={commitDraft} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitDraft(); } }} /></label></div>; }
function TextEditor({ value, catalog, onChange }: { value: TextStyle; catalog: Catalog | null; onChange: (value: Partial<TextStyle>) => void }) { const { t } = useApp(); return <EditorGroup title={t("kiosk.textStyle")}><Color label={t("kiosk.textColor")} value={value.color} onChange={(color) => onChange({ color })} /><div className="desktop-kiosk-builder-two"><label className="desktop-kiosk-builder-label"><span>{t("kiosk.font")}</span><select value={value.font} onChange={(event) => onChange({ font: event.target.value })}>{Object.entries(catalog?.fonts || { [value.font]: { label: humanize(value.font) } }).map(([itemId, meta]) => <option key={itemId} value={itemId}>{meta.label || humanize(itemId)}</option>)}</select></label><label className="desktop-kiosk-builder-label"><span>{t("kiosk.textSize")}</span><output>{Number(value.size_rem).toFixed(2)} rem</output><input type="range" min={.75} max={3.5} step={.05} value={value.size_rem} onChange={(event) => onChange({ size_rem: Number(event.target.value) })} /></label></div><div className="desktop-kiosk-builder-effects"><Toggle label={t("kiosk.textShadow")} value={Boolean(value.effects.shadow)} onChange={(shadow) => onChange({ effects: { ...value.effects, shadow } })} /><Toggle label={t("kiosk.textOutline")} value={Boolean(value.effects.outline)} onChange={(outline) => onChange({ effects: { ...value.effects, outline } })} /></div></EditorGroup>; }
function Range({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (value: number) => string; onChange: (value: number) => void }) { return <EditorGroup title={label}><label className="desktop-kiosk-builder-range"><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><span>{format(value)}</span></label></EditorGroup>; }
function MediaEditor({ kind, current, file, onPick, onRemove }: { kind: "header" | "footer" | "background"; current: boolean; file: File | null; onPick: (file: File) => void; onRemove: () => void }) { const { t } = useApp(); const inputRef = useRef<HTMLInputElement | null>(null); return <EditorGroup title={t(kind === "header" ? "kiosk.logo" : kind === "footer" ? "kiosk.footerImage" : "kiosk.backgroundImage")}><div className="desktop-kiosk-builder-media"><div className="desktop-kiosk-builder-media-state"><span>{current ? "✓" : "◇"}</span><div><strong>{file?.name || (current ? t("kiosk.imageConfigured") : t("kiosk.noImage"))}</strong><small>{t("kiosk.imageProcessingHint")}</small></div></div><div className="desktop-kiosk-builder-chips"><button type="button" onClick={() => inputRef.current?.click()}>{current ? t("kiosk.replaceImage") : t("kiosk.uploadImage")}</button>{current ? <button className="is-danger" type="button" onClick={onRemove}>{t("kiosk.removeImage")}</button> : null}</div><input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(event) => { const next = event.target.files?.[0]; event.target.value = ""; if (!next) return; const issue = imageIssue(next, t); if (issue) { alert(issue); return; } onPick(next); }} /></div></EditorGroup>; }

function useObjectUrl(file: File | null) { const [url, setUrl] = useState(""); useEffect(() => { if (!file) { setUrl(""); return; } const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]); return url; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function cloneSnapshot(value: Snapshot): Snapshot { return { config: clone(value.config), media: { ...value.media } }; }
function signature(value: Snapshot) { return JSON.stringify({ config: value.config, media: { headerLogo: fileKey(value.media.headerLogo), footerLogo: fileKey(value.media.footerLogo), background: fileKey(value.media.background), removeHeaderLogo: value.media.removeHeaderLogo, removeFooterLogo: value.media.removeFooterLogo, removeBackground: value.media.removeBackground } }); }
function fileKey(file: File | null) { return file ? `${file.name}:${file.size}:${file.lastModified}` : ""; }
function normalizeHex(value: string) { const raw = value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase(); if (/^#?[0-9a-fA-F]{3}$/.test(raw)) { const hex = raw.replace("#", ""); return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toUpperCase(); } return null; }
function imageIssue(file: File, t: (key: string) => string) { if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) return t("kiosk.imageTypeError"); if (file.size > MAX_IMAGE_BYTES) return t("kiosk.imageSizeError"); return ""; }
function validate(config: KioskDesignConfig, t: (key: string) => string) { if ((config.header.title.text || "").length > 150 || (config.main.title.text || "").length > 150) return t("kiosk.titleTooLong"); const line = config.footer.text.lines[0] || ""; if (config.footer.text.lines.length > 1 || /[\r\n]/.test(line) || line.length > 200) return t("kiosk.footerTextInvalid"); return ""; }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function initials(name: string) { const parts = name.trim().split(/\s+/); return `${parts[0]?.[0] || "?"}${parts.length > 1 ? parts.at(-1)?.[0] || "" : ""}`.toUpperCase(); }
