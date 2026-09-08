import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { endpoints } from "@checkstation/api";
import { kioskOverlayColor, normalizeKioskDesignDocument, resolveKioskCardTemplate, type ActionType, type KioskDesignDocument } from "@checkstation/domain";
import { AuthenticatedImage, useAuthenticatedAsset } from "../components/AuthenticatedImage";
import { Alert, Button, Card, Field, Input, Loading, Modal, formatError } from "../components/ui";
import { cssBackground, kioskCssFontFamily } from "../lib/kioskDesign";
import { useApp } from "../lib/AppProvider";

type Person = { membership_id?: number; group_only_participant_id?: number; participant_kind: "member" | "group_only_participant"; name: string; email?: string; participant_code?: string; photo_url?: string | null; requires_pin?: boolean };
type KioskConfig = { kiosk_mode: "card" | "input"; use_pin: boolean; title: string; welcome_text: string; input_fields: string[]; card_display: { show_name: boolean; show_participant_code: boolean; show_email: boolean }; structured: boolean; require_class_pin: boolean };
type Identified = Person & { id?: number };
type KioskClass = { id: number; name: string; participant_count: number };

export function KioskPage() {
  const { groupId = "" } = useParams();
  const { api, auth, t } = useApp();
  const navigate = useNavigate();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Record<string, any>>({});
  const [identifier, setIdentifier] = useState("");
  const [second, setSecond] = useState("");
  const [pin, setPin] = useState("");
  const [participant, setParticipant] = useState<Identified | null>(null);
  const [actions, setActions] = useState<ActionType[]>([]);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitCode, setExitCode] = useState("");
  const [pending, setPending] = useState<Person | null>(null);
  const [classes, setClasses] = useState<KioskClass[]>([]);
  const [selectedClass, setSelectedClass] = useState<KioskClass | null>(null);
  const [classPin, setClassPin] = useState("");

  const load = useCallback(async (showLoading = false) => {
    if (!groupId) return;
    if (showLoading) setLoading(true);
    try {
      await api.post(endpoints.kiosk(groupId), {});
      const response = await api.get<Record<string, any>>(endpoints.kiosk(groupId));
      setData(response);
      setClasses(response.classes || []);
    } catch (caught) {
      setMessage(formatError(caught, t("common.error")));
    } finally {
      setLoading(false);
    }
  }, [api, groupId, t]);

  useEffect(() => {
    void load(true);
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const design = useMemo<KioskDesignDocument>(() => normalizeKioskDesignDocument(data.visual_design), [data.visual_design]);
  const cardTemplate = resolveKioskCardTemplate(design.config.main);
  const saved = (data.kiosk_settings || data.kiosk || {}) as Partial<KioskConfig>;
  const config: KioskConfig = {
    kiosk_mode: saved.kiosk_mode || "card", use_pin: saved.use_pin || false,
    title: saved.title || "", welcome_text: saved.welcome_text || "",
    input_fields: saved.input_fields || ["participant_code"],
    card_display: { show_name: true, show_participant_code: true, show_email: false, ...saved.card_display },
    structured: Boolean(saved.structured), require_class_pin: Boolean(saved.require_class_pin),
  };
  const people = (data.people || []) as Person[];
  const backgroundAsset = useAuthenticatedAsset(design.main_background_image_url);
  const mainBackground = design.config.main.background;
  const transform = design.config.main.image_transform;
  const overlay = kioskOverlayColor(design.config.main.overlay);
  const backgroundStyle = backgroundAsset && mainBackground.mode === "image" ? {
    backgroundColor: mainBackground.color,
    backgroundImage: `url("${backgroundAsset}")`,
    backgroundSize: `${Math.max(1, transform.zoom) * 100}%`,
    backgroundPosition: `${transform.focal_x * 100}% ${transform.focal_y * 100}%`,
    backgroundRepeat: "no-repeat",
  } : { background: cssBackground(mainBackground) };

  function identity(person: Person) { return person.participant_kind === "member" ? { participant_kind: person.participant_kind, membership_id: person.membership_id } : { participant_kind: person.participant_kind, group_only_participant_id: person.group_only_participant_id }; }
  async function selectPerson(person: Person, suppliedPin?: string) { if ((person.requires_pin || config.use_pin) && suppliedPin === undefined) { setPending(person); return; } setBusy(true); setMessage(""); try { const response = await api.post<{ participant: Identified; allowed_actions: ActionType[] }>(endpoints.kioskIdentify(groupId), { ...identity(person), ...(suppliedPin ? { pin: suppliedPin } : {}) }); setParticipant(response.participant); setActions(response.allowed_actions || []); setPending(null); } catch (caught) { setMessage(formatError(caught, t("common.error"))); } finally { setBusy(false); } }
  async function identify() { setBusy(true); setMessage(""); try { const response = await api.post<{ participant: Identified; allowed_actions: ActionType[] }>(endpoints.kioskIdentify(groupId), { participant_code: identifier.trim().toUpperCase(), pin: pin || undefined, ...(config.input_fields.includes("email") ? { email: second.trim() } : {}), ...(config.input_fields.includes("name") ? { name: second.trim() } : {}) }); setParticipant(response.participant); setActions(response.allowed_actions || []); } catch (caught) { setMessage(formatError(caught, t("common.error"))); } finally { setBusy(false); } }
  async function perform(action: ActionType) { if (!participant) return; setBusy(true); setMessage(""); try { const response = await api.post<{ confirmation?: { message?: string; return_delay_seconds?: number }; success_message?: string; allowed_actions?: ActionType[] }>(endpoints.kioskPerform(groupId), { ...identity(participant), action, ...(pin ? { pin } : {}), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }); setActions(response.allowed_actions || []); setSuccess(response.confirmation?.message || response.success_message || t("kiosk.recorded")); const delay = response.confirmation?.return_delay_seconds; if (typeof delay === "number") timer.current = setTimeout(reset, Math.max(0, delay) * 1000); } catch (caught) { setMessage(formatError(caught, t("common.error"))); } finally { setBusy(false); } }
  async function openClass(section: KioskClass) { setSelectedClass(section); setMessage(""); if (!config.require_class_pin) await loadClass(section); }
  async function loadClass(section: KioskClass) { try { const result = await api.get<{ people: Person[] }>(`${endpoints.kiosk(groupId)}classes/${section.id}/people/`); setData((old) => ({ ...old, people: result.people || [] })); } catch (caught) { setMessage(formatError(caught, t("common.error"))); } }
  async function verifyClass() { if (!selectedClass) return; setBusy(true); try { await api.post(`${endpoints.kiosk(groupId)}classes/${selectedClass.id}/verify-pin/`, { pin: classPin }); await loadClass(selectedClass); setClassPin(""); } catch (caught) { setMessage(formatError(caught, t("common.error"))); } finally { setBusy(false); } }
  async function exit() { setBusy(true); setMessage(""); try { await api.post(endpoints.kioskExit(), { group_id: Number(groupId), exit_code: exitCode }); await auth.bootstrap(); navigate("/"); } catch (caught) { setMessage(formatError(caught, t("common.error"))); } finally { setBusy(false); } }
  function reset() { setParticipant(null); setActions([]); setIdentifier(""); setSecond(""); setPin(""); setSuccess(""); setMessage(""); setPending(null); }

  if (loading) return <div className="kiosk-loading" style={backgroundStyle}><Loading label={t("common.loading")} /></div>;
  const title = design.config.main.title;
  return <div className="kiosk-runtime kr-shell" data-kiosk-behavior={config.kiosk_mode} data-layout={cardTemplate.layout} data-card-template={cardTemplate.id} data-input-template={design.config.main.input_template} data-flow-template={config.kiosk_mode === "card" ? cardTemplate.id : design.config.main.input_template} data-card={cardTemplate.card} data-button={design.config.main.button_preset} data-input={design.config.main.input_preset} style={{ ...backgroundStyle, color: title.color } as React.CSSProperties}>
    {overlay ? <div className="kiosk-background-overlay" style={{ background: overlay }} /> : null}
    <header className="kr-header" style={{ background: cssBackground(design.config.header.background), color: design.config.header.title.color, justifyContent: design.config.header.alignment === "center" ? "center" : design.config.header.alignment === "right" ? "flex-end" : "flex-start" }}>
      <div className="kiosk-header-identity"><AuthenticatedImage alt="" className="kiosk-header-logo" src={design.header_logo_url} /><strong className={textEffectClass(design.config.header.title.effects)} style={{ fontFamily: kioskCssFontFamily(design.config.header.title.font), fontSize: `${design.config.header.title.size_rem}rem` }}>{design.config.header.title.text || data.group?.name || config.title || t("kiosk.title")}</strong></div>
      <button type="button" onClick={() => setExitOpen(true)}>×</button>
    </header>
    <main className="kr-main"><h1 className={textEffectClass(title.effects)} style={{ fontFamily: kioskCssFontFamily(title.font), fontSize: `${title.size_rem}rem`, textAlign: title.alignment as "left" | "center" | "right" }}>{title.text || config.welcome_text || t("kiosk.previewWelcome")}</h1><Alert>{message}</Alert>
      {success ? <div className="kiosk-confirmation">{success}<Button onClick={reset}>{t("kiosk.back")}</Button></div> : participant ? <div className="kiosk-action-panel"><h2>{participant.name}</h2><div className="kiosk-actions">{actions.map((action) => <Button loading={busy} key={action} onClick={() => void perform(action)}>{actionLabel(action, t)}</Button>)}</div><Button variant="secondary" onClick={reset}>{t("common.back")}</Button></div> : config.structured && !selectedClass ? <div className="kiosk-people-grid">{classes.map((section) => <button type="button" className="kiosk-person-card" key={section.id} onClick={() => void openClass(section)}><span className="kiosk-person-content"><strong className="kiosk-person-name">{section.name}</strong><span className="kiosk-person-sub">{section.participant_count} {t("groups.participantLabel")}</span></span></button>)}</div> : selectedClass && config.require_class_pin && !people.length ? <Card title={selectedClass.name}><div className="form"><Field label={t("kiosk.enterClassPin")}><Input type="password" autoFocus value={classPin} onChange={(e) => setClassPin(e.target.value)} /></Field><Button loading={busy} onClick={() => void verifyClass()}>{t("kiosk.verify")}</Button><Button variant="secondary" onClick={() => setSelectedClass(null)}>{t("classes.back")}</Button></div></Card> : config.kiosk_mode === "card" ? <><div className="kiosk-people-grid">{people.map((person) => <button type="button" className="kiosk-person-card" key={`${person.participant_kind}-${person.membership_id || person.group_only_participant_id}`} onClick={() => void selectPerson(person)}><span className="kiosk-person-avatar">{person.photo_url ? <AuthenticatedImage alt="" src={person.photo_url} /> : initials(person.name)}</span><span className="kiosk-person-content">{config.card_display.show_name ? <strong className="kiosk-person-name">{person.name}</strong> : null}{config.card_display.show_participant_code ? <span className="kiosk-person-code kiosk-person-sub">{person.participant_code}</span> : null}{config.card_display.show_email ? <small className="kiosk-person-email kiosk-person-sub">{person.email}</small> : null}</span></button>)}</div>{selectedClass ? <Button variant="secondary" onClick={() => { setSelectedClass(null); setData((old) => ({ ...old, people: [] })); }}>{t("classes.back")}</Button> : null}</> : <Card className="kiosk-input-card"><div className="form"><Field label={config.input_fields[0] === "participant_code" ? t("kiosk.code") : config.input_fields[0]}><Input autoFocus value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></Field>{config.input_fields.length > 1 ? <Field label={config.input_fields[1]}><Input value={second} onChange={(e) => setSecond(e.target.value)} /></Field> : null}{config.use_pin ? <Field label={t("kiosk.pin")}><Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} /></Field> : null}<Button loading={busy} onClick={() => void identify()}>{t("kiosk.identify")}</Button></div></Card>}
    </main>
    <footer className="kr-footer" style={{ background: cssBackground(design.config.footer.background), color: design.config.footer.text.color, textAlign: design.config.footer.text.alignment as "left" | "center" | "right" }}><AuthenticatedImage alt="" className="kiosk-footer-logo" src={design.footer_logo_url} /><span className={textEffectClass(design.config.footer.text.effects)} style={{ fontFamily: kioskCssFontFamily(design.config.footer.text.font), fontSize: `${design.config.footer.text.size_rem}rem` }}>{design.config.footer.text.lines[0] || ""}</span></footer>
    {pending ? <Modal title={pending.name} onClose={() => setPending(null)} actions={<><Button variant="secondary" onClick={() => setPending(null)}>{t("common.cancel")}</Button><Button loading={busy} onClick={() => void selectPerson(pending, pin)}>{t("kiosk.verify")}</Button></>}><Field label={t("kiosk.pin")}><Input autoFocus type="password" value={pin} onChange={(e) => setPin(e.target.value)} /></Field></Modal> : null}
    {exitOpen ? <Modal title={t("kiosk.exit")} onClose={() => setExitOpen(false)} actions={<><Button variant="secondary" onClick={() => setExitOpen(false)}>{t("common.cancel")}</Button><Button loading={busy} onClick={() => void exit()}>{t("kiosk.exit")}</Button></>}><Field label={t("kiosk.exitCode")}><Input autoFocus type="password" value={exitCode} onChange={(e) => setExitCode(e.target.value)} /></Field></Modal> : null}
  </div>;
}

function initials(name: string) { const parts = name.trim().split(/\s+/).filter(Boolean); return parts.length > 1 ? `${parts[0][0]}${parts.at(-1)![0]}`.toUpperCase() : (parts[0]?.[0] || "?").toUpperCase(); }
function textEffectClass(effects: Record<string, unknown>) { return `kr-text${effects.shadow ? " kr-text-shadow" : ""}${effects.outline ? " kr-text-outline" : ""}`; }
function actionLabel(action: ActionType, t: (key: string) => string) { if (action === "check_in") return t("kiosk.checkIn"); if (action === "check_out") return t("kiosk.checkOut"); if (action === "break_start") return t("kiosk.breakStart"); return t("kiosk.breakEnd"); }
