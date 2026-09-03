/**
 * Kiosk Editor top-level section tabs.
 * Fourth tab is derived from Kiosk Settings mode (and Structured → Cards).
 */

import i18n from "../../i18n/index.js";

export function kioskPresentationSection({ mode, groupType }) {
  if (groupType === "structured") {
    return "cards";
  }
  return mode === "input" ? "input" : "cards";
}

export function kioskEditorSections({ mode, groupType }) {
  return ["header", "main", "footer", kioskPresentationSection({ mode, groupType })];
}

export function kioskEditorSectionLabel(name) {
  if (!name) return "";
  const key = `editor.sections.${name}`;
  const translated = i18n.t(`kiosk:${key}`, { defaultValue: "" });
  if (translated) return translated;
  return name[0].toUpperCase() + name.slice(1);
}
