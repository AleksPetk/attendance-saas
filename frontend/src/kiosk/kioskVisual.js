import { kioskFontFamily } from "./kioskFonts.js";

export const OVERLAY_MAX_OPACITY = 0.55;

/** Shared Header/Footer height fractions.
 * Deprecated for layout rendering — Header/Footer now use automatic CSS clamps.
 * Retained for config schema defaults / migration compatibility only.
 */
export const HEADER_HEIGHT_MIN = 0.07;
export const HEADER_HEIGHT_MAX = 0.22;
export const FOOTER_HEIGHT_MIN = 0.06;
export const FOOTER_HEIGHT_MAX = 0.16;
export const MAIN_MIN_FRACTION = 0.52;
export const HEADER_MIN_REM = 3.25;
export const FOOTER_MIN_REM = 2.75;

/** Automatic section heights (Builder / Live). */
export const HEADER_HEIGHT_CSS = "clamp(72px, 13vh, 130px)";
export const FOOTER_HEIGHT_CSS = "clamp(48px, 8vh, 82px)";

export function hexColor(value, fallback = "#111827") {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toUpperCase();
  }
  if (typeof value === "string" && /^#[0-9a-fA-F]{3}$/.test(value)) {
    const h = value.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  return fallback;
}

export function sectionBackgroundStyle(background) {
  if (!background || typeof background !== "object") {
    return { backgroundColor: "#ffffff" };
  }
  const color = hexColor(background.color, "#ffffff");
  const color2 = background.color2 ? hexColor(background.color2, color) : null;
  if (background.mode === "gradient" && color2) {
    const raw = Number(background.gradient_angle);
    const angle = Number.isFinite(raw) ? Math.min(360, Math.max(0, raw)) : 90;
    return {
      backgroundColor: color,
      backgroundImage: `linear-gradient(${angle}deg, ${color}, ${color2})`,
    };
  }
  return { backgroundColor: color };
}

/**
 * Cover + focal + zoom for the Main background image.
 *
 * zoom=1 is CSS object-fit:cover (minimum cover, no blank edges).
 * zoom>1 scales the already-covered image around the focal point.
 * object-position places the focal point; overflow:hidden on the parent
 * clips the scaled result so uncovered edges never appear.
 */
export function mainImageCoverStyle(transform) {
  const focalX = clamp01(transform?.focal_x, 0.5);
  const focalY = clamp01(transform?.focal_y, 0.5);
  const zoom = Math.min(5, Math.max(1, Number(transform?.zoom) || 1));
  return {
    objectFit: "cover",
    objectPosition: `${focalX * 100}% ${focalY * 100}%`,
    transform: zoom === 1 ? undefined : `scale(${zoom})`,
    transformOrigin: `${focalX * 100}% ${focalY * 100}%`,
  };
}

export function overlayLayerStyle(overlay) {
  const value = Number(overlay);
  if (!Number.isFinite(value) || value === 0) {
    return null;
  }
  const magnitude = Math.min(1, Math.abs(value));
  const opacity = magnitude * OVERLAY_MAX_OPACITY;
  const channel = value < 0 ? "0, 0, 0" : "255, 255, 255";
  return { backgroundColor: `rgba(${channel}, ${opacity})` };
}

export function textStyle(textConfig) {
  if (!textConfig) return {};
  return {
    color: hexColor(textConfig.color, "#111827"),
    fontFamily: kioskFontFamily(textConfig.font),
    "--kr-size-rem": String(Number(textConfig.size_rem) || 1),
  };
}

export function textEffectClassName(effects) {
  const names = ["kr-text"];
  if (effects?.shadow) names.push("kr-text-shadow");
  if (effects?.outline) names.push("kr-text-outline");
  return names.join(" ");
}

/**
 * @deprecated Legacy fraction-based section height helper.
 * Header/Footer now use automatic CSS clamps; do not use for new layout.
 */
export function sectionHeightCss(fraction, { minRem, maxFraction, minFraction, fallback }) {
  const value = Number(fraction);
  const max = Number(maxFraction);
  const minF = Number.isFinite(Number(minFraction)) ? Number(minFraction) : 0.04;
  const safeMax = Number.isFinite(max) ? max : 0.22;
  const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : 0.1;
  const safe = Number.isFinite(value)
    ? Math.min(safeMax, Math.max(minF, value))
    : safeFallback;
  return `clamp(${minRem}rem, ${safe * 100}dvh, ${safeMax * 100}dvh)`;
}

function clamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}
