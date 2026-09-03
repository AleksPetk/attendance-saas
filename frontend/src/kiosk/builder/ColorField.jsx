import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import {
  COLOR_SWATCHES,
  evaluateHexDraft,
  hexColorError,
  normalizeHex,
  replaceHexDraftSelection,
} from "./builderUtils.js";

/**
 * Shared color editor: swatch + hex + native/system picker stay in sync.
 * Native <input type="color"> uses onInput (live) and onChange (commit)
 * so Safari/macOS “Show Colors…” updates preview and hex immediately.
 */
export default function ColorField({
  label = undefined,
  value,
  onChange,
  onGestureStart,
  onGestureEnd,
}) {
  const { t } = useTranslation("kiosk");
  const fieldLabel = label || t("builder.color");
  const normalized = normalizeHex(value) || "#000000";
  const [draft, setDraft] = useState(normalized);
  const [error, setError] = useState("");
  const pickingRef = useRef(false);
  const textEditingRef = useRef(false);

  useEffect(() => {
    if (pickingRef.current || textEditingRef.current) return;
    setDraft(normalized);
    setError("");
  }, [normalized]);

  function applyHex(raw, { previewOnly = false } = {}) {
    const next = normalizeHex(raw);
    if (!next) {
      setError(hexColorError());
      return false;
    }
    setError("");
    setDraft(next);
    onChange(next, { previewOnly });
    return true;
  }

  function updateHexDraft(raw) {
    const result = evaluateHexDraft(raw);
    setDraft(result.draft);
    setError(result.error);
    if (result.color) {
      onChange(result.color, { previewOnly: true });
    }
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
      <span className="kb-color-label">{fieldLabel}</span>
      <div className="kb-color-row">
        <input
          type="color"
          className="kb-color-swatch-input"
          aria-label={`${fieldLabel} picker`}
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
          <span className="kb-hex-caption">{t("builder.customHex")}</span>
          <input
            type="text"
            className="kb-hex"
            spellCheck={false}
            placeholder="#3B82F6"
            aria-label={`${fieldLabel} hex value`}
            value={draft}
            onFocus={() => {
              textEditingRef.current = true;
              onGestureStart?.();
            }}
            onChange={(event) => {
              updateHexDraft(event.target.value);
            }}
            onPaste={(event) => {
              event.preventDefault();
              const input = event.currentTarget;
              const paste = replaceHexDraftSelection(
                draft,
                event.clipboardData.getData("text"),
                input.selectionStart,
                input.selectionEnd,
              );
              updateHexDraft(paste.draft);
              requestAnimationFrame(() => {
                input.setSelectionRange(paste.caret, paste.caret);
              });
            }}
            onBlur={() => {
              const result = evaluateHexDraft(draft);
              textEditingRef.current = false;
              if (result.color) {
                applyHex(result.color);
              } else {
                setError(result.error);
              }
              onGestureEnd?.();
            }}
          />
        </label>
      </div>
      <div className="kb-swatch-block">
        <span className="kb-swatch-caption">{t("builder.presetColors")}</span>
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
