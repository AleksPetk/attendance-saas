import { errorMessage } from "../api.js";
import i18n from "../i18n/index.js";
import { useTranslation } from "react-i18next";

export {
  KioskPersonAvatar,
  kioskAvatarToneStep,
  kioskPersonInitials,
  PHOTO_CAPABLE_CARD_TEMPLATE_IDS,
} from "./kioskParticipantAvatar.jsx";

const ACTION_LABEL_KEYS = {
  check_in: "actions.checkIn",
  check_out: "actions.checkOut",
  break_start: "actions.breakStart",
  break_end: "actions.breakEnd",
};

export function actionLabel(action) {
  const key = ACTION_LABEL_KEYS[action];
  return key ? i18n.t(`kiosk:${key}`) : action;
}

export function kioskErrorCopy(error) {
  const code = error?.data?.code;
  const pinErrors = error?.data?.pin;
  if (code === "invalid_pin" || pinErrors) {
    return { title: i18n.t("kiosk:errors.invalidPin") };
  }
  if (code === "not_found") {
    return {
      title: i18n.t("kiosk:errors.notFoundTitle"),
      hint: i18n.t("kiosk:errors.notFoundHint"),
    };
  }
  if (code === "ambiguous") {
    return {
      title: i18n.t("kiosk:errors.ambiguous"),
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
  const { t } = useTranslation("kiosk");
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
      aria-label={t("fields.identificationPinAria")}
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

/**
 * Contained text stack for kiosk cards (name / code / email / meta).
 * Truncation is CSS-owned; title preserves full values when clipped.
 */
export function KioskPersonCardFields({ name, code, email, meta }) {
  const nameText = name || "";
  return (
    <div className="kiosk-person-content">
      {nameText ? (
        <div className="kiosk-person-name" title={nameText}>
          {nameText}
        </div>
      ) : null}
      {code ? (
        <div className="kiosk-person-sub kiosk-person-code" title={code}>
          {code}
        </div>
      ) : null}
      {email ? (
        <div className="kiosk-person-sub kiosk-person-email" title={email}>
          {email}
        </div>
      ) : null}
      {meta ? (
        <div className="kiosk-person-sub kiosk-person-meta" title={meta}>
          {meta}
        </div>
      ) : null}
    </div>
  );
}

