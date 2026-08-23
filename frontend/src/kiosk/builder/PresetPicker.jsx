export default function PresetPicker({ label, value, options, onChange }) {
  return (
    <fieldset className="kb-fieldset">
      <legend>{label}</legend>
      <div className="kb-preset-grid">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`kb-preset-card ${value === option.id ? "active" : ""}`}
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            <span className={`kb-preset-preview ${option.previewClass}`} aria-hidden="true">
              {option.preview}
            </span>
            <strong>{option.label}</strong>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export const LAYOUT_OPTIONS = [
  { id: "centered", label: "Centered", previewClass: "layout-centered", preview: "●" },
  { id: "compact", label: "Compact", previewClass: "layout-compact", preview: "≡" },
  { id: "split", label: "Split", previewClass: "layout-split", preview: "⊟" },
  { id: "large_touch", label: "Large touch", previewClass: "layout-large", preview: "▢" },
  { id: "photo_cards", label: "Photo cards", previewClass: "layout-cards", preview: "▦" },
];

export const BUTTON_OPTIONS = [
  { id: "rounded", label: "Rounded", previewClass: "btn-rounded", preview: "Button" },
  { id: "flat", label: "Flat", previewClass: "btn-flat", preview: "Button" },
  { id: "pill", label: "Pill", previewClass: "btn-pill", preview: "Button" },
];

export const INPUT_OPTIONS = [
  { id: "outlined", label: "Outlined", previewClass: "in-outlined", preview: "Name" },
  { id: "filled", label: "Filled", previewClass: "in-filled", preview: "Name" },
  { id: "minimal", label: "Minimal", previewClass: "in-minimal", preview: "Name" },
];

export const CARD_OPTIONS = [
  { id: "elevated", label: "Elevated", previewClass: "card-elevated", preview: "Ada" },
  { id: "flat", label: "Flat", previewClass: "card-flat", preview: "Ada" },
  { id: "bordered", label: "Bordered", previewClass: "card-bordered", preview: "Ada" },
];
