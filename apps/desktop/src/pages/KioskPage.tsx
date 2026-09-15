import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { endpoints } from "@checkstation/api";
import { normalizeKioskDesignDocument, type ActionType, type KioskDesignDocument } from "@checkstation/domain";
// @ts-expect-error The Workspace runtime helper is authored in JavaScript and is shared unchanged here.
import { playConfirmationTone, primeConfirmationAudio, shouldRunConfirmationEffects } from "../../../../frontend/src/kiosk/confirmationEffects.js";
import { AuthenticatedImage } from "../components/AuthenticatedImage";
import { DesktopKioskConfirmation, DesktopKioskExitDialog, DesktopKioskPinDialog, DesktopKioskProcessing } from "../components/DesktopKioskFlow";
import { DesktopKioskRenderer, desktopKioskFlowTemplate, desktopKioskTemplateAccent } from "../components/DesktopKioskRenderer";
import { Loading, formatError } from "../components/ui";
import { useApp } from "../lib/AppProvider";
import { beginDesktopKioskExitGuard, isDesktopKioskExitGuardActive } from "../lib/kioskExitGuard";
import { useForegroundRefresh } from "../lib/useForegroundRefresh";
import { kioskCardHelperKey, type KioskHelperStep } from "../lib/kioskCardHelper";
import { initials, kioskParticipantDisplayName } from "../lib/kioskInitials";

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
  confirmation: { sound_enabled?: boolean };
};
type ConfirmationEffect = { presentation_id: number; sound_enabled: boolean };
type Identified = Person & { id?: number };
type KioskClass = { id: number; name: string; participant_count: number };

export function KioskPage() {
  const { groupId = "" } = useParams();
  const { api, auth, locale, t } = useApp();
  const navigate = useNavigate();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmationSequence = useRef(0);
  const lastSoundPresentation = useRef<number | null>(null);
  const entered = useRef(false);
  const exiting = useRef(false);
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
  const [confirmationEffect, setConfirmationEffect] = useState<ConfirmationEffect | null>(null);

  const load = useCallback(async (showLoading = false) => {
    if (!groupId) return;
    // Exit in progress: never POST enter (would re-lock the server session).
    if (exiting.current || isDesktopKioskExitGuardActive()) {
      if (showLoading) setLoading(false);
      return;
    }
    const sequence = ++requestSequence.current;
    if (showLoading) setLoading(true);
    try {
      // Browser parity: only enter when this session is not already kiosk-locked.
      // After unlock, kiosk_locked is false — the exit guard / exiting ref block re-enter.
      const alreadyLocked = Boolean(auth.getState().session?.kiosk_locked);
      if (!entered.current && !alreadyLocked) {
        await api.post(endpoints.kiosk(groupId), {});
        entered.current = true;
      } else if (!entered.current && alreadyLocked) {
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
  }, [api, auth, groupId, t]);

  useEffect(() => {
    void load(true);
    return () => {
      requestSequence.current += 1;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);
  useForegroundRefresh(() => load());

  useEffect(() => {
    if (!shouldRunConfirmationEffects({
      step: success ? "success" : "start",
      confirmation: confirmationEffect,
      lastPresentationId: lastSoundPresentation.current,
    })) return;
    lastSoundPresentation.current = confirmationEffect!.presentation_id;
    void playConfirmationTone({ enabled: confirmationEffect!.sound_enabled });
  }, [confirmationEffect, success]);

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
    confirmation: saved.confirmation || {},
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
    primeConfirmationAudio({ enabled: config.confirmation.sound_enabled !== false });
    setBusy(true);
    setPendingAction(action);
    setMessage("");
    try {
      const response = await api.post<{ confirmation?: { message?: string; return_delay_seconds?: number; sound_enabled?: boolean }; success_message?: string; allowed_actions?: ActionType[] }>(endpoints.kioskPerform(groupId), {
        ...identity(participant),
        action,
        ...(pin ? { pin } : {}),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setActions(response.allowed_actions || []);
      setSuccess(response.confirmation?.message || response.success_message || t("kiosk.recorded"));
      confirmationSequence.current += 1;
      setConfirmationEffect({
        presentation_id: confirmationSequence.current,
        sound_enabled: response.confirmation?.sound_enabled ?? config.confirmation.sound_enabled !== false,
      });
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
      const response = await api.post<{
        kiosk_locked?: boolean;
        kiosk_group_id?: number | null;
        kiosk_available?: boolean;
      }>(endpoints.kioskExit(), { exit_code: exitCode });
      // Stop any in-flight / future load() from POSTing enter again.
      exiting.current = true;
      requestSequence.current += 1;
      beginDesktopKioskExitGuard();
      flushSync(() => {
        auth.applyKioskUnlock(response);
      });
      navigate("/", { replace: true });
      // Refresh after leaving /kiosk so a stale locked snapshot cannot bounce us back.
      void auth.refreshWorkspace().catch(() => {});
    } catch (caught) {
      exiting.current = false;
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
    setConfirmationEffect(null);
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
        <DesktopKioskProcessing family={flowFamily} name={kioskParticipantDisplayName(participant.name, t("kiosk.participantFallback"))} accent={flowAccent} />
      ) : participant ? (
        <div className="kiosk-flow kiosk-flow--action">
          <div className="kiosk-participant-summary">
            <ParticipantAvatar person={participant} compact />
            <div className="kiosk-participant-summary-text"><strong className="kiosk-participant-summary-name">{kioskParticipantDisplayName(participant.name, t("kiosk.participantFallback"))}</strong></div>
          </div>
          <div className="kiosk-actions">
            {actions.map((action) => <button disabled={busy} type="button" className="kiosk-action-choice" key={action} onClick={() => void perform(action)}>{actionLabel(action, t)}</button>)}
          </div>
          <button type="button" className="btn-secondary kiosk-submit" onClick={reset}>{t("common.back")}</button>
        </div>
      ) : config.structured && !selectedClass ? (
        classes.length ? <div className="kiosk-people-grid">{classes.map((section) => {
          // Browser passes section.name through; empty name omits the title (not participantFallback).
          const className = section.name == null || section.name === "" ? "" : String(section.name);
          return (
          <button type="button" className="kiosk-person-card" key={section.id} onClick={() => void openClass(section)}>
            <ClassAvatar name={section.name} />
            <span className="kiosk-person-content">
              {className ? <strong className="kiosk-person-name">{className}</strong> : null}
              <span className="kiosk-person-sub kiosk-person-meta">{section.participant_count} {t("groups.participantLabel")}</span>
            </span>
          </button>
          );
        })}</div> : <div className="empty-state"><p>{t("groups.noParticipants")}</p></div>
      ) : selectedClass && config.require_class_pin && !people.length ? (
        <form className="kiosk-flow kiosk-flow--pin" onSubmit={(event) => { event.preventDefault(); void verifyClass(); }}>
          <h2>{selectedClass.name == null || selectedClass.name === "" ? "" : String(selectedClass.name)}</h2>
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
                {config.card_display.show_name ? <strong className="kiosk-person-name">{kioskParticipantDisplayName(person.name, t("kiosk.participantFallback"))}</strong> : null}
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

  const helperStep: KioskHelperStep = success
    ? "success"
    : pendingAction
      ? "processing"
      : pending
        ? "pin"
        : participant
          ? "confirm"
          : config.structured && !selectedClass
            ? "classes"
            : config.structured && config.require_class_pin && !people.length
              ? "class_pin"
              : "start";
  const helperKey = kioskCardHelperKey({ mode: config.kiosk_mode, structured: config.structured, step: helperStep, participantCount: people.length });
  const helperText = helperKey ? t(helperKey) : "";

  return <>
    <DesktopKioskRenderer design={design} kioskMode={config.kiosk_mode} helperText={helperText} exitLabel={t("kiosk.exit")} onExit={() => setExitOpen(true)}>
      {operationalBody}
    </DesktopKioskRenderer>
    {pending ? <DesktopKioskPinDialog title={kioskParticipantDisplayName(pending.name, t("kiosk.participantFallback"))} label={t("kiosk.pin")} code={pin} error={message} busy={busy} cancelLabel={t("common.cancel")} confirmLabel={t("kiosk.verify")} onCodeChange={setPin} onCancel={() => { setPending(null); setPin(""); setMessage(""); }} onConfirm={() => void selectPerson(pending, pin)} /> : null}
    {exitOpen ? <DesktopKioskExitDialog code={exitCode} error={exitError} busy={busy} onCodeChange={setExitCode} onCancel={() => { setExitOpen(false); setExitCode(""); setExitError(""); }} onConfirm={() => void exit()} labels={{ title: t("kiosk.exit"), hint: locale === "ja" ? "このグループのキオスク終了コードを入力して、このアプリのロックを解除してください。" : "Enter this Group's kiosk exit code to unlock this app.", code: t("kiosk.exitCode"), show: t("auth.showPassword"), hide: t("auth.hidePassword"), cancel: t("common.cancel"), exit: t("kiosk.exit"), verifying: t("common.loading") }} /> : null}
  </>;
}

function ParticipantAvatar({ person, compact = false }: { person: Person; compact?: boolean }) {
  return <span className={`kiosk-person-avatar${compact ? " kiosk-person-avatar--compact" : ""}${person.photo_url ? " kiosk-person-avatar--photo" : " kiosk-person-avatar--fallback"}`} aria-hidden="true">
    <span className="kiosk-person-initials">{initials(person.name)}</span>
    {person.photo_url ? <AuthenticatedImage alt="" src={person.photo_url} /> : null}
  </span>;
}

function ClassAvatar({ name }: { name?: string | null }) {
  return <span className="kiosk-person-avatar kiosk-class-avatar kiosk-person-avatar--fallback" aria-hidden="true"><span className="kiosk-class-avatar-inner"><span className="kiosk-person-initials">{initials(name)}</span></span></span>;
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
