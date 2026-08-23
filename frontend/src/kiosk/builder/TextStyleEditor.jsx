import { KIOSK_FONTS, kioskFontPickerIds, kioskFontPickerValue } from "../kioskFonts.js";
import ColorField from "./ColorField.jsx";

const FONT_IDS = kioskFontPickerIds();

export default function TextStyleEditor({
  label,
  text,
  onChange,
  onGestureStart,
  onGestureEnd,
  showSize = true,
}) {
  const effects = text?.effects || { shadow: false, outline: false };
  const sizeRem = Number(text?.size_rem) || 1.5;

  function update(partial, meta) {
    onChange({ ...text, ...partial }, meta);
  }

  return (
    <fieldset className="kb-fieldset">
      {label ? <legend>{label}</legend> : null}
      <label className="kb-label">
        Font
        <select
          value={kioskFontPickerValue(text?.font)}
          onChange={(event) => update({ font: event.target.value })}
        >
          {FONT_IDS.map((id) => (
            <option key={id} value={id}>
              {KIOSK_FONTS[id].label}
            </option>
          ))}
        </select>
      </label>
      {showSize ? (
        <div className="kb-slider-field">
          <div className="kb-slider-head">
            <span className="kb-slider-label">Font size</span>
            <span className="kb-slider-value">{sizeRem.toFixed(2)} rem</span>
          </div>
          <input
            type="range"
            min="0.75"
            max="3.5"
            step="0.05"
            value={sizeRem}
            aria-label="Font size"
            onPointerDown={onGestureStart}
            onPointerUp={onGestureEnd}
            onChange={(event) =>
              update({ size_rem: Number(event.target.value) }, { previewOnly: true })
            }
          />
        </div>
      ) : null}
      <ColorField
        label="Text color"
        value={text?.color || "#111827"}
        onChange={(color, meta) => update({ color }, meta)}
        onGestureStart={onGestureStart}
        onGestureEnd={onGestureEnd}
      />
      <div className="kb-subfield">
        <span className="kb-subfield-label">Effects</span>
        <div className="kb-chip-row" role="group" aria-label="Text effects">
          <button
            type="button"
            className={`kb-chip ${!effects.shadow && !effects.outline ? "active" : ""}`}
            onClick={() => update({ effects: { shadow: false, outline: false } })}
          >
            None
          </button>
          <button
            type="button"
            className={`kb-chip ${effects.shadow ? "active" : ""}`}
            onClick={() => update({ effects: { ...effects, shadow: !effects.shadow } })}
          >
            Shadow
          </button>
          <button
            type="button"
            className={`kb-chip ${effects.outline ? "active" : ""}`}
            onClick={() => update({ effects: { ...effects, outline: !effects.outline } })}
          >
            Outline
          </button>
        </div>
      </div>
    </fieldset>
  );
}
