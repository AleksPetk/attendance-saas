/**
 * Fake/demo Main content for the Kiosk Design Editor.
 * Driven by Kiosk Settings (mode + display/input fields).
 * Card density uses builder-only fake participants — never real tenant data.
 */

import { createFakeParticipants } from "./fakeParticipants.js";

const FIELD_LABELS = {
  participant_code: "Group Participant Code",
  name: "Name",
  email: "Email",
  pin: "PIN",
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
  const mode = kioskBehavior?.mode || "card";

  if (mode === "card") {
    const display = cardDisplay(kioskBehavior);
    const people = createFakeParticipants(fakeParticipantCount);
    return (
      <div className="kb-sample" aria-hidden="true">
        <p className="hint kiosk-hint">Tap your card to continue.</p>
        <div className="kiosk-people-grid">
          {people.map((person) => (
            <article key={person.id} className="kiosk-person-card">
              {display.show_name ? (
                <div className="kiosk-person-name">{person.name}</div>
              ) : null}
              {display.show_participant_code ? (
                <div className="kiosk-person-sub">{person.participant_code}</div>
              ) : null}
              {display.show_email ? (
                <div className="kiosk-person-sub">{person.email}</div>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    );
  }

  const fields = inputFields(kioskBehavior);
  return (
    <div className="kb-sample" aria-hidden="true">
      <form className="kiosk-flow" onSubmit={(event) => event.preventDefault()}>
        <h2>Check in</h2>
        <p className="hint">Enter your details.</p>
        {fields.map((field) => (
          <label key={field}>
            {FIELD_LABELS[field] || field}
            <input
              className={field === "pin" ? "kiosk-pin-input" : undefined}
              type="text"
              defaultValue={FIELD_SAMPLES[field] || ""}
              readOnly
              tabIndex={-1}
            />
          </label>
        ))}
        <button type="button" className="kiosk-submit" tabIndex={-1}>
          Continue
        </button>
      </form>
    </div>
  );
}
