export type KioskDesignConfig = {
  version?: number;
  header: { enabled: boolean; alignment: string; background: Background; title: TextStyle };
  main: { background: Background; title: TextStyle & { alignment: string }; layout_preset: string; card_template: string; input_template: string; card_preset: string; button_preset: string; input_preset: string; [key: string]: unknown };
  footer: { enabled: boolean; background: Background; text: TextStyle & { lines: string[]; alignment: string } };
  [key: string]: unknown;
};
export type Background = { mode: string; color: string; color2: string | null; gradient_angle: number; [key: string]: unknown };
export type TextStyle = { text?: string; font: string; size_rem: number; color: string; effects: Record<string, unknown>; [key: string]: unknown };
const defaults: KioskDesignConfig = {
  version: 1,
  header: { enabled: true, alignment: "left", background: { mode: "solid", color: "#2563EB", color2: null, gradient_angle: 90 }, title: { text: "", font: "inter", size_rem: 1.5, color: "#FFFFFF", effects: { shadow: false, outline: false } } },
  main: { background: { mode: "solid", color: "#FFFFFF", color2: null, gradient_angle: 180 }, title: { text: "", font: "inter", size_rem: 2, color: "#111827", alignment: "center", effects: { shadow: false, outline: false } }, layout_preset: "centered", card_template: "clean", input_template: "clean", card_preset: "elevated", button_preset: "rounded", input_preset: "outlined" },
  footer: { enabled: true, background: { mode: "solid", color: "#1E293B", color2: null, gradient_angle: 90 }, text: { lines: [], alignment: "center", font: "inter", size_rem: .875, color: "#94A3B8", effects: { shadow: false, outline: false } } },
};
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function merge(base: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> { const result = { ...base }; for (const [key,value] of Object.entries(source)) { const baseline = base[key]; result[key] = Object.keys(object(baseline)).length && Object.keys(object(value)).length ? merge(object(baseline),object(value)) : value; } return result; }
export function normalizeKioskDesign(value: unknown): KioskDesignConfig { const envelope = object(value); const source = Object.keys(object(envelope.config)).length ? object(envelope.config) : envelope; return merge(defaults as unknown as Record<string, unknown>,source) as unknown as KioskDesignConfig; }
export function patchKioskDesign(config: KioskDesignConfig, path: string, value: unknown): KioskDesignConfig { const next = JSON.parse(JSON.stringify(config)) as Record<string, unknown>; const parts = path.split("."); let cursor = next; for (const part of parts.slice(0,-1)) cursor = cursor[part] as Record<string,unknown>; cursor[parts.at(-1)!] = value; return next as unknown as KioskDesignConfig; }
export function cssBackground(background: Background) { return background.mode === "gradient" && background.color2 ? `linear-gradient(${background.gradient_angle}deg,${background.color},${background.color2})` : background.color; }
