/**
 * Compact Card template picker — mirrors Input Templates UX.
 */
import { CARD_TEMPLATE_IDS, CARD_TEMPLATES } from "../cardTemplates.js";

function CardTemplateMini({ id }) {
  return (
    <span className={`kb-card-template-mini kb-card-template-mini--${id}`} aria-hidden="true">
      <span className="kb-card-mini-deco" />
      <span className="kb-card-mini-avatar" />
      <span className="kb-card-mini-body">
        <span className="kb-card-mini-line kb-card-mini-line-strong" />
        <span className="kb-card-mini-line" />
      </span>
    </span>
  );
}

export default function CardTemplatePicker({ value, onChange }) {
  const selected = CARD_TEMPLATES[value] ? value : "clean";

  return (
    <fieldset className="kb-fieldset kb-card-templates">
      <legend>Card template</legend>
      <div className="kb-template-grid" role="list">
        {CARD_TEMPLATE_IDS.map((id) => {
          const meta = CARD_TEMPLATES[id];
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
              <CardTemplateMini id={id} />
              <strong>{meta.label}</strong>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
