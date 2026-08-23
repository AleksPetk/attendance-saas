import { errorMessage } from "../api.js";

export function actionLabel(action) {
  const map = {
    check_in: "Check in",
    check_out: "Check out",
    break_start: "Start break",
    break_end: "End break",
  };
  return map[action] || action;
}

export function kioskErrorCopy(error) {
  const code = error?.data?.code;
  const pinErrors = error?.data?.pin;
  if (code === "invalid_pin" || pinErrors) {
    return { title: "PIN doesn't match. Try again." };
  }
  if (code === "not_found") {
    return {
      title: "We couldn't find a matching participant.",
      hint: "Check the details and try again.",
    };
  }
  if (code === "ambiguous") {
    return {
      title: "More than one participant matches. Please check the details.",
    };
  }
  const detail = errorMessage(error);
  if (!detail) return null;
  return { title: detail };
}

export function KioskInlineError({ error }) {
  if (!error) return null;
  return (
    <div className="kiosk-inline-error" role="alert">
      <strong>{error.title}</strong>
      {error.hint ? <p>{error.hint}</p> : null}
    </div>
  );
}

export function kioskAutofillShield(props) {
  return {
    autoCapitalize: "off",
    autoCorrect: "off",
    spellCheck: false,
    "data-lpignore": "true",
    "data-1p-ignore": "true",
    "data-bwignore": "true",
    "data-form-type": "other",
    ...props,
  };
}

export function KioskPinInput({ inputRef, id, value, onChange }) {
  return (
    <input
      ref={inputRef}
      id={id}
      className="kiosk-pin-input"
      type="text"
      inputMode="text"
      autoComplete="one-time-code"
      name={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="••••"
      aria-label="Identification PIN"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      data-lpignore="true"
      data-1p-ignore="true"
      data-bwignore="true"
      data-form-type="other"
    />
  );
}
