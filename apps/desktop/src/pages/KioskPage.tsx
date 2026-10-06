import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { endpoints, isMissingCredentialsError } from "@checkstation/api";
import { normalizeKioskDesignDocument, type ActionType, type KioskDesignDocument } from "@checkstation/domain";
// @ts-expect-error The Workspace runtime helper is authored in JavaScript and is shared unchanged here.
import { playConfirmationTone, primeConfirmationAudio, shouldRunConfirmationEffects } from "../../../../frontend/src/kiosk/confirmationEffects.js";
import { AuthenticatedImage } from "../components/AuthenticatedImage";
import { DesktopKioskConfirmation, DesktopKioskExitDialog, DesktopKioskPinDialog, DesktopKioskProcessing } from "../components/DesktopKioskFlow";
import { DesktopKioskRenderer, desktopKioskFlowTemplate, desktopKioskTemplateAccent } from "../components/DesktopKioskRenderer";
import { Loading, formatError } from "../components/ui";
import { useApp } from "../lib/AppProvider";
import { beginDesktopKioskExitGuard, isDesktopKioskExitGuardActive } from "../lib/kioskExitGuard";
import {
  clearAllKioskExitTokens,
  clearKioskExitToken,
  loadKioskExitTokenPersistent,
  saveKioskExitToken,
} from "../lib/kioskExitCredential";
import {
  KIOSK_FOREGROUND_MIN_ELAPSED_MS,
  KIOSK_SOFT_REFRESH_MS,
  isKioskRefreshIdle,
  resolveStructuredClassAfterRefresh,
  shouldRefreshOnForeground,
  shouldRunPeriodicRefresh,
} from "../lib/kioskLiveRefresh";
import {
  createKioskInactivityTimer,
  hasNonEmptyKioskInput,
  shouldArmKioskInactivity,
} from "../lib/kioskInactivityTimeout";
import { clearDesktopKioskActive, setDesktopKioskActive, markDesktopKioskSessionExpired, clearDesktopKioskSessionExpired, isDesktopKioskSessionExpired } from "../lib/kioskSessionLock";
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
  const { api, auth, authState, locale, t } = useApp();
  const navigate = useNavigate();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmationSequence = useRef(0);
  const lastSoundPresentation = useRef<number | null>(null);
  const entered = useRef(false);
  const exiting = useRef(false);
  const requestSequence = useRef(0);
  const refreshInFlight = useRef(false);
  const pendingSoftRefresh = useRef(false);
  const lastRefreshAtRef = useRef<number | null>(null);
  const wasBackgroundedRef = useRef(false);
  const selectedClassRef = useRef<KioskClass | null>(null);
  const performLock = useRef(false);
  const idleSnapshotRef = useRef({
    busy: false,
    performLocked: false,
    hasParticipant: false,
    hasPendingPerson: false,
    hasSuccessMessage: false,
    showExit: false,
    classPinBusy: false,
    sessionExpired: false,
    refreshInFlight: false,
  });

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
  const [classPinBusy, setClassPinBusy] = useState(false);
  const [confirmationEffect, setConfirmationEffect] = useState<ConfirmationEffect | null>(null);
  const [sessionExpired, setSessionExpired] = useState(() => isDesktopKioskSessionExpired());
  const inactivityTimerRef = useRef<ReturnType<typeof createKioskInactivityTimer> | null>(null);
  const resetInactivityRef = useRef(() => {});
  const [inactivityRemaining, setInactivityRemaining] = useState<number | null>(null);

  selectedClassRef.current = selectedClass;
  idleSnapshotRef.current = {
    busy,
    performLocked: performLock.current,
    hasParticipant: Boolean(participant),
    hasPendingPerson: Boolean(pending),
    hasSuccessMessage: Boolean(success),
    showExit: exitOpen,
    classPinBusy,
    sessionExpired,
    refreshInFlight: refreshInFlight.current,
  };

  const inputProgress = hasNonEmptyKioskInput({ identifier, second, pin });
  const requireClassPinEarly = Boolean(
    ((data.kiosk_settings || data.kiosk || {}) as Partial<KioskConfig>).require_class_pin,
  );
  const peopleCountEarly = Array.isArray(data.people) ? data.people.length : 0;
  const onClassPinScreen = Boolean(
    selectedClass
    && requireClassPinEarly
    && peopleCountEarly === 0
    && !participant
    && !pending
    && !success,
  );
  const participantSensitive = Boolean(participant)
    || Boolean(pending)
    || onClassPinScreen
    || (inputProgress && !participant && !pending && !success);
  const interactionBusy = busy || Boolean(pendingAction) || performLock.current;
  const inactivityArmed = shouldArmKioskInactivity({
    participantSensitive,
    interactionBusy,
    successVisible: Boolean(success),
    exitOpen,
    sessionExpired,
    loading,
  });

  useEffect(() => {
    const timer = createKioskInactivityTimer({
      onTimeout: () => {
        resetInactivityRef.current();
      },
      onRemaining: setInactivityRemaining,
    });
    inactivityTimerRef.current = timer;
    return () => {
      timer.dispose();
      inactivityTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    inactivityTimerRef.current?.setArmed(inactivityArmed);
  }, [inactivityArmed]);

  useEffect(() => {
    if (!inactivityArmed) return undefined;
    const note = () => inactivityTimerRef.current?.noteActivity();
    window.addEventListener("pointerdown", note, true);
    window.addEventListener("keydown", note, true);
    return () => {
      window.removeEventListener("pointerdown", note, true);
      window.removeEventListener("keydown", note, true);
    };
  }, [inactivityArmed]);

  const markSessionExpired = useCallback(() => {
    markDesktopKioskSessionExpired();
    setSessionExpired(true);
    setBusy(false);
    performLock.current = false;
    setPending(null);
    setParticipant(null);
    setSuccess("");
    setPendingAction(null);
    setMessage("");
    setExitError("");
  }, []);

  useEffect(() => {
    if (authState.status === "anonymous" && groupId) {
      markSessionExpired();
    }
  }, [authState.status, groupId, markSessionExpired]);

  const applyKioskPayload = useCallback(async (response: Record<string, any>) => {
    const saved = (response.kiosk_settings || response.kiosk || {}) as Partial<KioskConfig>;
    const structured = Boolean(saved.structured);
    const nextClasses = (response.classes || []) as KioskClass[];
    const classResolution = resolveStructuredClassAfterRefresh(selectedClassRef.current, nextClasses);

    if (structured) {
      setClasses(nextClasses);
      setSelectedClass(classResolution.selected);
      if (classResolution.clearPeople) {
        setData((old) => ({ ...response, people: [] }));
      } else if (classResolution.selected) {
        // Preserve class screen: apply top-level payload without top-level people,
        // then reload the selected class roster.
        setData((old) => ({ ...response, people: old.people || [] }));
        try {
          const classPeople = await api.get<{ people: Person[] }>(
            `${endpoints.kiosk(groupId)}classes/${classResolution.selected.id}/people/`,
          );
          setData((old) => ({ ...old, people: classPeople.people || [] }));
        } catch (caught) {
          if (isMissingCredentialsError(caught)) {
            markSessionExpired();
            return;
          }
          // Keep previous class people on soft failure.
        }
      } else {
        setData({ ...response, people: [] });
      }
    } else {
      setClasses(nextClasses);
      setData(response);
    }
  }, [api, groupId, markSessionExpired]);

  const refreshKiosk = useCallback(async (opts?: { soft?: boolean; force?: boolean; showLoading?: boolean }) => {
    if (!groupId) return;
    if (exiting.current || isDesktopKioskExitGuardActive()) {
      if (opts?.showLoading) setLoading(false);
      return;
    }
    const soft = Boolean(opts?.soft);
    const force = Boolean(opts?.force);
    if (sessionExpired && soft) return;

    if (refreshInFlight.current) {
      if (soft) pendingSoftRefresh.current = true;
      return;
    }
    if (!force && soft && !isKioskRefreshIdle({
      ...idleSnapshotRef.current,
      performLocked: performLock.current,
      refreshInFlight: refreshInFlight.current,
    })) {
      pendingSoftRefresh.current = true;
      return;
    }

    const sequence = ++requestSequence.current;
    refreshInFlight.current = true;
    if (opts?.showLoading) setLoading(true);

    try {
      const alreadyLocked = Boolean(auth.getState().session?.kiosk_locked);
      if (!soft && !entered.current && !alreadyLocked) {
        const start = await api.post<{ kiosk_exit_token?: string }>(endpoints.kiosk(groupId), {});
        const issued = String(start?.kiosk_exit_token || "").trim();
        if (issued) {
          await saveKioskExitToken(groupId, issued, {
            workspaceKey: auth.getState().session?.workspace?.id ?? "unknown",
          });
        }
        setDesktopKioskActive(groupId);
        entered.current = true;
      } else if (!entered.current) {
        entered.current = true;
        setDesktopKioskActive(groupId);
      }

      const response = await api.get<Record<string, any>>(endpoints.kiosk(groupId));
      if (sequence !== requestSequence.current) return;
      await applyKioskPayload(response);
      lastRefreshAtRef.current = Date.now();
      if (!soft) setMessage("");
    } catch (caught) {
      if (isMissingCredentialsError(caught)) {
        markSessionExpired();
        if (!soft && sequence === requestSequence.current) setLoading(false);
        return;
      }
      if (!soft && sequence === requestSequence.current) {
        setMessage(formatError(caught, t("common.error")));
      }
      // Soft refresh failures keep last successful kiosk content.
    } finally {
      refreshInFlight.current = false;
      if (sequence === requestSequence.current && !soft) setLoading(false);
      if (
        pendingSoftRefresh.current
        && isKioskRefreshIdle({
          ...idleSnapshotRef.current,
          performLocked: performLock.current,
          refreshInFlight: false,
          sessionExpired,
        })
        && !sessionExpired
      ) {
        pendingSoftRefresh.current = false;
        void refreshKiosk({ soft: true });
      }
    }
  }, [api, applyKioskPayload, auth, groupId, markSessionExpired, sessionExpired, t]);

  const refreshKioskRef = useRef(refreshKiosk);
  refreshKioskRef.current = refreshKiosk;

  useEffect(() => {
    if (isDesktopKioskSessionExpired()) {
      setSessionExpired(true);
      setLoading(false);
      if (groupId) setDesktopKioskActive(groupId);
      return () => {
        requestSequence.current += 1;
        if (timer.current) clearTimeout(timer.current);
      };
    }
    void refreshKioskRef.current({ soft: false, force: true, showLoading: true });
    return () => {
      requestSequence.current += 1;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [groupId]);

  useForegroundRefresh(async () => {
    if (document.visibilityState === "hidden") {
      wasBackgroundedRef.current = true;
      return;
    }
    const should = shouldRefreshOnForeground({
      wasBackgrounded: wasBackgroundedRef.current,
      now: Date.now(),
      lastRefreshAt: lastRefreshAtRef.current,
      minElapsedMs: KIOSK_FOREGROUND_MIN_ELAPSED_MS,
    });
    wasBackgroundedRef.current = false;
    if (should) await refreshKioskRef.current({ soft: true });
  });

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") wasBackgroundedRef.current = true;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!shouldRunPeriodicRefresh({
        now: Date.now(),
        lastRefreshAt: lastRefreshAtRef.current,
        appActive: document.visibilityState !== "hidden",
      })) {
        return;
      }
      void refreshKioskRef.current({ soft: true });
    }, KIOSK_SOFT_REFRESH_MS);
    return () => clearInterval(interval);
  }, [groupId]);

  useEffect(() => {
    if (
      pendingSoftRefresh.current
      && isKioskRefreshIdle({
        ...idleSnapshotRef.current,
        performLocked: performLock.current,
        refreshInFlight: refreshInFlight.current,
      })
      && !sessionExpired
      && !refreshInFlight.current
    ) {
      pendingSoftRefresh.current = false;
      void refreshKioskRef.current({ soft: true });
    }
  }, [
    busy,
    participant,
    pending,
    success,
    exitOpen,
    classPinBusy,
    sessionExpired,
  ]);


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
  const mediaNamespace = String(authState.session?.workspace?.id || auth.getState().session?.workspace?.id || "unknown");

  function identity(person: Person) {
    return person.participant_kind === "member"
      ? { participant_kind: person.participant_kind, membership_id: person.membership_id }
      : { participant_kind: person.participant_kind, group_only_participant_id: person.group_only_participant_id };
  }

  async function selectPerson(person: Person, suppliedPin?: string) {
    if (sessionExpired) return;
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
      if (isMissingCredentialsError(caught)) {
        markSessionExpired();
        return;
      }
      setMessage(formatError(caught, t("common.error")));
    } finally {
      setBusy(false);
    }
  }

  async function identify() {
    if (sessionExpired) return;
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
      if (isMissingCredentialsError(caught)) {
        markSessionExpired();
        return;
      }
      setMessage(formatError(caught, t("common.error")));
    } finally {
      setBusy(false);
    }
  }

  async function perform(action: ActionType) {
    if (sessionExpired || !participant || performLock.current) return;
    primeConfirmationAudio({ enabled: config.confirmation.sound_enabled !== false });
    performLock.current = true;
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
      if (isMissingCredentialsError(caught)) {
        markSessionExpired();
        return;
      }
      setMessage(formatError(caught, t("common.error")));
    } finally {
      performLock.current = false;
      setPendingAction(null);
      setBusy(false);
    }
  }

  async function openClass(section: KioskClass) {
    if (sessionExpired) return;
    setSelectedClass(section);
    setMessage("");
    if (!config.require_class_pin) await loadClass(section);
  }

  async function loadClass(section: KioskClass) {
    try {
      const result = await api.get<{ people: Person[] }>(`${endpoints.kiosk(groupId)}classes/${section.id}/people/`);
      setData((old) => ({ ...old, people: result.people || [] }));
    } catch (caught) {
      if (isMissingCredentialsError(caught)) {
        markSessionExpired();
        return;
      }
      setMessage(formatError(caught, t("common.error")));
    }
  }

  async function verifyClass() {
    if (sessionExpired || !selectedClass) return;
    setClassPinBusy(true);
    setBusy(true);
    setMessage("");
    try {
      await api.post(`${endpoints.kiosk(groupId)}classes/${selectedClass.id}/verify-pin/`, { pin: classPin });
      await loadClass(selectedClass);
      setClassPin("");
    } catch (caught) {
      if (isMissingCredentialsError(caught)) {
        markSessionExpired();
        return;
      }
      setMessage(formatError(caught, t("common.error")));
    } finally {
      setClassPinBusy(false);
      setBusy(false);
    }
  }

  async function exit() {
    const recoveringFromExpiry = sessionExpired;
    setBusy(true);
    setExitError("");
    try {
      const workspaceKey =
        authState.session?.workspace?.id
        ?? auth.getState().session?.workspace?.id
        ?? undefined;
      const scopedToken = await loadKioskExitTokenPersistent(groupId, { workspaceKey });
      const response = await api.post<{
        kiosk_locked?: boolean;
        kiosk_group_id?: number | null;
        kiosk_available?: boolean;
      }>(endpoints.kioskExit(), {
        group_id: Number(groupId),
        exit_code: exitCode.trim(),
        ...(scopedToken ? { kiosk_exit_token: scopedToken } : {}),
      });
      clearKioskExitToken(groupId, { workspaceKey });
      clearDesktopKioskActive(groupId);
      clearDesktopKioskSessionExpired();
      exiting.current = true;
      requestSequence.current += 1;
      beginDesktopKioskExitGuard();
      setSessionExpired(false);
      setExitOpen(false);
      setExitCode("");

      if (recoveringFromExpiry) {
        clearAllKioskExitTokens();
        flushSync(() => {
          // Auth is already anonymous; keep listeners consistent.
        });
        navigate("/sign-in", { replace: true });
        return;
      }

      flushSync(() => {
        auth.applyKioskUnlock(response);
      });
      navigate("/", { replace: true });
      void auth.refreshWorkspace().catch(() => {});
    } catch (caught) {
      exiting.current = false;
      if (isMissingCredentialsError(caught) && recoveringFromExpiry) {
        setExitError(
          t("kiosk.sessionExpired.exitBlocked")
          || "Session expired. Exit PIN cannot be verified until an administrator signs in again on this device.",
        );
      } else {
        setExitError(formatError(caught, t("common.error")));
      }
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
    setClassPin("");
    setSuccess("");
    setConfirmationEffect(null);
    setMessage("");
    setPending(null);
  }

  resetInactivityRef.current = () => {
    if (performLock.current || busy || pendingAction) return;
    reset();
  };

  if (loading) return <div className="kiosk-loading"><Loading label={t("common.loading")} /></div>;

  const operationalBody = (
    <div className={`kiosk-body${config.kiosk_mode === "input" && !config.structured ? " kiosk-body-input" : ""}`}>
      {inactivityRemaining != null ? (
        <p className="hint kiosk-inactivity-countdown" aria-live="polite">
          {t("kiosk.live.inactivity.returning", { seconds: inactivityRemaining })}
        </p>
      ) : null}
      {sessionExpired && !exitOpen ? (
        <div className="kiosk-session-expired" role="alert">
          <h2 className="kiosk-session-expired-title">{t("kiosk.sessionExpired.title") || "Session expired"}</h2>
          <p className="kiosk-session-expired-body">{t("kiosk.sessionExpired.body") || "An administrator needs to sign in again."}</p>
          <button type="button" className="btn-primary kiosk-submit" onClick={() => setExitOpen(true)}>{t("kiosk.exit")}</button>
        </div>
      ) : null}
      {config.welcome_text && !participant && !success && !sessionExpired ? <p className="kiosk-welcome">{config.welcome_text}</p> : null}
      {message ? <div className="kiosk-inline-error" role="alert"><strong>{message}</strong></div> : null}
      {sessionExpired ? null : success ? (
        <DesktopKioskConfirmation family={flowFamily} message={success} accent={flowAccent} />
      ) : participant && pendingAction ? (
        <DesktopKioskProcessing family={flowFamily} name={kioskParticipantDisplayName(participant.name, t("kiosk.participantFallback"))} accent={flowAccent} />
      ) : participant ? (
        <div className="kiosk-flow kiosk-flow--action">
          <div className="kiosk-participant-summary">
            <ParticipantAvatar person={participant} compact cacheNamespace={mediaNamespace} />
            <div className="kiosk-participant-summary-text"><strong className="kiosk-participant-summary-name">{kioskParticipantDisplayName(participant.name, t("kiosk.participantFallback"))}</strong></div>
          </div>
          <div className="kiosk-actions">
            {actions.map((action) => <button disabled={busy} type="button" className="kiosk-action-choice" key={action} onClick={() => void perform(action)}>{actionLabel(action, t)}</button>)}
          </div>
          <button type="button" className="btn-secondary kiosk-submit" onClick={reset}>{t("common.back")}</button>
        </div>
      ) : config.structured && !selectedClass ? (
        classes.length ? <div className="kiosk-people-grid">{classes.map((section) => {
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
              <ParticipantAvatar person={person} cacheNamespace={mediaNamespace} />
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

  const helperStep: KioskHelperStep = sessionExpired
    ? "start"
    : success
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
  const exitHint = sessionExpired
    ? (t("kiosk.sessionExpired.exitHint") || "Enter the kiosk exit code. Workspace access stays locked until this code is verified.")
    : (locale === "ja" ? "このグループのキオスク終了コードを入力して、このアプリのロックを解除してください。" : "Enter this Group's kiosk exit code to unlock this app.");

  return <>
    <DesktopKioskRenderer design={design} kioskMode={config.kiosk_mode} helperText={helperText} exitLabel={t("kiosk.exit")} onExit={() => setExitOpen(true)} cacheNamespace={mediaNamespace}>
      {operationalBody}
    </DesktopKioskRenderer>
    {pending && !sessionExpired ? <DesktopKioskPinDialog title={kioskParticipantDisplayName(pending.name, t("kiosk.participantFallback"))} label={t("kiosk.pin")} code={pin} error={message} busy={busy} cancelLabel={t("common.cancel")} confirmLabel={t("kiosk.verify")} onCodeChange={setPin} onCancel={() => { setPending(null); setPin(""); setMessage(""); }} onConfirm={() => void selectPerson(pending, pin)} /> : null}
    {exitOpen ? <DesktopKioskExitDialog code={exitCode} error={exitError} busy={busy} onCodeChange={setExitCode} onCancel={() => { setExitOpen(false); setExitCode(""); setExitError(""); }} onConfirm={() => void exit()} labels={{ title: t("kiosk.exit"), hint: exitHint, code: t("kiosk.exitCode"), show: t("auth.showPassword"), hide: t("auth.hidePassword"), cancel: t("common.cancel"), exit: t("kiosk.exit"), verifying: t("common.loading") }} /> : null}
  </>;
}

function ParticipantAvatar({ person, compact = false, cacheNamespace }: { person: Person; compact?: boolean; cacheNamespace?: string }) {
  return <span className={`kiosk-person-avatar${compact ? " kiosk-person-avatar--compact" : ""}${person.photo_url ? " kiosk-person-avatar--photo" : " kiosk-person-avatar--fallback"}`} aria-hidden="true">
    <span className="kiosk-person-initials">{initials(person.name)}</span>
    {person.photo_url ? <AuthenticatedImage alt="" src={person.photo_url} cacheNamespace={cacheNamespace} /> : null}
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
