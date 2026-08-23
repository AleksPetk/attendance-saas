import { useMemo, useState } from "react";
import {
  CONFIRMATION_RETURN_OPTIONS,
  CONFIRMATION_TEMPLATES,
  messageTemplateForPreview,
  PREVIEW_CONTEXT,
  renderConfirmationMessage,
  visibleConfirmationMessageFields,
} from "./kioskConfirmation.js";
import { confirmationAccentStyleFromDesign } from "./kioskConfirmationAccent.js";
import { KioskConfirmationPreview } from "./KioskConfirmationScreen.jsx";

const TEMPLATE_LABELS = Object.fromEntries(
  CONFIRMATION_TEMPLATES.map((preset) => [preset.id, preset.label]),
);

function messagesSummary(form, visibleFields) {
  if (visibleFields.length === 0) {
    return "No actions";
  }
  const hasCustom = visibleFields.some((item) => String(form[item.field] || "").trim());
  return hasCustom ? "Configured" : "Defaults";
}

function ConfirmationAccordionSection({
  id,
  title,
  summary,
  isOpen,
  onToggle,
  children,
}) {
  const panelId = `kc-section-${id}`;

  return (
    <div className={`kc-accordion-section ${isOpen ? "is-open" : ""}`}>
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

export default function KioskConfirmationSettings({
  form,
  groupActions,
  defaults,
  groupName,
  kioskDesignConfig,
  onPatch,
}) {
  const [openSection, setOpenSection] = useState(null);
  const visibleFields = visibleConfirmationMessageFields(groupActions);
  const previewTemplate = form.confirmation_template || "clean";
  const previewContext = { ...PREVIEW_CONTEXT, group: groupName || PREVIEW_CONTEXT.group };
  const previewMessage = renderConfirmationMessage(
    messageTemplateForPreview(form, "check_in", defaults),
    previewContext,
  );
  const accentStyle = useMemo(
    () => confirmationAccentStyleFromDesign(kioskDesignConfig),
    [kioskDesignConfig],
  );

  const templateLabel = TEMPLATE_LABELS[previewTemplate] || "Clean";
  const returnSeconds = Number(form.confirmation_return_seconds) || 3;

  function toggleSection(sectionId) {
    setOpenSection((current) => (current === sectionId ? null : sectionId));
  }

  return (
    <div className="kc-accordion">
      <ConfirmationAccordionSection
        id="template"
        title="Template"
        summary={templateLabel}
        isOpen={openSection === "template"}
        onToggle={() => toggleSection("template")}
      >
        <div className="kc-template-expanded">
          <div className="kc-template-picker" role="radiogroup" aria-label="Confirmation template">
            {CONFIRMATION_TEMPLATES.map((preset) => (
              <label
                key={preset.id}
                className={`kc-template-option ${form.confirmation_template === preset.id ? "active" : ""}`}
              >
                <input
                  type="radio"
                  name="confirmation-template"
                  value={preset.id}
                  checked={form.confirmation_template === preset.id}
                  onChange={() => onPatch({ confirmation_template: preset.id })}
                />
                <div className="kc-template-mini">
                  <KioskConfirmationPreview
                    template={preset.id}
                    message="Thanks, Aleks."
                    accentStyle={accentStyle}
                    compact
                  />
                </div>
                <span className="kc-template-option-label">{preset.label}</span>
              </label>
            ))}
          </div>
          <div className="kc-template-live-preview">
            <p className="kc-preview-label">Preview</p>
            <KioskConfirmationPreview
              template={previewTemplate}
              message={previewMessage}
              accentStyle={accentStyle}
              compact
            />
          </div>
        </div>
      </ConfirmationAccordionSection>

      <ConfirmationAccordionSection
        id="messages"
        title="Messages"
        summary={messagesSummary(form, visibleFields)}
        isOpen={openSection === "messages"}
        onToggle={() => toggleSection("messages")}
      >
        <div className="kc-var-helper">
          <span className="kc-var-helper-title">Available variables:</span>
          <div className="kc-var-chips" aria-label="Supported message variables">
            <code className="kc-var-chip">{"{name}"}</code>
            <code className="kc-var-chip">{"{time}"}</code>
            <code className="kc-var-chip">{"{group}"}</code>
          </div>
          <p className="hint kc-var-helper-note">Time uses 24-hour format.</p>
        </div>

        {visibleFields.length === 0 ? (
          <p className="hint">Enable actions in Group configuration to customize messages.</p>
        ) : (
          <div className="kc-message-fields">
            {visibleFields.map((item) => (
              <div key={item.field} className="kc-message-field-block">
                <label className="kc-message-field-label" htmlFor={`kc-msg-${item.field}`}>
                  {item.label.replace(" message", "")}
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
        title="Return time"
        summary={`${returnSeconds} sec`}
        isOpen={openSection === "return"}
        onToggle={() => toggleSection("return")}
      >
        <p className="hint kiosk-settings-helper kc-return-helper">
          How long the confirmation stays visible after success.
        </p>
        <div className="kc-return-picker" role="radiogroup" aria-label="Return delay">
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
              {seconds} sec
            </label>
          ))}
        </div>
      </ConfirmationAccordionSection>
    </div>
  );
}
