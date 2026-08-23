export const CONFIRMATION_TEMPLATE_IDS = [
  "clean",
  "business",
  "friendly",
  "kids",
  "fitness",
  "event",
  "celebration",
  "minimal",
];

export const CONFIRMATION_TEMPLATES = [
  { id: "clean", label: "Clean", sampleIcon: "✓" },
  { id: "business", label: "Business", sampleIcon: "✓" },
  { id: "friendly", label: "Friendly", sampleIcon: "✓" },
  { id: "kids", label: "Kids", sampleIcon: "★" },
  { id: "fitness", label: "Fitness", sampleIcon: "✓" },
  { id: "event", label: "Event", sampleIcon: "✓" },
  { id: "celebration", label: "Celebration", sampleIcon: "✦" },
  { id: "minimal", label: "Minimal", sampleIcon: "✓" },
];

export const CONFIRMATION_RETURN_OPTIONS = [1, 3, 5];

export const CONFIRMATION_MESSAGE_FIELDS = [
  {
    action: "check_in",
    field: "confirmation_check_in_message",
    label: "Check-in message",
    groupFlag: "check_in_enabled",
  },
  {
    action: "check_out",
    field: "confirmation_check_out_message",
    label: "Check-out message",
    groupFlag: "check_out_enabled",
  },
  {
    action: "break_start",
    field: "confirmation_break_start_message",
    label: "Break start message",
    groupFlag: "breaks_enabled",
  },
  {
    action: "break_end",
    field: "confirmation_break_end_message",
    label: "Break end message",
    groupFlag: "breaks_enabled",
  },
];

export const PREVIEW_CONTEXT = {
  name: "Aleks",
  time: "21:42",
  group: "School",
};

const ALLOWED_VARIABLES = new Set(["name", "time", "group"]);

/** Safe client-side preview rendering (mirrors backend rules). */
export function renderConfirmationMessage(template, context = PREVIEW_CONTEXT) {
  const text = String(template || "");
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    if (!ALLOWED_VARIABLES.has(key)) return "";
    return context[key] ?? "";
  });
}

export function messageTemplateForPreview(form, action, defaults = {}) {
  const field = CONFIRMATION_MESSAGE_FIELDS.find((item) => item.action === action)?.field;
  const stored = field ? String(form[field] || "").trim() : "";
  if (stored) return stored;
  return defaults[action] || "";
}

export function visibleConfirmationMessageFields(groupActions = {}) {
  return CONFIRMATION_MESSAGE_FIELDS.filter((item) => Boolean(groupActions[item.groupFlag]));
}

export function normalizeConfirmationTemplate(template) {
  const id = template || "clean";
  return CONFIRMATION_TEMPLATE_IDS.includes(id) ? id : "clean";
}
