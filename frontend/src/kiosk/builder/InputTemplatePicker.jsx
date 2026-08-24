import { INPUT_TEMPLATE_IDS, INPUT_TEMPLATES } from "../inputTemplates.js";

/**
 * Compact 2-column Input template picker with miniature previews.
 */
export default function InputTemplatePicker({ value, onChange }) {
  const selected = INPUT_TEMPLATES[value] ? value : "clean";

  return (
    <fieldset className="kb-fieldset kb-input-templates">
      <legend>Input template</legend>
      <div className="kb-template-grid" role="list">
        {INPUT_TEMPLATE_IDS.map((id) => {
          const meta = INPUT_TEMPLATES[id];
          const active = id === selected;
          return (
            <button
              key={id}
              type="button"
              role="listitem"
              className={`kb-template-card ${active ? "active" : ""}`}
              aria-pressed={active}
              onClick={() => onChange(id)}
            >
              <span
                className={`kb-template-mini kb-template-mini--${id}`}
                aria-hidden="true"
              >
                <span className="kb-template-mini-deco" />
                <span className="kb-template-mini-field" />
                <span className="kb-template-mini-btn" />
              </span>
              <strong>{meta.label}</strong>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
