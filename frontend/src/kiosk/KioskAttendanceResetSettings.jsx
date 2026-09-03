import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DAILY_RESET_PRESETS,
  ROLLING_MAX_HOURS,
  ROLLING_MAX_MINUTES,
  ROLLING_RESET_PRESETS,
  dailyResetPresetForTime,
  dailyResetPresetLabel,
  rollingResetPresetForDuration,
  rollingResetPresetLabel,
} from "./attendanceResetForm.js";

export default function KioskAttendanceResetSettings({ form, onPatch, onResetNow, resetting }) {
  const { t } = useTranslation("kiosk");
  const [dailyCustomSelected, setDailyCustomSelected] = useState(false);
  const [rollingCustomSelected, setRollingCustomSelected] = useState(false);
  const derivedDailyPreset = dailyResetPresetForTime(form.attendance_reset_daily_time);
  const dailyPreset = dailyCustomSelected || derivedDailyPreset === "custom" ? "custom" : derivedDailyPreset;
  const derivedRollingPreset = rollingResetPresetForDuration(
    form.attendance_reset_rolling_hours,
    form.attendance_reset_rolling_minutes,
  );
  const rollingPreset =
    rollingCustomSelected || derivedRollingPreset === "custom" ? "custom" : derivedRollingPreset;

  const isDaily = form.attendance_reset_mode === "daily";
  const isRolling = form.attendance_reset_mode === "rolling";

  function selectDailyPreset(presetId) {
    if (presetId === "custom") {
      setDailyCustomSelected(true);
      return;
    }
    setDailyCustomSelected(false);
    onPatch({ attendance_reset_daily_time: presetId });
  }

  function selectRollingPreset(presetId) {
    if (presetId === "custom") {
      setRollingCustomSelected(true);
      return;
    }
    setRollingCustomSelected(false);
    if (presetId === "8") {
      onPatch({ attendance_reset_rolling_hours: 8, attendance_reset_rolling_minutes: 0 });
    } else if (presetId === "12") {
      onPatch({ attendance_reset_rolling_hours: 12, attendance_reset_rolling_minutes: 0 });
    }
  }

  return (
    <div className="ks-attendance-reset">
      <div className="kiosk-settings-subsection" data-tutorial-target="kiosk-reset-mode">
        <h4>{t("attendanceReset.mode")}</h4>
        <div className="kiosk-segment-picker" role="radiogroup" aria-label={t("attendanceReset.modeAria")}>
          {[
            { id: "daily", label: t("attendanceReset.daily") },
            { id: "rolling", label: t("attendanceReset.rolling") },
          ].map((option) => (
            <label
              key={option.id}
              className={`kiosk-segment-option ${form.attendance_reset_mode === option.id ? "active" : ""}`}
            >
              <input
                type="radio"
                name="attendance-reset-mode"
                checked={form.attendance_reset_mode === option.id}
                onChange={() => onPatch({ attendance_reset_mode: option.id })}
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      {isDaily ? (
        <div className="kiosk-settings-subsection" data-tutorial-target="kiosk-reset-schedule">
          <h4>{t("attendanceReset.resetAt")}</h4>
          <div className="kiosk-segment-picker" role="radiogroup" aria-label={t("attendanceReset.dailyAria")}>
            {DAILY_RESET_PRESETS.map((preset) => (
              <label
                key={preset.id}
                className={`kiosk-segment-option ${dailyPreset === preset.id ? "active" : ""}`}
              >
                <input
                  type="radio"
                  name="daily-reset-preset"
                  checked={dailyPreset === preset.id}
                  onChange={() => selectDailyPreset(preset.id)}
                />
                {dailyResetPresetLabel(preset)}
              </label>
            ))}
          </div>
          {dailyPreset === "custom" ? (
            <div className="ks-reset-custom-field">
              <label className="field-label" htmlFor="daily-reset-custom-time">
                {t("attendanceReset.customTime")}
              </label>
              <input
                id="daily-reset-custom-time"
                type="time"
                className="ks-reset-time-input"
                value={form.attendance_reset_daily_time || "00:00"}
                onChange={(event) => onPatch({ attendance_reset_daily_time: event.target.value })}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {isRolling ? (
        <div className="kiosk-settings-subsection" data-tutorial-target="kiosk-reset-schedule">
          <h4>{t("attendanceReset.resetAfter")}</h4>
          <div className="kiosk-segment-picker" role="radiogroup" aria-label={t("attendanceReset.rollingAria")}>
            {ROLLING_RESET_PRESETS.map((preset) => (
              <label
                key={preset.id}
                className={`kiosk-segment-option ${rollingPreset === preset.id ? "active" : ""}`}
              >
                <input
                  type="radio"
                  name="rolling-reset-preset"
                  checked={rollingPreset === preset.id}
                  onChange={() => selectRollingPreset(preset.id)}
                />
                {rollingResetPresetLabel(preset)}
              </label>
            ))}
          </div>
          {rollingPreset === "custom" ? (
            <div className="ks-reset-duration-grid">
              <div className="ks-reset-custom-field">
                <label className="field-label" htmlFor="rolling-reset-hours">
                  {t("attendanceReset.hours")}
                </label>
                <input
                  id="rolling-reset-hours"
                  type="number"
                  min="0"
                  max={ROLLING_MAX_HOURS}
                  className="ks-reset-number-input"
                  value={form.attendance_reset_rolling_hours}
                  onChange={(event) =>
                    onPatch({ attendance_reset_rolling_hours: Number(event.target.value) || 0 })
                  }
                />
              </div>
              <div className="ks-reset-custom-field">
                <label className="field-label" htmlFor="rolling-reset-minutes">
                  {t("attendanceReset.minutes")}
                </label>
                <input
                  id="rolling-reset-minutes"
                  type="number"
                  min="0"
                  max={ROLLING_MAX_MINUTES}
                  className="ks-reset-number-input"
                  value={form.attendance_reset_rolling_minutes}
                  onChange={(event) =>
                    onPatch({ attendance_reset_rolling_minutes: Number(event.target.value) || 0 })
                  }
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="ks-reset-manual" data-tutorial-target="kiosk-reset-now">
        <h4>{t("attendanceReset.manual")}</h4>
        <p className="hint kiosk-settings-helper">
          {t("attendanceReset.manualHint")}
        </p>
        <button
          type="button"
          className="btn-danger-soft"
          onClick={onResetNow}
          disabled={resetting}
        >
          {resetting ? t("attendanceReset.resetting") : t("attendanceReset.resetNow")}
        </button>
      </div>
    </div>
  );
}
