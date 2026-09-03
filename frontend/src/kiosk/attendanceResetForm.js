import i18n from "../i18n/index.js";

export const ATTENDANCE_RESET_MODES = ["daily", "rolling"];

export function dailyResetPresetLabel(preset) {
  if (preset.id === "custom") return i18n.t("kiosk:attendanceReset.custom");
  return preset.label;
}

export function rollingResetPresetLabel(preset) {
  if (preset.id === "custom") return i18n.t("kiosk:attendanceReset.custom");
  if (preset.id === "8") return i18n.t("kiosk:attendanceReset.hours8");
  if (preset.id === "12") return i18n.t("kiosk:attendanceReset.hours12");
  return preset.label;
}

export const DAILY_RESET_PRESETS = [
  { id: "00:00", label: "00:00" },
  { id: "12:00", label: "12:00" },
  { id: "custom", label: "Custom" },
];

export const ROLLING_RESET_PRESETS = [
  { id: "8", label: "8 hours" },
  { id: "12", label: "12 hours" },
  { id: "custom", label: "Custom" },
];

export const ROLLING_MAX_HOURS = 7 * 24;
export const ROLLING_MAX_MINUTES = 59;

export function parseApiTime(value) {
  if (!value || typeof value !== "string") return "00:00";
  return value.slice(0, 5);
}

export function dailyResetPresetForTime(timeValue) {
  const time = parseApiTime(timeValue);
  if (time === "00:00") return "00:00";
  if (time === "12:00") return "12:00";
  return "custom";
}

export function rollingResetPresetForDuration(hours, minutes) {
  const h = Number(hours) || 0;
  const m = Number(minutes) || 0;
  if (h === 8 && m === 0) return "8";
  if (h === 12 && m === 0) return "12";
  return "custom";
}

export function apiTimeFromInput(value) {
  const safe = parseApiTime(value);
  return `${safe}:00`;
}
