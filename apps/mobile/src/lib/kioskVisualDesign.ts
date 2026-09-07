type Background = {
  mode: string;
  color: string;
  color2: string | null;
  gradient_angle: number;
};

type TextEffects = { shadow: boolean; outline: boolean; [key: string]: unknown };

export type KioskVisualDesign = {
  header: {
    enabled: boolean;
    height: number;
    background: Background;
    logo: Record<string, unknown> | null;
    alignment: string;
    title: { text: string; font: string; size_rem: number; color: string; effects: TextEffects };
  };
  main: {
    background: Background;
    image_transform: { focal_x: number; focal_y: number; zoom: number };
    overlay: number;
    layout_preset: string;
    input_template: string;
    card_template: string;
    title: { text: string; font: string; size_rem: number; color: string; alignment: string; effects: TextEffects };
    button_preset: string;
    input_preset: string;
    card_preset: string;
  };
  footer: {
    enabled: boolean;
    height: number;
    background: Background;
    logo: Record<string, unknown> | null;
    text: { lines: string[]; alignment: string; font: string; size_rem: number; color: string; effects: TextEffects };
  };
};

const DEFAULT_DESIGN: KioskVisualDesign = {
  header: {
    enabled: true,
    height: 0.12,
    background: { mode: "solid", color: "#2563EB", color2: null, gradient_angle: 90 },
    logo: null,
    alignment: "left",
    title: { text: "", font: "inter", size_rem: 1.5, color: "#FFFFFF", effects: { shadow: false, outline: false } },
  },
  main: {
    background: { mode: "solid", color: "#FFFFFF", color2: null, gradient_angle: 180 },
    image_transform: { focal_x: 0.5, focal_y: 0.5, zoom: 1 },
    overlay: 0,
    layout_preset: "centered",
    input_template: "clean",
    card_template: "clean",
    title: { text: "", font: "inter", size_rem: 2, color: "#111827", alignment: "center", effects: { shadow: false, outline: false } },
    button_preset: "rounded",
    input_preset: "outlined",
    card_preset: "elevated",
  },
  footer: {
    enabled: true,
    height: 0.06,
    background: { mode: "solid", color: "#1E293B", color2: null, gradient_angle: 90 },
    logo: null,
    text: { lines: [], alignment: "center", font: "inter", size_rem: 0.875, color: "#94A3B8", effects: { shadow: false, outline: false } },
  },
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableStringValue(value: unknown, fallback: string | null): string | null {
  if (value === null) return null;
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function background(value: unknown, fallback: Background): Background {
  const source = record(value);
  return {
    mode: stringValue(source.mode, fallback.mode),
    color: stringValue(source.color, fallback.color),
    color2: nullableStringValue(source.color2, fallback.color2),
    gradient_angle: numberValue(source.gradient_angle, fallback.gradient_angle),
  };
}

function effects(value: unknown, fallback: TextEffects): TextEffects {
  const source = record(value);
  return {
    ...source,
    shadow: booleanValue(source.shadow, fallback.shadow),
    outline: booleanValue(source.outline, fallback.outline),
  };
}

function logo(value: unknown, fallback: Record<string, unknown> | null): Record<string, unknown> | null {
  if (value === null) return null;
  const source = record(value);
  return Object.keys(source).length ? source : fallback;
}

/**
 * The live kiosk endpoint returns visual_design as
 * { config, header_logo_url, footer_logo_url, main_background_image_url }.
 * Normalize only the config while retaining every saved value that is present.
 */
export function normalizeKioskVisualDesign(value: unknown): KioskVisualDesign {
  const envelope = record(value);
  const source = Object.keys(record(envelope.config)).length ? record(envelope.config) : envelope;
  const header = record(source.header);
  const main = record(source.main);
  const footer = record(source.footer);
  const headerTitle = record(header.title);
  const mainTitle = record(main.title);
  const footerText = record(footer.text);
  const transform = record(main.image_transform);

  return {
    header: {
      enabled: booleanValue(header.enabled, DEFAULT_DESIGN.header.enabled),
      height: numberValue(header.height, DEFAULT_DESIGN.header.height),
      background: background(header.background, DEFAULT_DESIGN.header.background),
      logo: logo(header.logo, DEFAULT_DESIGN.header.logo),
      alignment: stringValue(header.alignment, DEFAULT_DESIGN.header.alignment),
      title: {
        text: stringValue(headerTitle.text, DEFAULT_DESIGN.header.title.text),
        font: stringValue(headerTitle.font, DEFAULT_DESIGN.header.title.font),
        size_rem: numberValue(headerTitle.size_rem, DEFAULT_DESIGN.header.title.size_rem),
        color: stringValue(headerTitle.color, DEFAULT_DESIGN.header.title.color),
        effects: effects(headerTitle.effects, DEFAULT_DESIGN.header.title.effects),
      },
    },
    main: {
      background: background(main.background, DEFAULT_DESIGN.main.background),
      image_transform: {
        focal_x: numberValue(transform.focal_x, DEFAULT_DESIGN.main.image_transform.focal_x),
        focal_y: numberValue(transform.focal_y, DEFAULT_DESIGN.main.image_transform.focal_y),
        zoom: numberValue(transform.zoom, DEFAULT_DESIGN.main.image_transform.zoom),
      },
      overlay: numberValue(main.overlay, DEFAULT_DESIGN.main.overlay),
      layout_preset: stringValue(main.layout_preset, DEFAULT_DESIGN.main.layout_preset),
      input_template: stringValue(main.input_template, DEFAULT_DESIGN.main.input_template),
      card_template: stringValue(main.card_template, DEFAULT_DESIGN.main.card_template),
      title: {
        text: stringValue(mainTitle.text, DEFAULT_DESIGN.main.title.text),
        font: stringValue(mainTitle.font, DEFAULT_DESIGN.main.title.font),
        size_rem: numberValue(mainTitle.size_rem, DEFAULT_DESIGN.main.title.size_rem),
        color: stringValue(mainTitle.color, DEFAULT_DESIGN.main.title.color),
        alignment: stringValue(mainTitle.alignment, DEFAULT_DESIGN.main.title.alignment),
        effects: effects(mainTitle.effects, DEFAULT_DESIGN.main.title.effects),
      },
      button_preset: stringValue(main.button_preset, DEFAULT_DESIGN.main.button_preset),
      input_preset: stringValue(main.input_preset, DEFAULT_DESIGN.main.input_preset),
      card_preset: stringValue(main.card_preset, DEFAULT_DESIGN.main.card_preset),
    },
    footer: {
      enabled: booleanValue(footer.enabled, DEFAULT_DESIGN.footer.enabled),
      height: numberValue(footer.height, DEFAULT_DESIGN.footer.height),
      background: background(footer.background, DEFAULT_DESIGN.footer.background),
      logo: logo(footer.logo, DEFAULT_DESIGN.footer.logo),
      text: {
        lines: Array.isArray(footerText.lines) ? footerText.lines.filter((line): line is string => typeof line === "string") : DEFAULT_DESIGN.footer.text.lines,
        alignment: stringValue(footerText.alignment, DEFAULT_DESIGN.footer.text.alignment),
        font: stringValue(footerText.font, DEFAULT_DESIGN.footer.text.font),
        size_rem: numberValue(footerText.size_rem, DEFAULT_DESIGN.footer.text.size_rem),
        color: stringValue(footerText.color, DEFAULT_DESIGN.footer.text.color),
        effects: effects(footerText.effects, DEFAULT_DESIGN.footer.text.effects),
      },
    },
  };
}
