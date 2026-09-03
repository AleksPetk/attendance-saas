import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { flushSync } from "react-dom";
import { api, errorMessage } from "./api.js";
import { Field, LoadingState, PasswordInput } from "./components.jsx";
import {
  classPinGateRequired,
  resolveClassSectionId,
} from "./groupKioskClassNav.js";
import {
  initialKioskStepFromStartPayload,
  peopleFromKioskStartPayload,
} from "./groupKioskStartPeople.js";
import { browserReportTimezone } from "./history/reportTimezone.js";
import KioskRenderer from "./kiosk/KioskRenderer.jsx";
import KioskConfirmationScreen from "./kiosk/KioskConfirmationScreen.jsx";
import KioskProcessingScreen from "./kiosk/KioskProcessingScreen.jsx";
import {
  primeConfirmationAudio,
  runConfirmationEffects,
  shouldRunConfirmationEffects,
} from "./kiosk/confirmationEffects.js";
import { KioskParticipantSummary } from "./kiosk/KioskParticipantSummary.jsx";
import { KioskIdentifyGenericVisual } from "./kiosk/kioskIdentifyGenericVisual.jsx";
import {
  confirmationVisualAccent,
  resolveConfirmationVisualFamily,
} from "./kiosk/kioskConfirmation.js";
import {
  KioskInlineError,
  KioskPersonAvatar,
  KioskPersonCardFields,
  KioskPinInput,
  actionLabel,
  kioskAutofillShield,
  kioskErrorCopy,
} from "./kiosk/kioskUi.jsx";

function PinDialog({ pin, onPinChange, error, verifying, onCancel, onConfirm }) {
  const { t } = useTranslation("kiosk");
  const { t: tCommon } = useTranslation("common");
  return (
    <div className="kiosk-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="kiosk-pin-title">
      <form
        className="kiosk-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <h2 id="kiosk-pin-title">{t("live.pin.title")}</h2>
        <p className="hint">{t("live.pin.hint")}</p>
        <Field label={t("fields.pin")}>
          <KioskPinInput
            inputRef={null}
            id="kiosk-card-pin"
            value={pin}
            onChange={onPinChange}
          />
        </Field>
        <KioskInlineError error={error} />
        <div className="kiosk-exit-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={verifying}>
            {tCommon("cancel")}
          </button>
          <button type="submit" className="btn-primary" disabled={verifying || !pin}>
            {verifying ? t("verifying") : t("continue")}
          </button>
        </div>
      </form>
    </div>
  );
}

function ParticipantActionPanel({
  selected,
  attendanceState,
  automaticNote,
  allowedActions,
  error,
  performing,
  onBack,
  onChooseAction,
  showInstruction = true,
}) {
  const { t } = useTranslation("kiosk");
  return (
    <div className="kiosk-flow kiosk-flow--action">
      {showInstruction ? <h2>{t("live.chooseAction")}</h2> : null}
      {automaticNote ? <p className="hint">{automaticNote}</p> : null}
      {selected?.name ? (
        <KioskParticipantSummary
          name={selected.name}
          photoUrl={selected.photo_url}
          attendanceState={attendanceState}
        />
      ) : null}
      <KioskInlineError error={error} />
      {allowedActions.length === 0 ? <p className="hint">{t("live.noActions")}</p> : null}
      <div className="kiosk-actions">
        {allowedActions.map((action) => (
          <button
            key={action}
            type="button"
            className="kiosk-action-choice"
            disabled={performing}
            onClick={() => onChooseAction(action)}
          >
            {actionLabel(action)}
          </button>
        ))}
      </div>
      <button type="button" className="btn-secondary kiosk-submit" onClick={onBack} disabled={performing}>
        {t("live.backToParticipants")}
      </button>
    </div>
  );
}

function ClassPinPanel({
  className,
  pin,
  onPinChange,
  error,
  verifying,
  onCancel,
  onConfirm,
  showInstruction = true,
}) {
  const { t } = useTranslation("kiosk");
  return (
    <div className="kiosk-flow kiosk-flow--pin">
      <h2>{className}</h2>
      {showInstruction ? <p className="hint">{t("live.classPinHint")}</p> : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <Field label={t("fields.classPin")}>
          <KioskPinInput
            inputRef={null}
            id="kiosk-class-pin"
            value={pin}
            onChange={onPinChange}
          />
        </Field>
        <KioskInlineError error={error} />
        <div className="kiosk-actions">
          <button type="submit" className="btn-primary kiosk-submit" disabled={verifying || !pin}>
            {verifying ? t("verifying") : t("continue")}
          </button>
          <button type="button" className="btn-secondary kiosk-submit" onClick={onCancel} disabled={verifying}>
            {t("live.backToClasses")}
          </button>
        </div>
      </form>
    </div>
  );
}

function ExitKioskDialog({
  exitCode,
  onExitCodeChange,
  error,
  verifying,
  onCancel,
  onConfirm,
}) {
  const { t } = useTranslation("kiosk");
  const { t: tCommon } = useTranslation("common");
  return (
    <div className="kiosk-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="kiosk-exit-title">
      <form
        className="kiosk-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <h2 id="kiosk-exit-title">{t("live.exit.title")}</h2>
        <p className="hint">{t("live.exit.hint")}</p>
        <Field label={t("fields.exitCode")} error={error}>
          <PasswordInput
            value={exitCode}
            onChange={(event) => onExitCodeChange(event.target.value)}
            autoComplete="off"
            name="kiosk-exit-code"
            autoFocus
          />
        </Field>
        <div className="kiosk-exit-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={verifying}>
            {tCommon("cancel")}
          </button>
          <button type="submit" className="btn-primary" disabled={verifying || !exitCode}>
            {verifying ? t("verifying") : t("exitKiosk")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function GroupKioskScreen({ session, groupId, onUnlocked, onKioskEntered }) {
  const { t } = useTranslation("kiosk");
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState(null);
  const [kiosk, setKiosk] = useState(null);
  const [visualDesign, setVisualDesign] = useState(null);
  const [people, setPeople] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [classPin, setClassPin] = useState("");
  const [formKey, setFormKey] = useState(0);

  const [step, setStep] = useState("start");
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  const [inputValues, setInputValues] = useState({});
  const [allowedActions, setAllowedActions] = useState([]);
  const [attendanceState, setAttendanceState] = useState(null);
  const [automaticNote, setAutomaticNote] = useState("");

  const [exitOpen, setExitOpen] = useState(false);
  const [exitCode, setExitCode] = useState("");
  const [exitError, setExitError] = useState("");
  const [verifyingExit, setVerifyingExit] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [performing, setPerforming] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const pinInputRef = useRef(null);
  const firstFieldRef = useRef(null);
  const returnTimerRef = useRef(null);
  const performingRef = useRef(false);
  const pendingActionRef = useRef(null);
  const confirmationPresentationSequenceRef = useRef(0);
  const lastEffectsPresentationRef = useRef(null);

  const usePin = Boolean(kiosk?.use_pin);
  const kioskMode = kiosk?.kiosk_mode;
  const isStructured = Boolean(kiosk?.structured);
  const requireClassPin = Boolean(kiosk?.require_class_pin);
  const participantCodeLabel =
    kiosk?.participant_code_label || t("fields.groupParticipantCode");
  const kioskLocked = Boolean(session?.workspace?.kiosk_locked);

  function clearParticipantFields() {
    setInputValues({});
    setPin("");
    setSelected(null);
    setAllowedActions([]);
    setAttendanceState(null);
    setAutomaticNote("");
    setFormKey((value) => value + 1);
  }

  function clearClassSelection() {
    setSelectedClass(null);
    setClassPin("");
    clearParticipantFields();
  }

  async function load() {
    if (!groupId) {
      setLoading(false);
      setUnavailable(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (typeof window !== "undefined" && window.__kioskExitGuardUntil && Date.now() < window.__kioskExitGuardUntil) {
        setLoading(false);
        return;
      }
      if (!session?.workspace?.kiosk_locked) {
        const lockResult = await api.enterKiosk(session, groupId);
        onKioskEntered?.(groupId, lockResult.data);
      }
      const result = await api.getGroupKioskStart(session, groupId);
      const nextKiosk = result.data.kiosk || null;
      setKiosk(nextKiosk);
      setVisualDesign(result.data.visual_design || null);
      setClasses(result.data.classes || []);
      setUnavailable(false);
      clearClassSelection();
      setConfirmation(null);
      // Structured starts on Class cards (people loaded after Class selection).
      // Standard Card mode must keep the start payload people list.
      setPeople(peopleFromKioskStartPayload(result.data));
      setStep(initialKioskStepFromStartPayload(result.data));
    } catch (err) {
      const locked = Boolean(err?.data?.kiosk_locked) || kioskLocked;
      if (err?.status === 404 || (locked && err?.status === 403)) {
        setUnavailable(true);
        setKiosk(null);
        setVisualDesign(null);
      } else {
        setError(kioskErrorCopy(err) || { title: t("errors.loadFailed") });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!groupId) {
      setLoading(false);
      setUnavailable(true);
      return undefined;
    }
    load();
    return () => {
      if (returnTimerRef.current) {
        window.clearTimeout(returnTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    if (step !== "pin" && !(step === "start" && (kiosk?.input_fields || []).includes("pin"))) {
      return;
    }
    pinInputRef.current?.focus();
  }, [step, formKey, kiosk]);

  useEffect(() => {
    if (!shouldRunConfirmationEffects({
      step,
      confirmation,
      lastPresentationId: lastEffectsPresentationRef.current,
    })) {
      return;
    }
    lastEffectsPresentationRef.current = confirmation.presentation_id;
    runConfirmationEffects({
      soundEnabled: confirmation.sound_enabled !== false,
      vibrationEnabled: confirmation.vibration_enabled,
    });
  }, [confirmation, step]);

  const title = kiosk?.title || (unavailable ? t("titleUnavailable") : t("titleDefault"));
  const welcomeText = kiosk?.welcome_text || "";

  const confirmationVisualFamily = useMemo(
    () => resolveConfirmationVisualFamily(visualDesign?.config?.main || {}, kioskMode || "card"),
    [visualDesign, kioskMode],
  );
  const confirmationAccentStyle = useMemo(() => {
    const accent = confirmationVisualAccent(confirmationVisualFamily);
    return {
      "--kc-accent": accent,
      "--kc-accent-2": accent,
      "--kc-accent-gradient": accent,
      "--kc-accent-mode": "solid",
    };
  }, [confirmationVisualFamily]);

  const themeClass = useMemo(() => {
    if (!kiosk?.theme) return "kiosk-theme-classic";
    return `kiosk-theme-${kiosk.theme}`;
  }, [kiosk]);

  async function verifyExit() {
    setExitError("");
    setVerifyingExit(true);
    try {
      const exitResult = await api.exitKiosk({ exit_code: exitCode });
      setExitOpen(false);
      setExitCode("");
      onUnlocked?.({
        groupAvailable: !unavailable && Boolean(groupId),
        lockPayload: exitResult.data,
      });
    } catch (err) {
      setExitError(errorMessage(err) || t("errors.exitVerificationFailed"));
    } finally {
      setVerifyingExit(false);
    }
  }

  function scheduleReturnToStart(delaySeconds) {
    if (returnTimerRef.current) {
      window.clearTimeout(returnTimerRef.current);
    }
    returnTimerRef.current = window.setTimeout(() => {
      setConfirmation(null);
      setError(null);
      clearParticipantFields();
      if (isStructured) {
        setSelectedClass(null);
        setClassPin("");
        setPeople([]);
        setStep("classes");
        load();
        return;
      }
      setStep("start");
      if (kioskMode === "card") {
        load();
      }
    }, Math.max(1, delaySeconds || 3) * 1000);
  }

  function successPanel() {
    if (!confirmation) return null;
    return (
      <KioskConfirmationScreen
        template={confirmationVisualFamily}
        message={confirmation.message}
        accentStyle={confirmationAccentStyle}
      />
    );
  }

  function processingPanel() {
    const action = pendingAction || pendingActionRef.current || "";
    return (
      <KioskProcessingScreen
        template={confirmationVisualFamily}
        action={action}
        participantName={selected?.name}
        photoUrl={selected?.photo_url}
        accentStyle={confirmationAccentStyle}
      />
    );
  }

  async function applyIdentifyResult(result) {
    setSelected({
      participant_kind: result.data.participant.participant_kind,
      membership_id: result.data.participant.membership_id,
      group_only_participant_id: result.data.participant.group_only_participant_id,
      name: result.data.participant.name,
      photo_url: result.data.participant.photo_url ?? null,
    });
    setAllowedActions(result.data.allowed_actions || []);
    setAttendanceState(result.data.attendance_state);
    setAutomaticNote("");
    setStep("confirm");
  }

  async function identifyCardParticipant(participant, pinValue = "") {
    setError(null);
    setIdentifying(true);
    try {
      const payload = {
        participant_kind: participant.participant_kind,
      };
      if (participant.participant_kind === "member") {
        payload.membership_id = participant.membership_id;
      } else {
        payload.group_only_participant_id = participant.group_only_participant_id;
      }
      if (usePin && pinValue) {
        payload.pin = pinValue;
      }
      const result = await api.identifyKiosk(session, groupId, payload);
      if (result.data.code !== "ok") {
        setError(kioskErrorCopy({ data: result.data }) || { title: t("errors.identifyFailed") });
        return false;
      }
      await applyIdentifyResult(result);
      return true;
    } catch (err) {
      setError(kioskErrorCopy(err) || { title: t("errors.identifyFailed") });
      if (usePin) {
        setPin("");
      }
      return false;
    } finally {
      setIdentifying(false);
    }
  }

  async function handleCardTap(participant) {
    setError(null);
    setSelected(participant);
    if (usePin) {
      setPin("");
      setStep("pin");
      return;
    }
    await identifyCardParticipant(participant);
  }

  async function submitCardPin() {
    if (!selected) return;
    const ok = await identifyCardParticipant(selected, pin);
    if (ok) {
      setStep("confirm");
    }
  }

  function cancelCardPin() {
    setStep("start");
    setPin("");
    setError(null);
    setSelected(null);
  }

  function backToParticipants() {
    if (performingRef.current || step === "processing") return;
    setStep("start");
    setError(null);
    clearParticipantFields();
  }

  function backToClasses() {
    setError(null);
    setClassPin("");
    setPeople([]);
    setSelectedClass(null);
    clearParticipantFields();
    setStep("classes");
  }

  async function loadClassPeople(section) {
    const sectionId = resolveClassSectionId(section);
    if (sectionId == null) {
      setError({ title: t("errors.openClassFailed"), detail: t("errors.missingClassId") });
      return false;
    }
    setIdentifying(true);
    setError(null);
    try {
      const result = await api.getGroupKioskClassPeople(session, groupId, sectionId);
      setSelectedClass({
        id: result.data.section_id,
        name: result.data.section_name,
        requires_class_pin: result.data.requires_class_pin,
      });
      setPeople(result.data.people || []);
      setClassPin("");
      setStep("start");
      return true;
    } catch (err) {
      setError(kioskErrorCopy(err) || { title: t("errors.openClassFailed") });
      setClassPin("");
      return false;
    } finally {
      setIdentifying(false);
    }
  }

  async function handleClassTap(section) {
    const sectionId = resolveClassSectionId(section);
    if (sectionId == null) {
      setError({ title: t("errors.openClassFailed"), detail: t("errors.missingClassId") });
      return;
    }
    setError(null);
    setSelectedClass(section);
    if (classPinGateRequired(requireClassPin, section)) {
      setClassPin("");
      setStep("class_pin");
      return;
    }
    await loadClassPeople(section);
  }

  async function submitClassPin() {
    const sectionId = resolveClassSectionId(selectedClass);
    if (sectionId == null) return;
    setIdentifying(true);
    setError(null);
    try {
      await api.verifyGroupKioskClassPin(session, groupId, sectionId, {
        pin: classPin,
      });
      setClassPin("");
      await loadClassPeople(selectedClass);
    } catch (err) {
      setError(kioskErrorCopy(err) || { title: t("errors.incorrectPin") });
      setClassPin("");
    } finally {
      setIdentifying(false);
    }
  }

  async function performAction(action) {
    if (!selected || performingRef.current || step === "processing") return;
    primeConfirmationAudio({ enabled: kiosk?.confirmation?.sound_enabled !== false });
    performingRef.current = true;
    pendingActionRef.current = action;
    // Force Processing to paint before the network round-trip begins.
    // Without flushSync, Choose Action can remain visible for the whole wait.
    flushSync(() => {
      setPendingAction(action);
      setPerforming(true);
      setError(null);
      setStep("processing");
    });
    try {
      const payload = {
        participant_kind: selected.participant_kind,
        action,
      };
      const reportTimezone = browserReportTimezone();
      if (reportTimezone) {
        payload.timezone = reportTimezone;
      }
      if (selected.participant_kind === "member") {
        payload.membership_id = selected.membership_id;
      } else {
        payload.group_only_participant_id = selected.group_only_participant_id;
      }
      if (usePin) {
        payload.pin = pin || inputValues.pin || "";
      }
      const result = await api.performKioskAction(session, groupId, payload);
      const conf = result.data.confirmation || {
        template: kiosk?.confirmation?.template || "clean",
        message: result.data.success_message || "",
        return_delay_seconds: result.data.return_delay_seconds || kiosk?.return_delay_seconds || 3,
        sound_enabled: kiosk?.confirmation?.sound_enabled !== false,
        vibration_enabled: Boolean(kiosk?.confirmation?.vibration_enabled),
        action,
      };
      confirmationPresentationSequenceRef.current += 1;
      setConfirmation({
        ...conf,
        presentation_id: confirmationPresentationSequenceRef.current,
      });
      setStep("success");
      setError(null);
      setInputValues({});
      setPin("");
      setFormKey((value) => value + 1);
      scheduleReturnToStart(conf.return_delay_seconds);
    } catch (err) {
      const copy = kioskErrorCopy(err);
      setError(copy);
      setStep("confirm");
      if (err?.data?.code === "invalid_pin" || usePin) {
        setPin("");
        setInputValues((current) => ({ ...current, pin: "" }));
        window.setTimeout(() => pinInputRef.current?.focus(), 0);
      }
    } finally {
      setPerforming(false);
      performingRef.current = false;
      pendingActionRef.current = null;
      setPendingAction(null);
    }
  }

  async function handleInputSubmit(event) {
    event.preventDefault();
    setError(null);
    try {
      const payload = {};
      for (const field of kiosk.input_fields || []) {
        if (field === "participant_code") {
          payload.participant_code = inputValues.participant_code || "";
        }
        if (field === "name") payload.name = inputValues.name || "";
        if (field === "email") payload.email = inputValues.email || "";
        if (field === "pin") payload.pin = inputValues.pin || "";
      }
      const result = await api.identifyKiosk(session, groupId, payload);
      if (result.data.code !== "ok") {
        setError(kioskErrorCopy({ data: result.data }) || { title: t("errors.identifyFailed") });
        setInputValues((current) => ({ ...current, pin: "" }));
        return;
      }
      await applyIdentifyResult(result);
      setInputValues((current) => ({ ...current, pin: "" }));
    } catch (err) {
      setError(kioskErrorCopy(err) || { title: t("errors.identifyFailed") });
      setInputValues((current) => ({ ...current, pin: "" }));
      const fields = kiosk?.input_fields || [];
      window.setTimeout(() => {
        if (err?.data?.code === "invalid_pin" || fields.includes("pin")) {
          pinInputRef.current?.focus();
        } else {
          firstFieldRef.current?.focus();
        }
      }, 0);
    }
  }

  const showExit = kioskLocked || Boolean(onUnlocked);
  const useVisualRenderer = Boolean(visualDesign?.config);
  const structuredHelperText = isStructured
    ? step === "classes"
      ? t("live.classes.choose")
      : step === "class_pin"
        ? t("live.classPinHint")
        : step === "start" && people.length > 0
          ? t("live.participants.chooseStructured")
          : step === "confirm"
            ? t("live.chooseAction")
            : ""
    : "";

  const exitDialog = exitOpen ? (
    <ExitKioskDialog
      exitCode={exitCode}
      onExitCodeChange={setExitCode}
      error={exitError}
      verifying={verifyingExit}
      onCancel={() => {
        setExitOpen(false);
        setExitCode("");
        setExitError("");
      }}
      onConfirm={verifyExit}
    />
  ) : null;

  const pinDialog =
    kioskMode === "card" && step === "pin" ? (
      <PinDialog
        pin={pin}
        onPinChange={setPin}
        error={error}
        verifying={identifying}
        onCancel={cancelCardPin}
        onConfirm={submitCardPin}
      />
    ) : null;

  const operationalBody = (
    <>
      {unavailable ? (
        <div className="kiosk-body kiosk-body-input">
          <div className="kiosk-flow">
            <h2>{t("live.unavailable.title")}</h2>
            <p className="hint">
              {t("live.unavailable.body")}
            </p>
            <form
              className="kiosk-recovery-form"
              onSubmit={(event) => {
                event.preventDefault();
                setExitOpen(false);
                verifyExit();
              }}
            >
              <Field label={t("fields.exitCode")} error={exitError}>
                <PasswordInput
                  value={exitCode}
                  onChange={(event) => setExitCode(event.target.value)}
                  autoComplete="off"
                  name="kiosk-exit-code-recovery"
                />
              </Field>
              <button type="submit" className="btn-primary kiosk-submit" disabled={verifyingExit || !exitCode}>
                {verifyingExit ? t("verifying") : t("live.unavailable.unlockSession")}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {!unavailable && step === "processing" ? (
        <div
          className={`kiosk-body${
            kioskMode === "input" && !isStructured ? " kiosk-body-input" : ""
          }`}
        >
          {processingPanel()}
        </div>
      ) : null}

      {(kioskMode === "card" || isStructured) && !unavailable && step !== "processing" ? (
        <div className="kiosk-body">
          {useVisualRenderer && welcomeText && (step === "start" || step === "classes") ? (
            <p className="kiosk-welcome">{welcomeText}</p>
          ) : null}

          {isStructured && step === "classes" ? (
            <>
              {!useVisualRenderer ? <h2>{t("live.classes.choose")}</h2> : null}
              <KioskInlineError error={error} />
              {identifying ? <p className="hint">{t("live.classes.opening")}</p> : null}
              {classes.length === 0 ? (
                <div className="empty-state">
                  <h2>{t("live.classes.emptyTitle")}</h2>
                  <p>{t("live.classes.emptyBody")}</p>
                </div>
              ) : (
                <div className="kiosk-people-grid">
                  {classes.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      className="kiosk-person-card"
                      disabled={identifying}
                      onClick={() => handleClassTap(section)}
                    >
                      <KioskPersonAvatar name={section.name} variant="class" />
                      <KioskPersonCardFields
                        name={section.name}
                        meta={t("participantCount", { count: section.participant_count })}
                      />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {isStructured && step === "class_pin" && selectedClass ? (
            <ClassPinPanel
              className={selectedClass.name}
              pin={classPin}
              onPinChange={setClassPin}
              error={error}
              verifying={identifying}
              onCancel={backToClasses}
              onConfirm={submitClassPin}
              showInstruction={!useVisualRenderer}
            />
          ) : null}

          {people.length === 0 && step === "start" && !isStructured ? (
            <div className="empty-state">
              <h2>{t("live.participants.emptyTitle")}</h2>
              <p>{t("live.participants.emptyBody")}</p>
            </div>
          ) : null}

          {people.length === 0 && step === "start" && isStructured ? (
            <div className="empty-state">
              <h2>{t("live.participants.emptyClassTitle")}</h2>
              <button type="button" className="btn-secondary kiosk-submit" onClick={backToClasses}>
                {t("live.backToClasses")}
              </button>
            </div>
          ) : null}

          {people.length > 0 && step === "start" ? (
            <>
              {isStructured && selectedClass ? (
                <h2>{selectedClass.name}</h2>
              ) : null}
              {isStructured ? (
                !useVisualRenderer ? (
                  <p className="hint kiosk-hint">{t("live.participants.chooseStructured")}</p>
                ) : null
              ) : null}
              <div className="kiosk-people-grid">
                {people.map((p) => (
                  <button
                    key={p.participant_kind + (p.membership_id || p.group_only_participant_id)}
                    type="button"
                    className="kiosk-person-card"
                    disabled={identifying}
                    onClick={() =>
                      handleCardTap({
                        participant_kind: p.participant_kind,
                        membership_id: p.membership_id,
                        group_only_participant_id: p.group_only_participant_id,
                        name: p.name,
                        photo_url: p.photo_url ?? null,
                      })
                    }
                  >
                    <KioskPersonAvatar name={p.name} photoUrl={p.photo_url} />
                    <KioskPersonCardFields
                      name={p.name || t("participantFallback")}
                      code={
                        p.participant_code
                          ? `${participantCodeLabel}: ${p.participant_code}`
                          : ""
                      }
                      email={p.email || ""}
                    />
                  </button>
                ))}
              </div>
              {identifying ? <p className="hint">{t("live.participants.loading")}</p> : null}
              {isStructured ? (
                <button
                  type="button"
                  className="btn-secondary kiosk-submit kiosk-back-to-classes"
                  onClick={backToClasses}
                >
                  {t("live.backToClasses")}
                </button>
              ) : null}
            </>
          ) : null}

          {step === "confirm" ? (
            <ParticipantActionPanel
              selected={selected}
              attendanceState={attendanceState}
              automaticNote={automaticNote}
              allowedActions={allowedActions}
              error={error}
              performing={performing}
              onBack={backToParticipants}
              onChooseAction={performAction}
              showInstruction={!isStructured || !useVisualRenderer}
            />
          ) : null}

          {step === "success" ? successPanel() : null}
        </div>
      ) : null}

      {kioskMode === "input" && !isStructured && !unavailable && step !== "processing" ? (
        <div className="kiosk-body kiosk-body-input">
          {useVisualRenderer && welcomeText && step === "start" ? (
            <p className="kiosk-welcome">{welcomeText}</p>
          ) : null}
          {step === "start" ? (
            <form
              key={formKey}
              className="kiosk-flow kiosk-flow--identify kiosk-identify-form"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              onSubmit={handleInputSubmit}
            >
              <KioskIdentifyGenericVisual />
              <h2>{t("live.identify.title")}</h2>
              {kiosk?.input_fields?.length ? (
                <p className="hint">
                  {t("live.identify.hint")}
                  {usePin ? t("live.identify.pinRequired") : ""}
                </p>
              ) : null}

              {(kiosk.input_fields || []).includes("name") ? (
                <Field label={t("fields.name")}>
                  <input
                    {...kioskAutofillShield({
                      ref: firstFieldRef,
                      name: `kiosk-participant-name-${groupId}`,
                      autoComplete: "off",
                      value: inputValues.name || "",
                      onChange: (event) =>
                        setInputValues((current) => ({ ...current, name: event.target.value })),
                      autoFocus: true,
                    })}
                  />
                </Field>
              ) : null}
              {(kiosk.input_fields || []).includes("email") ? (
                <Field label={t("fields.email")}>
                  <input
                    {...kioskAutofillShield({
                      type: "text",
                      inputMode: "email",
                      name: `kiosk-participant-email-${groupId}`,
                      autoComplete: "off",
                      value: inputValues.email || "",
                      onChange: (event) =>
                        setInputValues((current) => ({ ...current, email: event.target.value })),
                    })}
                  />
                </Field>
              ) : null}
              {(kiosk.input_fields || []).includes("participant_code") ? (
                <Field label={t("fields.groupParticipantCode")}>
                  <input
                    {...kioskAutofillShield({
                      ref: firstFieldRef,
                      name: `kiosk-participant-code-${groupId}`,
                      autoComplete: "off",
                      value: inputValues.participant_code || "",
                      onChange: (event) =>
                        setInputValues((current) => ({
                          ...current,
                          participant_code: event.target.value,
                        })),
                      autoFocus: true,
                    })}
                  />
                </Field>
              ) : null}
              {(kiosk.input_fields || []).includes("pin") ? (
                <Field label={t("fields.pin")}>
                  <KioskPinInput
                    inputRef={pinInputRef}
                    id={`kiosk-participant-pin-${groupId}`}
                    value={inputValues.pin || ""}
                    onChange={(value) => setInputValues((current) => ({ ...current, pin: value }))}
                  />
                </Field>
              ) : null}

              <KioskInlineError error={error} />
              <button
                type="submit"
                className="btn-primary kiosk-submit"
                disabled={
                  (kiosk.input_fields || []).includes("pin") && !(inputValues.pin || "").trim()
                }
              >
                {t("continue")}
              </button>
              {kiosk.warnings?.length ? (
                <div className="kiosk-warnings">
                  {kiosk.warnings.map((warning) => (
                    <p key={warning} className="hint">
                      {warning}
                    </p>
                  ))}
                </div>
              ) : null}
            </form>
          ) : null}

          {step === "confirm" ? (
            <ParticipantActionPanel
              selected={selected}
              attendanceState={attendanceState}
              automaticNote={automaticNote}
              allowedActions={allowedActions}
              error={error}
              performing={performing}
              onBack={backToParticipants}
              onChooseAction={performAction}
            />
          ) : null}

          {step === "success" ? successPanel() : null}
        </div>
      ) : null}
    </>
  );

  if (loading) {
    return (
      <div className={`kiosk-shell ${themeClass}`}>
        <LoadingState label={t("loading")} />
      </div>
    );
  }

  if (useVisualRenderer) {
    return (
      <>
        <KioskRenderer
          design={visualDesign}
          mode="live"
          kioskBehavior={{ mode: kioskMode || "card" }}
          showCardHelper={
            !isStructured &&
            (kioskMode || "card") === "card" &&
            step === "start" &&
            people.length > 0 &&
            !unavailable
          }
          helperText={structuredHelperText}
          showExit={showExit && !unavailable}
          onExit={() => setExitOpen(true)}
        >
          {operationalBody}
        </KioskRenderer>
        {exitDialog}
        {pinDialog}
      </>
    );
  }

  return (
    <div className={`kiosk-shell ${themeClass}`}>
      <header className="kiosk-topbar">
        <div className="kiosk-topbar-copy">
          <div className="kiosk-eyebrow">{t("eyebrow")}</div>
          <h1 className="kiosk-title">{title}</h1>
          {welcomeText && !unavailable ? <p className="kiosk-welcome">{welcomeText}</p> : null}
        </div>
        {showExit && !unavailable ? (
          <button type="button" className="kiosk-exit" onClick={() => setExitOpen(true)}>
            {t("exit")}
          </button>
        ) : null}
      </header>
      {exitDialog}
      {pinDialog}
      {operationalBody}
    </div>
  );
}
