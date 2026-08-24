import { resolveCardTemplate } from "./cardTemplates.js";
import { inputTemplateAccent, resolveInputTemplate } from "./inputTemplates.js";

/**
 * Template id that drives .kiosk-flow and confirmation styling.
 * Card kiosks use the active Card template; Input kiosks use the Input template.
 */
export function resolveFlowTemplate(main = {}, kioskMode = "card") {
  if (kioskMode === "input") return resolveInputTemplate(main);
  return resolveCardTemplate(main);
}

/** Accent color for the active flow template (shared keys reuse Input accents). */
export function flowTemplateAccent(templateId) {
  return inputTemplateAccent(templateId);
}
