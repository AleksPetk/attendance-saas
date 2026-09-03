/**
 * Fake/demo Main content for the Kiosk Design Editor.
 * Driven by Kiosk Settings (mode + display/input fields).
 * Card density uses builder-only fake participants — never real tenant data.
 */

import { useTranslation } from "react-i18next";
import { KioskPersonAvatar, KioskPersonCardFields } from "../kioskUi.jsx";
import { KioskIdentifyGenericVisual } from "../kioskIdentifyGenericVisual.jsx";
import { createFakeParticipants } from "./fakeParticipants.js";

const FIELD_LABEL_KEYS = {
  participant_code: "fields.groupParticipantCode",
  name: "fields.name",
  email: "fields.email",
  pin: "fields.pin",
};

const FIELD_SAMPLES = {
  participant_code: "G12-1042",
  name: "Jordan Lee",
  email: "jordan@example.com",
  pin: "••••",
};

function cardDisplay(settings) {
  return {
    show_name: settings?.card_display?.show_name !== false,
    show_participant_code: settings?.card_display?.show_participant_code !== false,
    show_email: Boolean(settings?.card_display?.show_email),
  };
}

function inputFields(settings) {
  if (Array.isArray(settings?.input_fields) && settings.input_fields.length) {
    return settings.input_fields;
  }
  if (settings?.input_field_count === 2 && settings?.input_second_field) {
    return ["participant_code", settings.input_second_field];
  }
  return ["participant_code"];
}

export default function EditorSampleContent({ kioskBehavior, fakeParticipantCount = 12 }) {
  const { t } = useTranslation("kiosk");
  const mode = kioskBehavior?.mode || "card";

  function fieldLabel(field) {
    const key = FIELD_LABEL_KEYS[field];
    return key ? t(key) : field;
  }

  if (mode === "card") {
    const display = cardDisplay(kioskBehavior);
    const people = createFakeParticipants(fakeParticipantCount);
    return (
      <div className="kb-sample" aria-hidden="true">
        <div className="kiosk-people-grid">
          {people.map((person) => (
            <article key={person.id} className="kiosk-person-card">
              <KioskPersonAvatar name={person.name} />
              <KioskPersonCardFields
                name={display.show_name ? person.name : ""}
                code={display.show_participant_code ? person.participant_code : ""}
                email={display.show_email ? person.email : ""}
              />
            </article>
          ))}
        </div>
      </div>
    );
  }

  const fields = inputFields(kioskBehavior);
  return (
    <div className="kb-sample" aria-hidden="true">
      <form
        className="kiosk-flow kiosk-flow--identify"
        onSubmit={(event) => event.preventDefault()}
      >
        <KioskIdentifyGenericVisual />
        <h2>{t("live.identify.title")}</h2>
        <p className="hint">{t("live.identify.hint")}</p>
        {fields.map((field) => (
          <label key={field}>
            {fieldLabel(field)}
            <input
              className={field === "pin" ? "kiosk-pin-input" : undefined}
              type="text"
              readOnly
              tabIndex={-1}
              value={FIELD_SAMPLES[field] || ""}
            />
          </label>
        ))}
        <button type="button" className="kiosk-submit" tabIndex={-1}>
          {t("continue")}
        </button>
      </form>
    </div>
  );
}
