import { useTranslation } from "react-i18next";
import ColorField from "./ColorField.jsx";

const ANGLE_KEYS = [
  { key: "vertical", value: 180 },
  { key: "horizontal", value: 90 },
  { key: "diagonal", value: 135 },
];

export default function GradientField({
  background,
  onChange,
  onGestureStart,
  onGestureEnd,
}) {
  const { t } = useTranslation("kiosk");
  const color = background?.color || "#2563EB";
  const color2 = background?.color2 || "#0F172A";
  const angle = Number(background?.gradient_angle) || 90;

  function update(partial, meta) {
    onChange(
      {
        mode: "gradient",
        color,
        color2,
        gradient_angle: angle,
        ...partial,
      },
      meta,
    );
  }

  return (
    <div className="kb-stack">
      <ColorField
        label={t("builder.color1")}
        value={color}
        onChange={(next, meta) => update({ color: next }, meta)}
        onGestureStart={onGestureStart}
        onGestureEnd={onGestureEnd}
      />
      <ColorField
        label={t("builder.color2")}
        value={color2}
        onChange={(next, meta) => update({ color2: next }, meta)}
        onGestureStart={onGestureStart}
        onGestureEnd={onGestureEnd}
      />
      <div className="kb-slider-field">
        <div className="kb-slider-head">
          <span className="kb-slider-label">{t("builder.direction")}</span>
          <span className="kb-slider-value">{Math.round(angle)}°</span>
        </div>
        <input
          type="range"
          min="0"
          max="360"
          value={angle}
          aria-label={t("builder.gradientDirectionAria")}
          onPointerDown={onGestureStart}
          onPointerUp={onGestureEnd}
          onChange={(event) =>
            update({ gradient_angle: Number(event.target.value) }, { previewOnly: true })
          }
        />
      </div>
      <div className="kb-chip-row" role="group" aria-label={t("builder.directionPresetsAria")}>
        {ANGLE_KEYS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`kb-chip ${angle === item.value ? "active" : ""}`}
            onClick={() => update({ gradient_angle: item.value })}
          >
            {t(`builder.${item.key}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
