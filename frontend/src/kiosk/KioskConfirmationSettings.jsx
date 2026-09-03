import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Toggle } from "../components.jsx";
import {
  CONFIRMATION_RETURN_OPTIONS,
  confirmationMessageFieldLabel,
  visibleConfirmationMessageFields,
} from "./kioskConfirmation.js";

function messagesSummary(t, form, visibleFields) {
  if (visibleFields.length === 0) {
    return t("confirmation.messages.noActions");
  }
  const hasCustom = visibleFields.some((item) => String(form[item.field] || "").trim());
  return hasCustom ? t("confirmation.messages.configured") : t("confirmation.messages.defaults");
}

function ConfirmationAccordionSection({
  id,
  title,
  summary,
  isOpen,
  onToggle,
  tutorialTarget,
  children,
}) {
  const panelId = `kc-section-${id}`;

  return (
    <div
      className={`kc-accordion-section ${isOpen ? "is-open" : ""}`}
      data-tutorial-target={tutorialTarget}
    >
      <button
        type="button"
        className="kc-accordion-trigger"
        aria-expanded={isOpen}
        aria-controls={panelId}
        id={`${panelId}-trigger`}
        onClick={onToggle}
      >
        <span className="kc-accordion-trigger-main">
          <span className="kc-accordion-title">{title}</span>
          <span className="kc-accordion-summary">{summary}</span>
        </span>
        <span className="kc-accordion-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {isOpen ? (
        <div
          id={panelId}
          className="kc-accordion-panel"
          role="region"
          aria-labelledby={`${panelId}-trigger`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Confirmation Screen settings: Messages, Return time, and confirmation effects.
 * Visual template is controlled by the selected Card/Input template in the Kiosk Editor.
 */
export default function KioskConfirmationSettings({
  form,
  groupActions,
  defaults,
  onPatch,
}) {
  const { t } = useTranslation("kiosk");
  const [openSection, setOpenSection] = useState(null);
  const visibleFields = visibleConfirmationMessageFields(groupActions);
  const returnSeconds = Number(form.confirmation_return_seconds) || 3;

  function toggleSection(sectionId) {
    setOpenSection((current) => (current === sectionId ? null : sectionId));
  }

  const effectsSummary = `${form.confirmation_sound_enabled !== false ? t("confirmation.effects.soundOn") : t("confirmation.effects.soundOff")} · ${
    form.confirmation_vibration_enabled ? t("confirmation.effects.vibrationOn") : t("confirmation.effects.vibrationOff")
  }`;

  return (
    <div className="kc-accordion">
      <ConfirmationAccordionSection
        id="messages"
        title={t("confirmation.messages.title")}
        summary={messagesSummary(t, form, visibleFields)}
        isOpen={openSection === "messages"}
        onToggle={() => toggleSection("messages")}
        tutorialTarget="kiosk-confirmation-messages"
      >
        <div className="kc-var-helper">
          <span className="kc-var-helper-title">{t("confirmation.messages.variablesTitle")}</span>
          <div className="kc-var-chips" aria-label={t("confirmation.messages.variablesAria")}>
            <code className="kc-var-chip">{"{name}"}</code>
            <code className="kc-var-chip">{"{time}"}</code>
            <code className="kc-var-chip">{"{group}"}</code>
          </div>
          <p className="hint kc-var-helper-note">{t("confirmation.messages.timeFormatNote")}</p>
        </div>

        {visibleFields.length === 0 ? (
          <p className="hint">{t("confirmation.messages.enableActionsHint")}</p>
        ) : (
          <div className="kc-message-fields">
            {visibleFields.map((item) => (
              <div key={item.field} className="kc-message-field-block">
                <label className="kc-message-field-label" htmlFor={`kc-msg-${item.field}`}>
                  {confirmationMessageFieldLabel(item.action)}
                </label>
                <textarea
                  id={`kc-msg-${item.field}`}
                  className="kiosk-message-textarea"
                  rows={2}
                  value={form[item.field] || ""}
                  placeholder={defaults?.[item.action] || ""}
                  onChange={(event) => onPatch({ [item.field]: event.target.value })}
                  aria-label={item.label}
                />
              </div>
            ))}
          </div>
        )}
      </ConfirmationAccordionSection>

      <ConfirmationAccordionSection
        id="return"
        title={t("confirmation.return.title")}
        summary={t("confirmation.return.seconds", { count: returnSeconds })}
        isOpen={openSection === "return"}
        onToggle={() => toggleSection("return")}
        tutorialTarget="kiosk-confirmation-return"
      >
        <p className="hint kiosk-settings-helper kc-return-helper">
          {t("confirmation.return.helper")}
        </p>
        <div className="kc-return-picker" role="radiogroup" aria-label={t("confirmation.return.ariaLabel")}>
          {CONFIRMATION_RETURN_OPTIONS.map((seconds) => (
            <label
              key={seconds}
              className={`kiosk-segment-option ${
                returnSeconds === seconds ? "active" : ""
              }`}
            >
              <input
                type="radio"
                name="confirmation-return-seconds"
                checked={returnSeconds === seconds}
                onChange={() => onPatch({ confirmation_return_seconds: seconds })}
              />
              {t("confirmation.return.seconds", { count: seconds })}
            </label>
          ))}
        </div>
      </ConfirmationAccordionSection>

      <ConfirmationAccordionSection
        id="effects"
        title={t("confirmation.effects.title")}
        summary={effectsSummary}
        isOpen={openSection === "effects"}
        onToggle={() => toggleSection("effects")}
        tutorialTarget="kiosk-confirmation-effects"
      >
        <p className="hint kiosk-settings-helper">
          {t("confirmation.effects.helper")}
        </p>
        <div className="kiosk-settings-toggle-stack">
          <Toggle
            label={t("confirmation.effects.sound")}
            hint={t("confirmation.effects.soundHint")}
            checked={form.confirmation_sound_enabled !== false}
            onChange={(checked) => onPatch({ confirmation_sound_enabled: checked })}
          />
          <Toggle
            label={t("confirmation.effects.vibration")}
            hint={t("confirmation.effects.vibrationHint")}
            checked={Boolean(form.confirmation_vibration_enabled)}
            onChange={(checked) => onPatch({ confirmation_vibration_enabled: checked })}
          />
        </div>
        <p className="hint kiosk-settings-helper">
          {t("confirmation.effects.browserNote")}
        </p>
      </ConfirmationAccordionSection>
    </div>
  );
}
