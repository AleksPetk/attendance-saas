import { inputTemplateAccent, resolveInputTemplate } from "./inputTemplates.js";
import { hexColor } from "./kioskVisual.js";

const DEFAULT_FALLBACK = "#2563EB";

/**
 * Primary solid color from KioskDesign Header background.
 * Falls back to Check Station / input-template accent when Header config is missing.
 */
export function headerBackgroundPrimaryColor(headerBackground, fallback = DEFAULT_FALLBACK) {
  if (!headerBackground || typeof headerBackground !== "object") {
    return fallback;
  }
  return hexColor(headerBackground.color, fallback);
}

/**
 * Linear gradient string matching Header sectionBackgroundStyle, or null for solid.
 */
export function headerBackgroundGradient(headerBackground) {
  if (!headerBackground || typeof headerBackground !== "object") {
    return null;
  }
  if (headerBackground.mode !== "gradient") {
    return null;
  }
  const color = hexColor(headerBackground.color, null);
  if (!color) {
    return null;
  }
  const color2 = headerBackground.color2 ? hexColor(headerBackground.color2, color) : null;
  if (!color2 || color2 === color) {
    return null;
  }
  const raw = Number(headerBackground.gradient_angle);
  const angle = Number.isFinite(raw) ? Math.min(360, Math.max(0, raw)) : 90;
  return `linear-gradient(${angle}deg, ${color}, ${color2})`;
}

function kioskAccentFallback(config) {
  if (!config?.main) {
    return DEFAULT_FALLBACK;
  }
  const inputTemplate = resolveInputTemplate(config.main);
  return inputTemplateAccent(inputTemplate);
}

/**
 * CSS custom properties for confirmation template accenting.
 * Derived from Header background; uses input-template accent as legacy fallback.
 */
export function confirmationAccentStyleFromHeader(headerBackground, fallbackAccent = DEFAULT_FALLBACK) {
  const accent = headerBackgroundPrimaryColor(headerBackground, fallbackAccent);
  const gradient = headerBackgroundGradient(headerBackground);
  const accent2 =
    headerBackground?.color2 && typeof headerBackground.color2 === "string"
      ? hexColor(headerBackground.color2, accent)
      : accent;

  return {
    "--kc-accent": accent,
    "--kc-accent-2": accent2,
    "--kc-accent-gradient": gradient || accent,
    "--kc-accent-mode": gradient ? "gradient" : "solid",
  };
}

/** Derive confirmation accent CSS vars from full kiosk design config. */
export function confirmationAccentStyleFromDesign(config) {
  const fallback = kioskAccentFallback(config);
  const headerBackground = config?.header?.background;
  return confirmationAccentStyleFromHeader(headerBackground, fallback);
}
