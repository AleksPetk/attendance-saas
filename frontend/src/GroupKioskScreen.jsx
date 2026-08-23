import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "./api.js";
import { Field, LoadingState, PasswordInput, PhotoThumb } from "./components.jsx";
import KioskRenderer from "./kiosk/KioskRenderer.jsx";
import KioskConfirmationScreen from "./kiosk/KioskConfirmationScreen.jsx";
import { confirmationAccentStyleFromDesign } from "./kiosk/kioskConfirmationAccent.js";
import {
  KioskInlineError,
  KioskPinInput,
  actionLabel,
  kioskAutofillShield,
  kioskErrorCopy,
} from "./kiosk/kioskUi.jsx";

function PinDialog({ pin, onPinChange, error, verifying, onCancel, onConfirm }) {
  return (
    <div className="kiosk-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="kiosk-pin-title">
      <form
        className="kiosk-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <h2 id="kiosk-pin-title">Enter PIN</h2>
        <p className="hint">Enter your Group participation PIN to continue.</p>
        <Field label="PIN">
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
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={verifying || !pin}>
            {verifying ? "Verifying…" : "Continue"}
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
}) {
  return (
    <div className="kiosk-flow">
      <h2>Choose action</h2>
      {automaticNote ? <p className="hint">{automaticNote}</p> : null}
      {selected?.name ? (
        <div className="kiosk-selected-person">
          <PhotoThumb url={null} name={selected.name} size="md" />
          <div>
            <strong>{selected.name}</strong>
            {attendanceState?.is_checked_in ? (
              <div className="hint">
                Status: checked in{attendanceState.is_on_break ? ", on break" : ""}
              </div>
            ) : (
              <div className="hint">Status: not checked in</div>
            )}
          </div>
        </div>
      ) : null}
      <KioskInlineError error={error} />
      {allowedActions.length === 0 ? <p className="hint">No actions available right now.</p> : null}
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
        Back to participants
      </button>
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
  return (
    <div className="kiosk-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="kiosk-exit-title">
      <form
        className="kiosk-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <h2 id="kiosk-exit-title">Exit kiosk</h2>
        <p className="hint">Enter this Group&apos;s kiosk exit code to unlock this browser session.</p>
        <Field label="Exit code" error={error}>
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
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={verifying || !exitCode}>
            {verifying ? "Verifying…" : "Exit kiosk"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function GroupKioskScreen({ session, groupId, onUnlocked, onKioskEntered }) {
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState(null);
  const [kiosk, setKiosk] = useState(null);
  const [visualDesign, setVisualDesign] = useState(null);
  const [people, setPeople] = useState([]);
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

  const pinInputRef = useRef(null);
  const firstFieldRef = useRef(null);
  const returnTimerRef = useRef(null);

  const usePin = Boolean(kiosk?.use_pin);
  const kioskMode = kiosk?.kiosk_mode;
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
      setKiosk(result.data.kiosk || null);
      setVisualDesign(result.data.visual_design || null);
      setPeople(result.data.people || []);
      setUnavailable(false);
      clearParticipantFields();
      setConfirmation(null);
      setStep("start");
    } catch (err) {
      const locked = Boolean(err?.data?.kiosk_locked) || kioskLocked;
      if (err?.status === 404 || (locked && err?.status === 403)) {
        setUnavailable(true);
        setKiosk(null);
        setVisualDesign(null);
      } else {
        setError(kioskErrorCopy(err) || { title: "Could not load this kiosk." });
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

  const title = kiosk?.title || (unavailable ? "Kiosk unavailable" : "Kiosk");
  const welcomeText = kiosk?.welcome_text || "";

  const confirmationAccentStyle = useMemo(
    () => confirmationAccentStyleFromDesign(visualDesign?.config),
    [visualDesign],
  );

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
      setExitError(errorMessage(err) || "Exit code verification failed.");
    } finally {
      setVerifyingExit(false);
    }
  }

  function scheduleReturnToStart(delaySeconds) {
    if (returnTimerRef.current) {
      window.clearTimeout(returnTimerRef.current);
    }
    returnTimerRef.current = window.setTimeout(() => {
      setStep("start");
      setConfirmation(null);
      setError(null);
      clearParticipantFields();
      if (kioskMode === "card") {
        load();
      }
    }, Math.max(1, delaySeconds || 3) * 1000);
  }

  function successPanel() {
    if (!confirmation) return null;
    return (
      <KioskConfirmationScreen
        template={confirmation.template}
        message={confirmation.message}
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
        setError(kioskErrorCopy({ data: result.data }) || { title: "Could not identify participant." });
        return false;
      }
      await applyIdentifyResult(result);
      return true;
    } catch (err) {
      setError(kioskErrorCopy(err) || { title: "Could not identify participant." });
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
    setStep("start");
    setError(null);
    clearParticipantFields();
  }

  async function performAction(action) {
    if (!selected) return;
    setPerforming(true);
    setError(null);
    try {
      const payload = {
        participant_kind: selected.participant_kind,
        action,
      };
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
        action,
      };
      setConfirmation(conf);
      setStep("success");
      setError(null);
      setInputValues({});
      setPin("");
      setFormKey((value) => value + 1);
      scheduleReturnToStart(conf.return_delay_seconds);
    } catch (err) {
      const copy = kioskErrorCopy(err);
      setError(copy);
      if (err?.data?.code === "invalid_pin" || usePin) {
        setPin("");
        setInputValues((current) => ({ ...current, pin: "" }));
        window.setTimeout(() => pinInputRef.current?.focus(), 0);
      }
    } finally {
      setPerforming(false);
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
        setError(kioskErrorCopy({ data: result.data }) || { title: "Could not identify participant." });
        setInputValues((current) => ({ ...current, pin: "" }));
        return;
      }
      await applyIdentifyResult(result);
      setInputValues((current) => ({ ...current, pin: "" }));
    } catch (err) {
      setError(kioskErrorCopy(err) || { title: "Could not identify participant." });
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
            <h2>This kiosk is no longer available</h2>
            <p className="hint">
              The Group may have been archived or the kiosk turned off. Enter the kiosk
              exit code to unlock this browser session.
            </p>
            <form
              className="kiosk-recovery-form"
              onSubmit={(event) => {
                event.preventDefault();
                setExitOpen(false);
                verifyExit();
              }}
            >
              <Field label="Exit code" error={exitError}>
                <PasswordInput
                  value={exitCode}
                  onChange={(event) => setExitCode(event.target.value)}
                  autoComplete="off"
                  name="kiosk-exit-code-recovery"
                />
              </Field>
              <button type="submit" className="btn-primary kiosk-submit" disabled={verifyingExit || !exitCode}>
                {verifyingExit ? "Verifying…" : "Unlock session"}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {kioskMode === "card" && !unavailable ? (
        <div className="kiosk-body">
          {useVisualRenderer && welcomeText && step === "start" ? (
            <p className="kiosk-welcome">{welcomeText}</p>
          ) : null}
          {people.length === 0 && step === "start" ? (
            <div className="empty-state">
              <h2>No participants available</h2>
              <p>Add Members or Group-only Participants to this Group.</p>
            </div>
          ) : null}

          {people.length > 0 && step === "start" ? (
            <>
              <p className="hint kiosk-hint">Tap your card to continue.</p>
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
                      })
                    }
                  >
                    <div className="kiosk-person-name">{p.name || "Participant"}</div>
                    {p.participant_code ? (
                      <div className="kiosk-person-sub">{p.participant_code}</div>
                    ) : null}
                    {p.email ? <div className="kiosk-person-sub">{p.email}</div> : null}
                  </button>
                ))}
              </div>
              {identifying ? <p className="hint">Loading…</p> : null}
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
            />
          ) : null}

          {step === "success" ? successPanel() : null}
        </div>
      ) : null}

      {kioskMode === "input" && !unavailable ? (
        <div className="kiosk-body kiosk-body-input">
          {useVisualRenderer && welcomeText && step === "start" ? (
            <p className="kiosk-welcome">{welcomeText}</p>
          ) : null}
          {step === "start" ? (
            <form
              key={formKey}
              className="kiosk-flow kiosk-identify-form"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              onSubmit={handleInputSubmit}
            >
              <h2>Check in</h2>
              {kiosk?.input_fields?.length ? (
                <p className="hint">
                  Enter your details.
                  {usePin ? " PIN verification will be required." : ""}
                </p>
              ) : null}

              {(kiosk.input_fields || []).includes("name") ? (
                <Field label="Name">
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
                <Field label="Email">
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
                <Field label="Group Participant Code">
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
                <Field label="PIN">
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
                Continue
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
        <LoadingState label="Loading kiosk…" />
      </div>
    );
  }

  if (useVisualRenderer) {
    return (
      <>
        <KioskRenderer
          design={visualDesign}
          mode="live"
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
          <div className="kiosk-eyebrow">Kiosk</div>
          <h1 className="kiosk-title">{title}</h1>
          {welcomeText && !unavailable ? <p className="kiosk-welcome">{welcomeText}</p> : null}
        </div>
        {showExit && !unavailable ? (
          <button type="button" className="kiosk-exit" onClick={() => setExitOpen(true)}>
            Exit
          </button>
        ) : null}
      </header>
      {exitDialog}
      {pinDialog}
      {operationalBody}
    </div>
  );
}
