import { CARD_TEMPLATE_IDS, isCardTemplateId } from "./cardTemplates.js";
import { INPUT_TEMPLATE_IDS, isInputTemplateId } from "./inputTemplates.js";
import { flowTemplateAccent, resolveFlowTemplate } from "./flowTemplate.js";

/**
 * Legacy Confirmation Screen template ids (deprecated for visuals).
 * Kept for load/compat only — rendering uses Card/Input flow templates.
 */
export const LEGACY_CONFIRMATION_TEMPLATE_IDS = [
  "clean",
  "business",
  "friendly",
  "kids",
  "fitness",
  "event",
  "celebration",
  "minimal",
];

/** @deprecated Use Card/Input templates for visuals. Alias for legacy tests. */
export const CONFIRMATION_TEMPLATE_IDS = LEGACY_CONFIRMATION_TEMPLATE_IDS;

/** @deprecated Selector removed in Stage 2. */
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

/** Map old confirmation-template keys onto current Card/Input family keys. */
const LEGACY_CONFIRMATION_TO_FAMILY = {
  clean: "clean",
  business: "business",
  friendly: "welcome",
  kids: "playground",
  fitness: "active",
  event: "pass",
  celebration: "victory",
  minimal: "minimal",
};

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

/**
 * @deprecated Old confirmation-template field normalizer (settings storage only).
 * Does not drive live confirmation visuals.
 */
export function normalizeConfirmationTemplate(template) {
  const id = template || "clean";
  return LEGACY_CONFIRMATION_TEMPLATE_IDS.includes(id) ? id : "clean";
}

/** True when id is a valid Card or Input visual family key. */
export function isConfirmationVisualFamily(id) {
  return isCardTemplateId(id) || isInputTemplateId(id);
}

/**
 * Canonical visual family for confirmation presentation.
 * Prefers Card/Input template ids; maps legacy confirmation ids as fallback.
 */
export function normalizeConfirmationVisualFamily(templateId) {
  if (isConfirmationVisualFamily(templateId)) return templateId;
  if (LEGACY_CONFIRMATION_TO_FAMILY[templateId]) {
    return LEGACY_CONFIRMATION_TO_FAMILY[templateId];
  }
  return "clean";
}

/**
 * Resolve confirmation visual family from kiosk design + mode.
 * Ignores deprecated settings.confirmation_template for rendering.
 */
export function resolveConfirmationVisualFamily(main = {}, kioskMode = "card") {
  return resolveFlowTemplate(main, kioskMode);
}

export function confirmationVisualAccent(templateId) {
  const family = normalizeConfirmationVisualFamily(templateId);
  return flowTemplateAccent(family);
}

/** All Card + Input keys that must resolve a confirmation theme. */
export function allConfirmationVisualFamilyIds() {
  return [...new Set([...CARD_TEMPLATE_IDS, ...INPUT_TEMPLATE_IDS])];
}
