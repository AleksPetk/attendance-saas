import { useEffect, useRef, useState } from "react";
import { COLOR_SWATCHES, normalizeHex } from "./builderUtils.js";

/**
 * Shared color editor: swatch + hex + native/system picker stay in sync.
 * Native <input type="color"> uses onInput (live) and onChange (commit)
 * so Safari/macOS “Show Colors…” updates preview and hex immediately.
 */
export default function ColorField({
  label = "Color",
  value,
  onChange,
  onGestureStart,
  onGestureEnd,
}) {
  const normalized = normalizeHex(value) || "#000000";
  const [draft, setDraft] = useState(normalized);
  const [error, setError] = useState("");
  const pickingRef = useRef(false);

  useEffect(() => {
    if (pickingRef.current) return;
    setDraft(normalized);
    setError("");
  }, [normalized]);

  function applyHex(raw, { previewOnly = false } = {}) {
    const next = normalizeHex(raw);
    if (!next) {
      setError("Enter a hex color like #3B82F6.");
      return false;
    }
    setError("");
    setDraft(next);
    onChange(next, { previewOnly });
    return true;
  }

  function onNativeInput(event) {
    pickingRef.current = true;
    onGestureStart?.();
    applyHex(event.target.value, { previewOnly: true });
  }

  function onNativeChange(event) {
    pickingRef.current = true;
    applyHex(event.target.value, { previewOnly: true });
    pickingRef.current = false;
    onGestureEnd?.();
  }

  return (
    <div className="kb-color">
      <span className="kb-color-label">{label}</span>
      <div className="kb-color-row">
        <input
          type="color"
          className="kb-color-swatch-input"
          aria-label={`${label} picker`}
          value={normalized}
          onPointerDown={() => {
            pickingRef.current = true;
            onGestureStart?.();
          }}
          onInput={onNativeInput}
          onChange={onNativeChange}
          onPointerUp={() => {
            pickingRef.current = false;
            onGestureEnd?.();
          }}
          onPointerCancel={() => {
            pickingRef.current = false;
            onGestureEnd?.();
          }}
          onBlur={() => {
            pickingRef.current = false;
            onGestureEnd?.();
          }}
        />
        <label className="kb-hex-wrap">
          <span className="kb-hex-caption">Custom hex</span>
          <input
            type="text"
            className="kb-hex"
            spellCheck={false}
            placeholder="#3B82F6"
            maxLength={7}
            aria-label={`${label} hex value`}
            value={draft}
            onFocus={onGestureStart}
            onChange={(event) => {
              let raw = event.target.value.trim();
              if (raw && !raw.startsWith("#")) raw = `#${raw}`;
              setDraft(raw);
              const next = normalizeHex(raw);
              if (next) {
                setError("");
                onChange(next, { previewOnly: true });
              } else if (raw.length >= 4) {
                setError("Enter a hex color like #3B82F6.");
              } else {
                setError("");
              }
            }}
            onBlur={() => {
              if (!applyHex(draft)) {
                setDraft(normalized);
                setError("");
              }
              onGestureEnd?.();
            }}
          />
        </label>
      </div>
      <div className="kb-swatch-block">
        <span className="kb-swatch-caption">Preset colors</span>
        <div className="kb-swatches" role="list">
          {COLOR_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              role="listitem"
              className={`kb-swatch ${color === normalized ? "active" : ""}`}
              style={{ background: color }}
              aria-label={`Preset ${color}`}
              title={color}
              onClick={() => applyHex(color)}
            />
          ))}
        </div>
      </div>
      {error ? <p className="kb-field-error">{error}</p> : null}
    </div>
  );
}
