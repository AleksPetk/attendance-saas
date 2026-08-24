/**
 * Curated Input-mode Main templates.
 * Canonical id: main.input_template
 * Legacy layout/button/input presets are mapped for compatibility only.
 */

export const INPUT_TEMPLATE_IDS = [
  "clean",
  "soft",
  "bold",
  "minimal",
  "outline",
  "dark",
  "glass",
  "rounded",
  "compact",
  "large_touch",
  "kids_bubble",
  "heart_pop",
  "ticket",
  "id_badge",
  "cyber_hex",
  "polaroid",
  "sticker_pack",
  "terminal",
  "ribbon",
  "comic",
  "pure",
  "executive",
  "welcome",
  "playground",
  "active",
  "pass",
  "victory",
  "bare",
];

/** @type {Record<string, { label: string, layout: string, button: string, input: string, accent: string }>} */
export const INPUT_TEMPLATES = {
  clean: {
    label: "Clean",
    layout: "centered",
    button: "rounded",
    input: "outlined",
    accent: "#2563EB",
  },
  soft: {
    label: "Soft",
    layout: "centered",
    button: "pill",
    input: "filled",
    accent: "#3B82F6",
  },
  bold: {
    label: "Bold",
    layout: "centered",
    button: "flat",
    input: "outlined",
    accent: "#0F172A",
  },
  minimal: {
    label: "Minimal",
    layout: "centered",
    button: "flat",
    input: "minimal",
    accent: "#334155",
  },
  outline: {
    label: "Outline",
    layout: "centered",
    button: "rounded",
    input: "outlined",
    accent: "#2563EB",
  },
  dark: {
    label: "Dark",
    layout: "centered",
    button: "rounded",
    input: "filled",
    accent: "#38BDF8",
  },
  glass: {
    label: "Glass",
    layout: "centered",
    button: "pill",
    input: "outlined",
    accent: "#2563EB",
  },
  rounded: {
    label: "Rounded",
    layout: "centered",
    button: "pill",
    input: "filled",
    accent: "#4F46E5",
  },
  compact: {
    label: "Compact",
    layout: "compact",
    button: "rounded",
    input: "outlined",
    accent: "#2563EB",
  },
  large_touch: {
    label: "Large Touch",
    layout: "large_touch",
    button: "rounded",
    input: "outlined",
    accent: "#2563EB",
  },
  kids_bubble: {
    label: "Kids Bubble",
    layout: "centered",
    button: "pill",
    input: "filled",
    accent: "#A855F7",
  },
  heart_pop: {
    label: "Heart Pop",
    layout: "centered",
    button: "pill",
    input: "outlined",
    accent: "#FB7185",
  },
  ticket: {
    label: "Ticket",
    layout: "centered",
    button: "flat",
    input: "outlined",
    accent: "#2563EB",
  },
  id_badge: {
    label: "ID Badge",
    layout: "centered",
    button: "rounded",
    input: "outlined",
    accent: "#2563EB",
  },
  cyber_hex: {
    label: "Cyber Hex",
    layout: "centered",
    button: "flat",
    input: "filled",
    accent: "#22D3EE",
  },
  polaroid: {
    label: "Polaroid",
    layout: "centered",
    button: "rounded",
    input: "outlined",
    accent: "#2563EB",
  },
  sticker_pack: {
    label: "Sticker Pack",
    layout: "centered",
    button: "rounded",
    input: "filled",
    accent: "#F59E0B",
  },
  terminal: {
    label: "Terminal",
    layout: "centered",
    button: "flat",
    input: "outlined",
    accent: "#4ADE80",
  },
  ribbon: {
    label: "Ribbon",
    layout: "centered",
    button: "rounded",
    input: "outlined",
    accent: "#7C3AED",
  },
  comic: {
    label: "Comic",
    layout: "centered",
    button: "flat",
    input: "outlined",
    accent: "#F97316",
  },
  pure: {
    label: "Pure",
    layout: "centered",
    button: "rounded",
    input: "outlined",
    accent: "#64748B",
  },
  executive: {
    label: "Executive",
    layout: "centered",
    button: "rounded",
    input: "outlined",
    accent: "#1E40AF",
  },
  welcome: {
    label: "Welcome",
    layout: "centered",
    button: "pill",
    input: "filled",
    accent: "#EA580C",
  },
  playground: {
    label: "Playground",
    layout: "centered",
    button: "pill",
    input: "filled",
    accent: "#7C3AED",
  },
  active: {
    label: "Active",
    layout: "centered",
    button: "flat",
    input: "outlined",
    accent: "#DC2626",
  },
  pass: {
    label: "Pass",
    layout: "centered",
    button: "rounded",
    input: "outlined",
    accent: "#0284C7",
  },
  victory: {
    label: "Victory",
    layout: "centered",
    button: "rounded",
    input: "filled",
    accent: "#CA8A04",
  },
  bare: {
    label: "Bare",
    layout: "centered",
    button: "flat",
    input: "minimal",
    accent: "#475569",
  },
};

const LEGACY_EXACT = {
  "centered|rounded|outlined": "clean",
  "centered|pill|filled": "soft",
  "centered|flat|outlined": "bold",
  "centered|flat|minimal": "minimal",
  "centered|rounded|filled": "rounded",
  "centered|pill|outlined": "glass",
  "compact|rounded|outlined": "compact",
  "compact|rounded|filled": "compact",
  "compact|pill|filled": "compact",
  "large_touch|rounded|outlined": "large_touch",
  "large_touch|rounded|filled": "large_touch",
  "large_touch|pill|outlined": "large_touch",
};

export function isInputTemplateId(id) {
  return Boolean(id && INPUT_TEMPLATES[id]);
}

export function deriveInputTemplate(layout, button, input) {
  const key = `${layout || "centered"}|${button || "rounded"}|${input || "outlined"}`;
  if (LEGACY_EXACT[key]) return LEGACY_EXACT[key];
  if (layout === "large_touch") return "large_touch";
  if (layout === "compact") return "compact";
  if (input === "minimal") return "minimal";
  if (button === "flat" && input === "outlined") return "bold";
  if (button === "pill" && input === "filled") return "soft";
  if (input === "filled") return "rounded";
  return "clean";
}

export function resolveInputTemplate(main = {}) {
  if (isInputTemplateId(main.input_template)) return main.input_template;
  return deriveInputTemplate(main.layout_preset, main.button_preset, main.input_preset);
}

export function inputTemplateAccent(templateId) {
  return INPUT_TEMPLATES[templateId]?.accent || "#2563EB";
}

/** Apply a template onto main config fields (single source of truth). */
export function patchMainWithInputTemplate(main, templateId) {
  const id = isInputTemplateId(templateId) ? templateId : "clean";
  const t = INPUT_TEMPLATES[id];
  return {
    ...main,
    input_template: id,
    layout_preset: t.layout,
    button_preset: t.button,
    input_preset: t.input,
  };
}
