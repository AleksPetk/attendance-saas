import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "./api.js";
import { ErrorBanner, Field, LoadingState, PasswordInput, PhotoThumb } from "./components.jsx";

function actionLabel(action) {
  const map = {
    check_in: "Check in",
    check_out: "Check out",
    break_start: "Start break",
    break_end: "End break",
  };
  return map[action] || action;
}

export default function GroupKioskScreen({ session, groupId, onExit }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kiosk, setKiosk] = useState(null);
  const [primaryAction, setPrimaryAction] = useState(null);
  const [people, setPeople] = useState([]);

  const [step, setStep] = useState("start"); // start | confirm | pin | input | success
  const [selected, setSelected] = useState(null); // { participant_kind, membership_id, group_only_participant_id, display ... }
  const [pin, setPin] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Input mode identification
  const [inputValues, setInputValues] = useState({});
  const [allowedActions, setAllowedActions] = useState([]);
  const [attendanceState, setAttendanceState] = useState(null);
  const [automaticNote, setAutomaticNote] = useState("");

  const [exitOpen, setExitOpen] = useState(false);
  const [exitPassword, setExitPassword] = useState("");
  const [exitError, setExitError] = useState("");
  const [verifyingExit, setVerifyingExit] = useState(false);

  const requiresPin = kiosk?.requires_pin;
  const kioskMode = kiosk?.kiosk_mode;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api.getGroupKioskStart(session, groupId);
      setKiosk(result.data.kiosk || result.data.kiosk || null);
      setPrimaryAction(result.data.primary_action || null);
      setPeople(result.data.people || []);
      setAllowedActions([]);
      setAttendanceState(null);
      setAutomaticNote("");
      setSelected(null);
      setPin("");
      setInputValues({});
      setSuccessMessage("");
      setStep("start");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const title = kiosk?.title || "";
  const welcomeText = kiosk?.welcome_text || "";
  const confirmationMessage = kiosk?.confirmation_message || "";
  const successText = kiosk?.success_message || "";

  const themeClass = useMemo(() => {
    if (!kiosk?.theme) return "kiosk-theme-classic";
    return `kiosk-theme-${kiosk.theme}`;
  }, [kiosk]);

  async function performAction(action) {
    setError("");
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
      if (requiresPin) {
        payload.pin = pin;
      }
      const result = await api.performKioskAction(session, groupId, payload);
      const msg = result.data.success_message || successText || "Done.";
      setSuccessMessage(msg);
      setStep("success");

      const delayMs = (result.data.return_delay_seconds || kiosk?.return_delay_seconds || 5) * 1000;
      window.setTimeout(() => {
        setStep("start");
        setSelected(null);
        setPin("");
        setAllowedActions([]);
        setAttendanceState(null);
        setAutomaticNote("");
        setError("");
        load();
      }, delayMs);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleInputSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      const payload = {};
      for (const field of kiosk.input_fields || []) {
        if (field === "name") payload.name = inputValues.name || "";
        if (field === "email") payload.email = inputValues.email || "";
        if (field === "identifier") payload.identifier = inputValues.identifier || "";
        if (field === "pin") payload.pin = inputValues.pin || "";
      }
      const result = await api.identifyKiosk(session, groupId, payload);
      if (result.data.code !== "ok") {
        setError(result.data.detail || "Could not identify participant.");
        return;
      }
      setSelected({
        participant_kind: result.data.participant.participant_kind,
        membership_id: result.data.participant.membership_id,
        group_only_participant_id: result.data.participant.group_only_participant_id,
      });
      if (kiosk?.requires_pin) {
        setPin(inputValues.pin || "");
      }
      setAllowedActions(result.data.allowed_actions || []);
      setAttendanceState(result.data.attendance_state);
      if (result.data.automatic_check_in?.created) {
        setAutomaticNote(
          `Automatic check-in recorded${result.data.automatic_check_in.performed_at ? "." : "."}`
        );
      } else if (result.data.automatic_check_in?.due) {
        setAutomaticNote("Automatic check-in is configured for this time.");
      } else {
        setAutomaticNote("");
      }
      setStep("confirm");
    } catch (err) {
      // identifyKiosk returns {status, data}; errorMessage extracts detail.
      setError(errorMessage(err) || "Could not identify participant.");
    }
  }

  async function startPinOrConfirm(participant) {
    setSelected(participant);
    if (requiresPin) {
      setStep("pin");
    } else {
      setStep("confirm");
    }
  }

  if (loading) {
    return (
      <div className={`kiosk-shell ${themeClass}`}>
        <LoadingState label="Loading kiosk…" />
      </div>
    );
  }

  return (
    <div className={`kiosk-shell ${themeClass}`}>
      <header className="kiosk-topbar">
        <div className="kiosk-topbar-copy">
          <div className="kiosk-eyebrow">Kiosk</div>
          <h1 className="kiosk-title">{title}</h1>
          {welcomeText ? <p className="kiosk-welcome">{welcomeText}</p> : null}
        </div>
        <button type="button" className="kiosk-exit" onClick={() => setExitOpen(true)}>
          Exit
        </button>
      </header>

      <ErrorBanner message={error} />
      {exitOpen ? (
        <div className="kiosk-modal-backdrop" role="dialog" aria-modal="true">
          <div className="kiosk-modal">
            <h2>Exit kiosk</h2>
            <p className="hint">
              Re-enter your password to return to the workspace.
            </p>
            <Field label="Password">
              <PasswordInput
                value={exitPassword}
                onChange={(e) => setExitPassword(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <div className="form-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={verifyingExit}
                onClick={async () => {
                  setExitError("");
                  setVerifyingExit(true);
                  try {
                    await api.reauth({ password: exitPassword });
                    setExitOpen(false);
                    setExitPassword("");
                    setExitError("");
                    onExit();
                  } finally {
                    setVerifyingExit(false);
                  }
                }}
              >
                Return
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setExitOpen(false);
                  setExitPassword("");
                  setExitError("");
                }}
              >
                Cancel
              </button>
            </div>
            <ErrorBanner message={exitError} />
          </div>
        </div>
      ) : null}

      {kioskMode === "member_list" ? (
        <div className="kiosk-body">
          {people.length === 0 ? (
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
                    onClick={() =>
                      startPinOrConfirm({
                        participant_kind: p.participant_kind,
                        membership_id: p.membership_id,
                        group_only_participant_id: p.group_only_participant_id,
                      })
                    }
                  >
                    {p.photo_url ? (
                      <PhotoThumb url={p.photo_url} name={p.name || ""} size="lg" />
                    ) : (
                      <PhotoThumb url={null} name={p.name || ""} size="lg" />
                    )}
                    <div className="kiosk-person-name">{p.name || "Unknown"}</div>
                    {p.identifier ? <div className="kiosk-person-sub">{p.identifier}</div> : null}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {step === "pin" ? (
            <div className="kiosk-flow">
              <h2>Enter PIN</h2>
              <p className="hint">
                PIN is required to confirm your {primaryAction === "check_in" ? "check-in" : "check-out"}.
              </p>
              <Field label="PIN">
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                />
              </Field>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn-primary kiosk-big-button"
                  disabled={!pin}
                  onClick={() => performAction(primaryAction)}
                >
                  Confirm {primaryAction === "check_in" ? "Check-in" : "Check-out"}
                </button>
              </div>
            </div>
          ) : null}

          {step === "confirm" ? (
            <div className="kiosk-flow">
              <h2>Confirm</h2>
              {automaticNote ? <p className="hint">{automaticNote}</p> : null}
              <p className="hint">{confirmationMessage || "Ready when you are."}</p>
              <div className="kiosk-selected-person">
                <PhotoThumb
                  url={null}
                  name={selected?.participant_kind === "member" ? "Member" : "Participant"}
                  size="md"
                />
                <div>
                  <strong>{selected?.participant_kind === "member" ? "Participant" : "Participant"}</strong>
                  {attendanceState?.is_checked_in ? (
                    <div className="hint">
                      Status: checked in{attendanceState.is_on_break ? ", on break" : ""}
                    </div>
                  ) : null}
                </div>
              </div>

              {kioskMode === "member_list" ? (
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn-primary kiosk-big-button"
                    onClick={() => performAction(primaryAction)}
                  >
                    Confirm {actionLabel(primaryAction)}
                  </button>
                </div>
              ) : null}

              {kioskMode === "input" ? (
                <div className="kiosk-actions">
                  {allowedActions.map((a) => (
                    <button
                      key={a}
                      type="button"
                      className={`btn-primary kiosk-action-button`}
                      onClick={() => performAction(a)}
                    >
                      {actionLabel(a)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {step === "success" ? (
            <div className="kiosk-flow kiosk-success">
              <div className="kiosk-success-icon" aria-hidden="true">✓</div>
              <h2>Success</h2>
              <p className="kiosk-success-message">{successMessage}</p>
              <p className="hint">Returning in a moment…</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {kioskMode === "input" ? (
        <div className="kiosk-body">
          {step === "start" ? (
            <form className="kiosk-flow" onSubmit={handleInputSubmit}>
              <h2>Check in</h2>
              {kiosk?.input_fields?.length ? (
                <p className="hint">
                  Enter your details.
                  {kiosk?.requires_pin ? " PIN verification will be required." : ""}
                </p>
              ) : null}

              {(kiosk.input_fields || []).includes("name") ? (
                <Field label="Name">
                  <input
                    value={inputValues.name || ""}
                    onChange={(e) => setInputValues((c) => ({ ...c, name: e.target.value }))}
                    autoFocus
                  />
                </Field>
              ) : null}
              {(kiosk.input_fields || []).includes("email") ? (
                <Field label="Email">
                  <input
                    type="email"
                    value={inputValues.email || ""}
                    onChange={(e) => setInputValues((c) => ({ ...c, email: e.target.value }))}
                  />
                </Field>
              ) : null}
              {(kiosk.input_fields || []).includes("identifier") ? (
                <Field label="Member / identifier">
                  <input
                    value={inputValues.identifier || ""}
                    onChange={(e) => setInputValues((c) => ({ ...c, identifier: e.target.value }))}
                  />
                </Field>
              ) : null}
              {(kiosk.input_fields || []).includes("pin") ? (
                <Field label="PIN">
                  <input
                    type="password"
                    value={inputValues.pin || ""}
                    onChange={(e) => setInputValues((c) => ({ ...c, pin: e.target.value }))}
                    placeholder="••••"
                  />
                </Field>
              ) : null}

              <button type="submit" className="btn-primary kiosk-big-button" disabled={requiresPin ? !(inputValues.pin || "").trim() : false}>
                Continue
              </button>
              {kiosk.warnings?.length ? (
                <div className="missing-box" style={{ marginTop: "1rem" }}>
                  {kiosk.warnings.map((w, idx) => (
                    <p key={idx} className="hint" style={{ margin: 0 }}>
                      {w}
                    </p>
                  ))}
                </div>
              ) : null}
            </form>
          ) : null}

          {step === "confirm" ? (
            <div className="kiosk-flow">
              <h2>Choose action</h2>
              {automaticNote ? <p className="hint">{automaticNote}</p> : null}
              {allowedActions.length === 0 ? <p className="hint">No actions available.</p> : null}
              <div className="kiosk-actions">
                {allowedActions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="btn-primary kiosk-action-button"
                    onClick={() =>
                      performAction(a)
                    }
                  >
                    {actionLabel(a)}
                  </button>
                ))}
              </div>
              <ErrorBanner message={error} />
            </div>
          ) : null}

          {step === "success" ? (
            <div className="kiosk-flow kiosk-success">
              <div className="kiosk-success-icon" aria-hidden="true">✓</div>
              <h2>Success</h2>
              <p className="kiosk-success-message">{successMessage}</p>
              <p className="hint">Returning in a moment…</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

