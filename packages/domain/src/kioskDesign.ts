export type KioskBackground = { mode: "solid" | "gradient" | "image" | string; color: string; color2: string | null; gradient_angle: number; [key: string]: unknown };
export type KioskTextEffects = { shadow: boolean; outline: boolean; [key: string]: unknown };
export type KioskTextStyle = { text?: string; font: string; size_rem: number; color: string; effects: KioskTextEffects; [key: string]: unknown };
export type KioskDesignConfig = {
  version: number;
  header: { enabled: boolean; height: number; background: KioskBackground; logo: ({ size?: number; [key: string]: unknown }) | null; alignment: string; title: KioskTextStyle & { text: string }; [key: string]: unknown };
  main: { background: KioskBackground; image_transform: { focal_x: number; focal_y: number; zoom: number; [key: string]: unknown }; overlay: number; layout_preset: string; input_template: string; card_template: string; title: KioskTextStyle & { text: string; alignment: string }; button_preset: string; input_preset: string; card_preset: string; [key: string]: unknown };
  footer: { enabled: boolean; height: number; background: KioskBackground; logo: ({ alignment?: string; size?: number; [key: string]: unknown }) | null; text: KioskTextStyle & { lines: string[]; alignment: string }; [key: string]: unknown };
  [key: string]: unknown;
};
export type KioskDesignDocument = { config: KioskDesignConfig; header_logo_url: string | null; footer_logo_url: string | null; main_background_image_url: string | null; id?: number; created_at?: string; updated_at?: string; [key: string]: unknown };

export const DEFAULT_KIOSK_DESIGN: KioskDesignConfig = {
  version: 1,
  header: { enabled: true, height: 0.12, background: { mode: "solid", color: "#2563EB", color2: null, gradient_angle: 90 }, logo: null, alignment: "left", title: { text: "", font: "inter", size_rem: 1.5, color: "#FFFFFF", effects: { shadow: false, outline: false } } },
  main: { background: { mode: "solid", color: "#FFFFFF", color2: null, gradient_angle: 180 }, image_transform: { focal_x: 0.5, focal_y: 0.5, zoom: 1 }, overlay: 0, layout_preset: "centered", input_template: "clean", card_template: "clean", title: { text: "", font: "inter", size_rem: 2, color: "#111827", alignment: "center", effects: { shadow: false, outline: false } }, button_preset: "rounded", input_preset: "outlined", card_preset: "elevated" },
  footer: { enabled: true, height: 0.06, background: { mode: "solid", color: "#1E293B", color2: null, gradient_angle: 90 }, logo: null, text: { lines: [], alignment: "center", font: "inter", size_rem: 0.875, color: "#94A3B8", effects: { shadow: false, outline: false } } },
};

/** Canonical Card template order (matches Workspace / Desktop Kiosk Editor). */
export const CARD_TEMPLATE_IDS = [
  "clean", "compact", "business", "large_touch", "photo", "minimal", "bold", "glass", "outline", "soft",
  "kids_bubble", "heart_pop", "ticket", "id_badge", "cyber_hex", "polaroid", "sticker_pack", "terminal", "ribbon", "comic",
  "pure", "executive", "welcome", "playground", "active", "pass", "victory", "bare",
] as const;

/** Canonical Input template order (matches Workspace / Desktop Kiosk Editor). */
export const INPUT_TEMPLATE_IDS = [
  "clean", "soft", "bold", "minimal", "outline", "dark", "glass", "rounded", "compact", "large_touch",
  "kids_bubble", "heart_pop", "ticket", "id_badge", "cyber_hex", "polaroid", "sticker_pack", "terminal", "ribbon", "comic",
  "pure", "executive", "welcome", "playground", "active", "pass", "victory", "bare",
] as const;

const CARD_TEMPLATE_PRESETS: Record<string, { layout: string; card: string }> = {
  clean: { layout: "centered", card: "elevated" }, compact: { layout: "compact", card: "flat" }, business: { layout: "split", card: "bordered" }, large_touch: { layout: "large_touch", card: "elevated" }, photo: { layout: "photo_cards", card: "elevated" }, minimal: { layout: "centered", card: "flat" }, outline: { layout: "centered", card: "bordered" }, executive: { layout: "centered", card: "bordered" }, pass: { layout: "centered", card: "bordered" }, bare: { layout: "centered", card: "flat" },
  bold: { layout: "centered", card: "elevated" }, glass: { layout: "centered", card: "elevated" }, soft: { layout: "centered", card: "elevated" }, kids_bubble: { layout: "centered", card: "elevated" }, heart_pop: { layout: "centered", card: "elevated" }, ticket: { layout: "centered", card: "bordered" }, id_badge: { layout: "centered", card: "elevated" }, cyber_hex: { layout: "centered", card: "elevated" }, polaroid: { layout: "centered", card: "elevated" }, sticker_pack: { layout: "centered", card: "elevated" }, terminal: { layout: "centered", card: "elevated" }, ribbon: { layout: "centered", card: "elevated" }, comic: { layout: "centered", card: "elevated" }, pure: { layout: "centered", card: "elevated" }, welcome: { layout: "centered", card: "elevated" }, playground: { layout: "centered", card: "elevated" }, active: { layout: "centered", card: "elevated" }, victory: { layout: "centered", card: "elevated" },
};

const INPUT_TEMPLATE_PRESETS: Record<string, { layout: string; button: string; input: string; accent: string }> = {
  clean: { layout: "centered", button: "rounded", input: "outlined", accent: "#2563EB" },
  soft: { layout: "centered", button: "pill", input: "filled", accent: "#3B82F6" },
  bold: { layout: "centered", button: "flat", input: "outlined", accent: "#0F172A" },
  minimal: { layout: "centered", button: "flat", input: "minimal", accent: "#334155" },
  outline: { layout: "centered", button: "rounded", input: "outlined", accent: "#2563EB" },
  dark: { layout: "centered", button: "rounded", input: "filled", accent: "#38BDF8" },
  glass: { layout: "centered", button: "pill", input: "outlined", accent: "#67E8F9" },
  rounded: { layout: "centered", button: "rounded", input: "filled", accent: "#2563EB" },
  compact: { layout: "compact", button: "rounded", input: "outlined", accent: "#2563EB" },
  large_touch: { layout: "large_touch", button: "rounded", input: "outlined", accent: "#2563EB" },
  kids_bubble: { layout: "centered", button: "pill", input: "filled", accent: "#F472B6" },
  heart_pop: { layout: "centered", button: "pill", input: "filled", accent: "#FB7185" },
  ticket: { layout: "centered", button: "rounded", input: "outlined", accent: "#0EA5E9" },
  id_badge: { layout: "centered", button: "flat", input: "outlined", accent: "#1D4ED8" },
  cyber_hex: { layout: "centered", button: "flat", input: "filled", accent: "#22D3EE" },
  polaroid: { layout: "centered", button: "rounded", input: "outlined", accent: "#F59E0B" },
  sticker_pack: { layout: "centered", button: "pill", input: "filled", accent: "#A855F7" },
  terminal: { layout: "centered", button: "flat", input: "minimal", accent: "#22C55E" },
  ribbon: { layout: "centered", button: "rounded", input: "outlined", accent: "#DC2626" },
  comic: { layout: "centered", button: "flat", input: "outlined", accent: "#FACC15" },
  pure: { layout: "centered", button: "flat", input: "minimal", accent: "#64748B" },
  executive: { layout: "centered", button: "rounded", input: "outlined", accent: "#0F172A" },
  welcome: { layout: "centered", button: "rounded", input: "filled", accent: "#2563EB" },
  playground: { layout: "centered", button: "pill", input: "filled", accent: "#7C3AED" },
  active: { layout: "centered", button: "flat", input: "outlined", accent: "#DC2626" },
  pass: { layout: "centered", button: "rounded", input: "outlined", accent: "#0284C7" },
  victory: { layout: "centered", button: "rounded", input: "filled", accent: "#CA8A04" },
  bare: { layout: "centered", button: "flat", input: "minimal", accent: "#475569" },
};

/** Apply a card template onto main config (canonical + legacy mirrors). */
export function patchMainWithCardTemplate(
  main: KioskDesignConfig["main"],
  templateId: string,
): KioskDesignConfig["main"] {
  const id = CARD_TEMPLATE_PRESETS[templateId] ? templateId : "clean";
  const preset = CARD_TEMPLATE_PRESETS[id];
  return { ...main, card_template: id, layout_preset: preset.layout, card_preset: preset.card };
}

/** Apply an input template onto main config (canonical + legacy mirrors). */
export function patchMainWithInputTemplate(
  main: KioskDesignConfig["main"],
  templateId: string,
): KioskDesignConfig["main"] {
  const id = INPUT_TEMPLATE_PRESETS[templateId] ? templateId : "clean";
  const preset = INPUT_TEMPLATE_PRESETS[id];
  return {
    ...main,
    input_template: id,
    layout_preset: preset.layout,
    button_preset: preset.button,
    input_preset: preset.input,
  };
}

export function inputTemplateAccent(templateId: string): string {
  return INPUT_TEMPLATE_PRESETS[templateId]?.accent || "#2563EB";
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function mergePreservingSource(base: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> { const result = clone(base); for (const [key, value] of Object.entries(source)) { const baseline = object(base[key]); if (Object.keys(baseline).length) { result[key] = value && typeof value === "object" && !Array.isArray(value) ? mergePreservingSource(baseline, object(value)) : clone(base[key]); } else { result[key] = clone(value); } } return result; }

/** Apply canonical defaults beneath the server object without dropping any saved fields. */
export function normalizeKioskDesignConfig(value: unknown): KioskDesignConfig { const envelope = object(value); const nested = object(envelope.config); const source = Object.keys(nested).length ? nested : envelope; return mergePreservingSource(DEFAULT_KIOSK_DESIGN as unknown as Record<string, unknown>, source) as KioskDesignConfig; }
export function normalizeKioskDesignDocument(value: unknown): KioskDesignDocument { const source = object(value); return { ...source, config: normalizeKioskDesignConfig(source), header_logo_url: typeof source.header_logo_url === "string" ? source.header_logo_url : null, footer_logo_url: typeof source.footer_logo_url === "string" ? source.footer_logo_url : null, main_background_image_url: typeof source.main_background_image_url === "string" ? source.main_background_image_url : null } as KioskDesignDocument; }
export function patchKioskDesignConfig(config: KioskDesignConfig, path: string, value: unknown): KioskDesignConfig { const next = clone(config) as unknown as Record<string, unknown>; const parts = path.split("."); let cursor = next; for (const part of parts.slice(0, -1)) { const child = object(cursor[part]); cursor[part] = child; cursor = child; } cursor[parts[parts.length - 1]] = value; return next as unknown as KioskDesignConfig; }
export function resolveKioskCardTemplate(main: KioskDesignConfig["main"]): { id: string; layout: string; card: string } { const id = typeof main.card_template === "string" && main.card_template ? main.card_template : "clean"; const preset = CARD_TEMPLATE_PRESETS[id]; return { id, layout: preset?.layout || main.layout_preset || "centered", card: preset?.card || main.card_preset || "elevated" }; }
export function kioskOverlayColor(value: unknown): string | null { const numeric = Number(value); if (!Number.isFinite(numeric) || numeric === 0) return null; const opacity = Math.min(1, Math.abs(numeric)) * 0.55; return numeric < 0 ? `rgba(0,0,0,${opacity})` : `rgba(255,255,255,${opacity})`; }
export function kioskCssBackground(background: KioskBackground): string { return background.mode === "gradient" && background.color2 ? `linear-gradient(${background.gradient_angle}deg, ${background.color}, ${background.color2})` : background.color; }
export function kioskCssFontFamily(identifier: string): string { const families: Record<string, string> = { inter: '"CS Inter", system-ui, sans-serif', roboto: '"CS Roboto", system-ui, sans-serif', source_sans: '"CS Source Sans 3", system-ui, sans-serif', open_sans: '"CS Source Sans 3", system-ui, sans-serif', lato: '"CS Inter", system-ui, sans-serif', poppins: '"CS Poppins", system-ui, sans-serif', nunito: '"CS Nunito", system-ui, sans-serif', merriweather: '"CS Merriweather", Georgia, serif' }; return families[identifier] || families.inter; }
