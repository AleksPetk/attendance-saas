import { createElement } from "react";

export const DEFAULT_PROMOTIONAL_TEXT_STYLE = "normal";

const PROMOTIONAL_TEXT_STYLES = new Set([
  DEFAULT_PROMOTIONAL_TEXT_STYLE,
  "spring",
  "summer",
  "autumn",
  "winter",
  "halloween",
  "christmas_new_year",
  "black_friday",
  "luxury_gold",
  "cyberpunk",
  "retro_sale",
  "dark_fantasy",
  "editorial",
  "impact_sale",
  "arcade",
]);

export function promotionalTextStyleKey(catalog) {
  const style = catalog?.promotional_text?.style;
  const candidate = typeof style === "string" ? style : style?.key;
  return PROMOTIONAL_TEXT_STYLES.has(candidate)
    ? candidate
    : DEFAULT_PROMOTIONAL_TEXT_STYLE;
}

export function catalogPromotionalText(catalog) {
  const setting = catalog?.promotional_text;
  if (!setting?.enabled) return "";
  const text = typeof setting.text === "string" ? setting.text : "";
  return text.trim() ? text : "";
}

export function PromotionalText({ catalog, className = "" }) {
  const text = catalogPromotionalText(catalog);
  if (!text) return null;
  const styleClass = `promotional-text-style-${promotionalTextStyleKey(catalog)}`;
  return createElement(
    "p",
    { className: `${className} ${styleClass}`.trim(), role: "status" },
    text,
  );
}
