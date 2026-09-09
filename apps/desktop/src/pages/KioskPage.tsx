import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { endpoints } from "@checkstation/api";
import { normalizeKioskDesignDocument, type ActionType, type KioskDesignDocument } from "@checkstation/domain";
import { AuthenticatedImage } from "../components/AuthenticatedImage";
import { DesktopKioskConfirmation, DesktopKioskExitDialog, DesktopKioskPinDialog, DesktopKioskProcessing } from "../components/DesktopKioskFlow";
import { DesktopKioskRenderer, desktopKioskFlowTemplate, desktopKioskTemplateAccent } from "../components/DesktopKioskRenderer";
import { Loading, formatError } from "../components/ui";
import { useApp } from "../lib/AppProvider";

type Person = {
  membership_id?: number;
  group_only_participant_id?: number;
  participant_kind: "member" | "group_only_participant";
  name: string;
  email?: string;
  participant_code?: string;
  photo_url?: string | null;
  requires_pin?: boolean;
};
type KioskConfig = {
  kiosk_mode: "card" | "input";
  use_pin: boolean;
  title: string;
  welcome_text: string;
  input_fields: string[];
  card_display: { show_name: boolean; show_participant_code: boolean; show_email: boolean };
  structured: boolean;
  require_class_pin: boolean;
};
type Identified = Person & { id?: number };
type KioskClass = { id: number; name: string; participant_count: number };

export function KioskPage() {
  const { groupId = "" } = useParams();
  const { api, auth, t } = useApp();
  const navigate = useNavigate();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entered = useRef(false);
  const requestSequence = useRef(0);
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
  const [pendingAction, setPendingAction] = useState<ActionType | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitCode, setExitCode] = useState("");
  const [exitError, setExitError] = useState("");
  const [pending, setPending] = useState<Person | null>(null);
  const [classes, setClasses] = useState<KioskClass[]>([]);
  const [selectedClass, setSelectedClass] = useState<KioskClass | null>(null);
  const [classPin, setClassPin] = useState("");

  const load = useCallback(async (showLoading = false) => {
    if (!groupId) return;
    const sequence = ++requestSequence.current;
    if (showLoading) setLoading(true);
    try {
      if (!entered.current) {
        await api.post(endpoints.kiosk(groupId), {});
        entered.current = true;
      }
      const response = await api.get<Record<string, any>>(endpoints.kiosk(groupId));
      if (sequence !== requestSequence.current) return;
      setData(response);
      setClasses(response.classes || []);
      setMessage("");
    } catch (caught) {
      if (sequence === requestSequence.current) setMessage(formatError(caught, t("common.error")));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [api, groupId, t]);

  useEffect(() => {
    void load(true);
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      requestSequence.current += 1;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const design = useMemo<KioskDesignDocument>(() => normalizeKioskDesignDocument(data.visual_design), [data.visual_design]);
  const saved = (data.kiosk_settings || data.kiosk || {}) as Partial<KioskConfig>;
  const config: KioskConfig = {
    kiosk_mode: saved.kiosk_mode || "card",
    use_pin: saved.use_pin || false,
    title: saved.title || "",
    welcome_text: saved.welcome_text || "",
    input_fields: saved.input_fields || ["participant_code"],
    card_display: { show_name: true, show_participant_code: true, show_email: false, ...saved.card_display },
    structured: Boolean(saved.structured),
    require_class_pin: Boolean(saved.require_class_pin),
  };
  const people = (data.people || []) as Person[];
  const flowFamily = desktopKioskFlowTemplate(design, config.kiosk_mode);
  const flowAccent = desktopKioskTemplateAccent(flowFamily);

  function identity(person: Person) {
    return person.participant_kind === "member"
      ? { participant_kind: person.participant_kind, membership_id: person.membership_id }
      : { participant_kind: person.participant_kind, group_only_participant_id: person.group_only_participant_id };
  }

  async function selectPerson(person: Person, suppliedPin?: string) {
    if ((person.requires_pin || config.use_pin) && suppliedPin === undefined) {
      setPending(person);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await api.post<{ participant: Identified; allowed_actions: ActionType[] }>(endpoints.kioskIdentify(groupId), {
        ...identity(person),
        ...(suppliedPin ? { pin: suppliedPin } : {}),
      });
      setParticipant(response.participant);
      setActions(response.allowed_actions || []);
      setPending(null);
    } catch (caught) {
      setMessage(formatError(caught, t("common.error")));
    } finally {
      setBusy(false);
    }
  }

  async function identify() {
    setBusy(true);
    setMessage("");
    try {
      const response = await api.post<{ participant: Identified; allowed_actions: ActionType[] }>(endpoints.kioskIdentify(groupId), {
        participant_code: identifier.trim().toUpperCase(),
        pin: pin || undefined,
        ...(config.input_fields.includes("email") ? { email: second.trim() } : {}),
        ...(config.input_fields.includes("name") ? { name: second.trim() } : {}),
      });
      setParticipant(response.participant);
      setActions(response.allowed_actions || []);
    } catch (caught) {
      setMessage(formatError(caught, t("common.error")));
    } finally {
      setBusy(false);
    }
  }

  async function perform(action: ActionType) {
    if (!participant) return;
    setBusy(true);
    setPendingAction(action);
    setMessage("");
    try {
      const response = await api.post<{ confirmation?: { message?: string; return_delay_seconds?: number }; success_message?: string; allowed_actions?: ActionType[] }>(endpoints.kioskPerform(groupId), {
        ...identity(participant),
        action,
        ...(pin ? { pin } : {}),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setActions(response.allowed_actions || []);
      setSuccess(response.confirmation?.message || response.success_message || t("kiosk.recorded"));
      const delay = response.confirmation?.return_delay_seconds;
      if (typeof delay === "number") timer.current = setTimeout(reset, Math.max(0, delay) * 1000);
    } catch (caught) {
      setMessage(formatError(caught, t("common.error")));
    } finally {
      setPendingAction(null);
      setBusy(false);
    }
  }

  async function openClass(section: KioskClass) {
    setSelectedClass(section);
    setMessage("");
    if (!config.require_class_pin) await loadClass(section);
  }

  async function loadClass(section: KioskClass) {
    try {
      const result = await api.get<{ people: Person[] }>(`${endpoints.kiosk(groupId)}classes/${section.id}/people/`);
      setData((old) => ({ ...old, people: result.people || [] }));
    } catch (caught) {
      setMessage(formatError(caught, t("common.error")));
    }
  }

  async function verifyClass() {
    if (!selectedClass) return;
    setBusy(true);
    setMessage("");
    try {
      await api.post(`${endpoints.kiosk(groupId)}classes/${selectedClass.id}/verify-pin/`, { pin: classPin });
      await loadClass(selectedClass);
      setClassPin("");
    } catch (caught) {
      setMessage(formatError(caught, t("common.error")));
    } finally {
      setBusy(false);
    }
  }

  async function exit() {
    setBusy(true);
    setExitError("");
    try {
      await api.post(endpoints.kioskExit(), { group_id: Number(groupId), exit_code: exitCode });
      await auth.bootstrap();
      navigate("/");
    } catch (caught) {
      setExitError(formatError(caught, t("common.error")));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setParticipant(null);
    setActions([]);
    setIdentifier("");
    setSecond("");
    setPin("");
    setSuccess("");
    setMessage("");
    setPending(null);
  }

  if (loading) return <div className="kiosk-loading"><Loading label={t("common.loading")} /></div>;

  const operationalBody = (
    <div className={`kiosk-body${config.kiosk_mode === "input" && !config.structured ? " kiosk-body-input" : ""}`}>
      {config.welcome_text && !participant && !success ? <p className="kiosk-welcome">{config.welcome_text}</p> : null}
      {message ? <div className="kiosk-inline-error" role="alert"><strong>{message}</strong></div> : null}
      {success ? (
        <DesktopKioskConfirmation family={flowFamily} message={success} accent={flowAccent} />
      ) : participant && pendingAction ? (
        <DesktopKioskProcessing family={flowFamily} name={participant.name} accent={flowAccent} />
      ) : participant ? (
        <div className="kiosk-flow kiosk-flow--action">
          <div className="kiosk-participant-summary">
            <ParticipantAvatar person={participant} compact />
            <div className="kiosk-participant-summary-text"><strong className="kiosk-participant-summary-name">{participant.name}</strong></div>
          </div>
          <div className="kiosk-actions">
            {actions.map((action) => <button disabled={busy} type="button" className="kiosk-action-choice" key={action} onClick={() => void perform(action)}>{actionLabel(action, t)}</button>)}
          </div>
          <button type="button" className="btn-secondary kiosk-submit" onClick={reset}>{t("common.back")}</button>
        </div>
      ) : config.structured && !selectedClass ? (
        classes.length ? <div className="kiosk-people-grid">{classes.map((section) => (
          <button type="button" className="kiosk-person-card" key={section.id} onClick={() => void openClass(section)}>
            <ClassAvatar name={section.name} />
            <span className="kiosk-person-content">
              <strong className="kiosk-person-name">{section.name}</strong>
              <span className="kiosk-person-sub kiosk-person-meta">{section.participant_count} {t("groups.participantLabel")}</span>
            </span>
          </button>
        ))}</div> : <div className="empty-state"><p>{t("groups.noParticipants")}</p></div>
      ) : selectedClass && config.require_class_pin && !people.length ? (
        <form className="kiosk-flow kiosk-flow--pin" onSubmit={(event) => { event.preventDefault(); void verifyClass(); }}>
          <h2>{selectedClass.name}</h2>
          <label className="field"><span className="field-label">{t("kiosk.enterClassPin")}</span><input className="kiosk-pin-input" type="password" autoFocus value={classPin} onChange={(event) => setClassPin(event.target.value)} /></label>
          <button disabled={busy} type="submit" className="btn-primary kiosk-submit">{t("kiosk.verify")}</button>
          <button type="button" className="btn-secondary kiosk-submit" onClick={() => setSelectedClass(null)}>{t("classes.back")}</button>
        </form>
      ) : config.kiosk_mode === "card" ? (
        <>
          <div className="kiosk-people-grid">{people.map((person) => (
            <button type="button" className="kiosk-person-card" key={`${person.participant_kind}-${person.membership_id || person.group_only_participant_id}`} onClick={() => void selectPerson(person)}>
              <ParticipantAvatar person={person} />
              <span className="kiosk-person-content">
                {config.card_display.show_name ? <strong className="kiosk-person-name">{person.name}</strong> : null}
                {config.card_display.show_participant_code && person.participant_code ? <span className="kiosk-person-code kiosk-person-sub">{person.participant_code}</span> : null}
                {config.card_display.show_email && person.email ? <span className="kiosk-person-email kiosk-person-sub">{person.email}</span> : null}
              </span>
            </button>
          ))}</div>
          {selectedClass ? <button type="button" className="btn-secondary kiosk-submit kiosk-back-to-classes" onClick={() => { setSelectedClass(null); setData((old) => ({ ...old, people: [] })); }}>{t("classes.back")}</button> : null}
        </>
      ) : (
        <form className="kiosk-flow kiosk-flow--identify kiosk-identify-form" onSubmit={(event) => { event.preventDefault(); void identify(); }} autoComplete="off">
          <h2>{config.title || t("kiosk.identify")}</h2>
          <label className="field"><span className="field-label">{inputLabel(config.input_fields[0], t)}</span><input autoFocus value={identifier} onChange={(event) => setIdentifier(event.target.value)} /></label>
          {config.input_fields.length > 1 ? <label className="field"><span className="field-label">{inputLabel(config.input_fields[1], t)}</span><input value={second} onChange={(event) => setSecond(event.target.value)} /></label> : null}
          {config.use_pin ? <label className="field"><span className="field-label">{t("kiosk.pin")}</span><input className="kiosk-pin-input" type="password" value={pin} onChange={(event) => setPin(event.target.value)} /></label> : null}
          <button disabled={busy} type="submit" className="btn-primary kiosk-submit">{t("kiosk.identify")}</button>
        </form>
      )}
    </div>
  );

  return <>
    <DesktopKioskRenderer design={design} kioskMode={config.kiosk_mode} exitLabel={t("kiosk.exit")} onExit={() => setExitOpen(true)}>
      {operationalBody}
    </DesktopKioskRenderer>
    {pending ? <DesktopKioskPinDialog title={pending.name} label={t("kiosk.pin")} code={pin} error={message} busy={busy} cancelLabel={t("common.cancel")} confirmLabel={t("kiosk.verify")} onCodeChange={setPin} onCancel={() => { setPending(null); setPin(""); setMessage(""); }} onConfirm={() => void selectPerson(pending, pin)} /> : null}
    {exitOpen ? <DesktopKioskExitDialog code={exitCode} error={exitError} busy={busy} onCodeChange={setExitCode} onCancel={() => { setExitOpen(false); setExitCode(""); setExitError(""); }} onConfirm={() => void exit()} labels={{ title: t("kiosk.exit"), hint: t("kiosk.exitCodeHint"), code: t("kiosk.exitCode"), show: t("auth.showPassword"), hide: t("auth.hidePassword"), cancel: t("common.cancel"), exit: t("kiosk.exit"), verifying: t("common.loading") }} /> : null}
  </>;
}

function ParticipantAvatar({ person, compact = false }: { person: Person; compact?: boolean }) {
  return <span className={`kiosk-person-avatar${compact ? " kiosk-person-avatar--compact" : ""}${person.photo_url ? " kiosk-person-avatar--photo" : " kiosk-person-avatar--fallback"}`} aria-hidden="true">
    <span className="kiosk-person-initials">{initials(person.name)}</span>
    {person.photo_url ? <AuthenticatedImage alt="" src={person.photo_url} /> : null}
  </span>;
}

function ClassAvatar({ name }: { name: string }) {
  return <span className="kiosk-person-avatar kiosk-class-avatar kiosk-person-avatar--fallback" aria-hidden="true"><span className="kiosk-class-avatar-inner"><span className="kiosk-person-initials">{initials(name)}</span></span></span>;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0][0]}${parts.at(-1)![0]}`.toUpperCase() : (parts[0]?.[0] || "?").toUpperCase();
}

function actionLabel(action: ActionType, t: (key: string) => string) {
  if (action === "check_in") return t("kiosk.checkIn");
  if (action === "check_out") return t("kiosk.checkOut");
  if (action === "break_start") return t("kiosk.breakStart");
  return t("kiosk.breakEnd");
}

function inputLabel(field: string, t: (key: string) => string) {
  if (field === "participant_code") return t("kiosk.code");
  if (field === "email") return t("auth.email");
  if (field === "name") return t("members.name");
  return field;
}
