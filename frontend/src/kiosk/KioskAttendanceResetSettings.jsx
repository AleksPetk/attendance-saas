import { useState } from "react";
import {
  DAILY_RESET_PRESETS,
  ROLLING_MAX_HOURS,
  ROLLING_MAX_MINUTES,
  ROLLING_RESET_PRESETS,
  dailyResetPresetForTime,
  rollingResetPresetForDuration,
} from "./attendanceResetForm.js";

export default function KioskAttendanceResetSettings({ form, onPatch, onResetNow, resetting }) {
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
      <div className="kiosk-settings-subsection">
        <h4>Reset mode</h4>
        <div className="kiosk-segment-picker" role="radiogroup" aria-label="Attendance reset mode">
          {[
            { id: "daily", label: "Daily" },
            { id: "rolling", label: "Rolling" },
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
        <div className="kiosk-settings-subsection">
          <h4>Reset at</h4>
          <div className="kiosk-segment-picker" role="radiogroup" aria-label="Daily reset time">
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
                {preset.label}
              </label>
            ))}
          </div>
          {dailyPreset === "custom" ? (
            <div className="ks-reset-custom-field">
              <label className="field-label" htmlFor="daily-reset-custom-time">
                Custom time (24-hour)
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
        <div className="kiosk-settings-subsection">
          <h4>Reset after</h4>
          <div className="kiosk-segment-picker" role="radiogroup" aria-label="Rolling reset duration">
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
                {preset.label}
              </label>
            ))}
          </div>
          {rollingPreset === "custom" ? (
            <div className="ks-reset-duration-grid">
              <div className="ks-reset-custom-field">
                <label className="field-label" htmlFor="rolling-reset-hours">
                  Hours
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
                  Minutes
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

      <div className="ks-reset-manual">
        <h4>Manual reset</h4>
        <p className="hint kiosk-settings-helper">
          Need a fresh cycle before the scheduled reset?
        </p>
        <button
          type="button"
          className="btn-danger-soft"
          onClick={onResetNow}
          disabled={resetting}
        >
          {resetting ? "Resetting…" : "Reset now"}
        </button>
      </div>
    </div>
  );
}
