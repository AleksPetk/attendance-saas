import { apiTimeFromInput, parseApiTime } from "./attendanceResetForm.js";

export const EMPTY_KIOSK_SETTINGS_FORM = {
  mode: "card",
  card_show_name: true,
  card_show_participant_code: true,
  card_show_email: false,
  use_pin: false,
  input_field_count: 1,
  input_second_field: "name",
  exit_code: "",
  exit_code_confirm: "",
  confirmation_template: "clean",
  confirmation_check_in_message: "",
  confirmation_check_out_message: "",
  confirmation_break_start_message: "",
  confirmation_break_end_message: "",
  confirmation_return_seconds: 3,
  attendance_reset_mode: "daily",
  attendance_reset_daily_time: "00:00",
  attendance_reset_rolling_hours: 8,
  attendance_reset_rolling_minutes: 0,
};

export function kioskSettingsFormFromApi(settings) {
  const groupRequireEmail = Boolean(settings.group_require_email);
  const groupRequirePin = Boolean(settings.group_require_pin);
  let inputFieldCount = settings.input_field_count || 1;
  let inputSecondField = settings.input_second_field || "name";
  let usePin = Boolean(settings.use_pin);
  let cardShowEmail = Boolean(settings.card_show_email);

  if (!groupRequirePin) {
    usePin = false;
    if (inputFieldCount === 2 && inputSecondField === "pin") {
      inputFieldCount = 1;
      inputSecondField = "name";
    }
  }

  if (!groupRequireEmail) {
    cardShowEmail = false;
    if (inputFieldCount === 2 && inputSecondField === "email") {
      inputFieldCount = 1;
      inputSecondField = "name";
    }
  }

  return {
    mode: settings.mode || "card",
    card_show_name: settings.card_show_name !== false,
    card_show_participant_code: settings.card_show_participant_code !== false,
    card_show_email: cardShowEmail,
    use_pin: usePin,
    input_field_count: inputFieldCount,
    input_second_field: inputSecondField,
    exit_code: "",
    exit_code_confirm: "",
    confirmation_template: settings.confirmation_template || "clean",
    confirmation_check_in_message: settings.confirmation_check_in_message || "",
    confirmation_check_out_message: settings.confirmation_check_out_message || "",
    confirmation_break_start_message: settings.confirmation_break_start_message || "",
    confirmation_break_end_message: settings.confirmation_break_end_message || "",
    confirmation_return_seconds: Number(settings.confirmation_return_seconds) || 3,
    attendance_reset_mode: settings.attendance_reset_mode || "daily",
    attendance_reset_daily_time: parseApiTime(settings.attendance_reset_daily_time),
    attendance_reset_rolling_hours: Number(settings.attendance_reset_rolling_hours) || 8,
    attendance_reset_rolling_minutes: Number(settings.attendance_reset_rolling_minutes) || 0,
  };
}

export function normalizeKioskSettingsComparable(form, { changingExitCode, exitCodeConfigured }) {
  const inputFieldCount = Number(form.input_field_count) || 1;
  const exitEditing = Boolean(changingExitCode) || !exitCodeConfigured;

  return {
    mode: form.mode || "card",
    card_show_name: form.card_show_name !== false,
    card_show_participant_code: form.card_show_participant_code !== false,
    card_show_email: Boolean(form.card_show_email),
    use_pin: Boolean(form.use_pin),
    input_field_count: inputFieldCount,
    input_second_field: inputFieldCount === 2 ? form.input_second_field || "name" : "",
    exit_code: exitEditing ? (form.exit_code || "").trim() : "",
    exit_code_confirm: exitEditing ? (form.exit_code_confirm || "").trim() : "",
    confirmation_template: form.confirmation_template || "clean",
    confirmation_check_in_message: (form.confirmation_check_in_message || "").trim(),
    confirmation_check_out_message: (form.confirmation_check_out_message || "").trim(),
    confirmation_break_start_message: (form.confirmation_break_start_message || "").trim(),
    confirmation_break_end_message: (form.confirmation_break_end_message || "").trim(),
    confirmation_return_seconds: Number(form.confirmation_return_seconds) || 3,
    attendance_reset_mode: form.attendance_reset_mode || "daily",
    attendance_reset_daily_time: form.attendance_reset_daily_time || "00:00",
    attendance_reset_rolling_hours: Number(form.attendance_reset_rolling_hours) || 0,
    attendance_reset_rolling_minutes: Number(form.attendance_reset_rolling_minutes) || 0,
  };
}

export function isKioskSettingsDirty(form, savedForm, ui) {
  const current = normalizeKioskSettingsComparable(form, ui);
  const saved = normalizeKioskSettingsComparable(savedForm, {
    changingExitCode: ui.savedChangingExitCode,
    exitCodeConfigured: ui.exitCodeConfigured,
  });
  return JSON.stringify(current) !== JSON.stringify(saved);
}

export function buildKioskSettingsSavePayload(form, { changingExitCode, exitCodeConfigured }) {
  const payload = {
    mode: form.mode,
    card_show_name: form.card_show_name,
    card_show_participant_code: form.card_show_participant_code,
    card_show_email: form.card_show_email,
    use_pin: form.use_pin,
    input_field_count: form.input_field_count,
    input_second_field: form.input_field_count === 2 ? form.input_second_field : "",
    confirmation_template: form.confirmation_template || "clean",
    confirmation_check_in_message: form.confirmation_check_in_message || "",
    confirmation_check_out_message: form.confirmation_check_out_message || "",
    confirmation_break_start_message: form.confirmation_break_start_message || "",
    confirmation_break_end_message: form.confirmation_break_end_message || "",
    confirmation_return_seconds: Number(form.confirmation_return_seconds) || 3,
    attendance_reset_mode: form.attendance_reset_mode || "daily",
    attendance_reset_daily_time: apiTimeFromInput(form.attendance_reset_daily_time),
    attendance_reset_rolling_hours: Number(form.attendance_reset_rolling_hours) || 0,
    attendance_reset_rolling_minutes: Number(form.attendance_reset_rolling_minutes) || 0,
  };
  if (changingExitCode || !exitCodeConfigured) {
    payload.exit_code = form.exit_code;
    payload.exit_code_confirm = form.exit_code_confirm;
  }
  return payload;
}
