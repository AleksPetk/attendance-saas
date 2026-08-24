/**
 * Kiosk Editor top-level section tabs.
 * Fourth tab is derived from Kiosk Settings mode (and Structured → Cards).
 */

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
  if (name === "cards") return "Cards";
  if (name === "input") return "Input";
  if (name === "header") return "Header";
  if (name === "main") return "Main";
  if (name === "footer") return "Footer";
  return name ? name[0].toUpperCase() + name.slice(1) : "";
}
