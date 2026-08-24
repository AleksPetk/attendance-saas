/**
 * Curated Card-mode presentation templates.
 * Canonical id: main.card_template
 * Legacy layout_preset + card_preset are mapped for compatibility only.
 */

export const CARD_TEMPLATE_IDS = [
  "clean",
  "compact",
  "business",
  "large_touch",
  "photo",
  "minimal",
  "bold",
  "glass",
  "outline",
  "soft",
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

/**
 * @type {Record<string, {
 *   label: string,
 *   layout: string,
 *   card: string,
 *   description: string,
 * }>}
 */
export const CARD_TEMPLATES = {
  clean: {
    label: "Clean",
    layout: "centered",
    card: "elevated",
    description: "Balanced white cards with clear hierarchy.",
  },
  compact: {
    label: "Compact",
    layout: "compact",
    card: "flat",
    description: "Denser grid with smaller cards.",
  },
  business: {
    label: "Business",
    layout: "split",
    card: "bordered",
    description: "Structured professional layout.",
  },
  large_touch: {
    label: "Large Touch",
    layout: "large_touch",
    card: "elevated",
    description: "Large touch targets for tablets.",
  },
  photo: {
    label: "Photo",
    layout: "photo_cards",
    card: "elevated",
    description: "Avatar-first cards with safe initials fallback.",
  },
  minimal: {
    label: "Minimal",
    layout: "centered",
    card: "flat",
    description: "Lightweight cards with a soft divider and clear hierarchy.",
  },
  bold: {
    label: "Bold",
    layout: "centered",
    card: "elevated",
    description: "High-contrast dark cards with strong, readable names.",
  },
  glass: {
    label: "Glass",
    layout: "centered",
    card: "elevated",
    description: "Translucent surface that stays readable.",
  },
  outline: {
    label: "Outline",
    layout: "centered",
    card: "bordered",
    description: "Accent border with a light inner tint for readability.",
  },
  soft: {
    label: "Soft",
    layout: "centered",
    card: "elevated",
    description: "Gentle radius, shadow, and spacious layout.",
  },
  kids_bubble: {
    label: "Kids Bubble",
    layout: "centered",
    card: "elevated",
    description: "Playful bubble cards for kids clubs and kindergarten.",
  },
  heart_pop: {
    label: "Heart Pop",
    layout: "centered",
    card: "elevated",
    description: "Warm rounded cards with a soft heart accent.",
  },
  ticket: {
    label: "Ticket",
    layout: "centered",
    card: "bordered",
    description: "Admission-ticket silhouette with stub and perforation.",
  },
  id_badge: {
    label: "ID Badge",
    layout: "centered",
    card: "elevated",
    description: "Vertical badge layout with clip and ID hierarchy.",
  },
  cyber_hex: {
    label: "Cyber Hex",
    layout: "centered",
    card: "elevated",
    description: "Angular tech cards with restrained cyan accents.",
  },
  polaroid: {
    label: "Polaroid",
    layout: "centered",
    card: "elevated",
    description: "Instant-photo frame with caption strip below.",
  },
  sticker_pack: {
    label: "Sticker Pack",
    layout: "centered",
    card: "elevated",
    description: "Layered sticker cards with playful tape accents.",
  },
  terminal: {
    label: "Terminal",
    layout: "centered",
    card: "elevated",
    description: "Retro console panel with prompt-style hierarchy.",
  },
  ribbon: {
    label: "Ribbon",
    layout: "centered",
    card: "elevated",
    description: "Premium asymmetric card with a banner ribbon.",
  },
  comic: {
    label: "Comic",
    layout: "centered",
    card: "elevated",
    description: "Speech-bubble comic panel with bold outlines.",
  },
  pure: {
    label: "Pure",
    layout: "centered",
    card: "elevated",
    description: "Polished neutral surface with restrained accent and generous whitespace.",
  },
  executive: {
    label: "Executive",
    layout: "centered",
    card: "bordered",
    description: "Premium corporate card with structured hierarchy and formal accents.",
  },
  welcome: {
    label: "Welcome",
    layout: "centered",
    card: "elevated",
    description: "Warm approachable card with soft curves and inviting accent marks.",
  },
  playground: {
    label: "Playground",
    layout: "centered",
    card: "elevated",
    description: "Playful block-geometry tile with stacked color tabs.",
  },
  active: {
    label: "Active",
    layout: "centered",
    card: "elevated",
    description: "Sporty energetic card with diagonal motion accents.",
  },
  pass: {
    label: "Pass",
    layout: "centered",
    card: "bordered",
    description: "Modern event access pass with credential strip and barcode marks.",
  },
  victory: {
    label: "Victory",
    layout: "centered",
    card: "elevated",
    description: "Celebratory premium tile with confetti and starburst accents.",
  },
  bare: {
    label: "Bare",
    layout: "centered",
    card: "flat",
    description: "Editorial typography-first card with the lightest possible frame.",
  },
};

/** Exact legacy layout|card → template */
const LEGACY_EXACT = {
  "centered|elevated": "clean",
  "centered|flat": "minimal",
  "centered|bordered": "outline",
  "compact|elevated": "compact",
  "compact|flat": "compact",
  "compact|bordered": "compact",
  "split|elevated": "business",
  "split|flat": "business",
  "split|bordered": "business",
  "large_touch|elevated": "large_touch",
  "large_touch|flat": "large_touch",
  "large_touch|bordered": "large_touch",
  "photo_cards|elevated": "photo",
  "photo_cards|flat": "photo",
  "photo_cards|bordered": "photo",
};

export function isCardTemplateId(id) {
  return Boolean(id && CARD_TEMPLATES[id]);
}

export function deriveCardTemplate(layout, card) {
  const key = `${layout || "centered"}|${card || "elevated"}`;
  if (LEGACY_EXACT[key]) return LEGACY_EXACT[key];
  if (layout === "photo_cards") return "photo";
  if (layout === "large_touch") return "large_touch";
  if (layout === "compact") return "compact";
  if (layout === "split") return "business";
  if (card === "bordered") return "outline";
  if (card === "flat") return "minimal";
  return "clean";
}

export function resolveCardTemplate(main = {}) {
  if (isCardTemplateId(main.card_template)) return main.card_template;
  return deriveCardTemplate(main.layout_preset, main.card_preset);
}

/** Apply a card template onto main config (canonical + legacy mirrors). */
export function patchMainWithCardTemplate(main, templateId) {
  const id = isCardTemplateId(templateId) ? templateId : "clean";
  const t = CARD_TEMPLATES[id];
  return {
    ...main,
    card_template: id,
    layout_preset: t.layout,
    card_preset: t.card,
  };
}

export function cardTemplateLabel(templateId) {
  return CARD_TEMPLATES[templateId]?.label || "Clean";
}
