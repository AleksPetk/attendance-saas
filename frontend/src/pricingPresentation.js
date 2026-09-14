/**
 * Structured view of the Workspace/Desktop plan-card and promotional-text
 * presentation already defined in CSS. Admin selects a key; clients resolve
 * these tokens. Do not add a parallel theme.
 */
import { pricingTemplateKey } from "./pricingTemplates.js";
import {
  catalogPromotionalText,
  promotionalTextStyleKey,
} from "./promotionalText.js";

const GRADIENT_150 = gradientEnds(150);
const GRADIENT_135 = gradientEnds(135);

const NORMAL = {
  borderColor: "#e2e8f0",
  textColor: "#334155",
  headingColor: "#0f172a",
  mutedColor: "#64748b",
  periodColor: "#334155",
  listPriceColor: "#64748b",
  badgeColor: "#334155",
  recommendedBadgeColor: "#2563eb",
  background: ["#f1f5f9", "#f1f5f9"],
  featuredBackground: ["#ffffff", "#ffffff"],
  recommendedBackground: ["#f2f6fe", "#f2f6fe"],
  currentBorderColor: "rgba(15, 23, 42, 0.35)",
  recommendedBorderColor: "#8dacee",
  shadowColor: "transparent",
  currentShadowColor: "rgba(15, 23, 42, 0.08)",
  button: {
    borderColor: "transparent",
    colors: ["#2563eb", "#22d3ee"],
    textColor: "#ffffff",
    ends: GRADIENT_135,
  },
};

const CARDS = {
  normal: NORMAL,
  spring: seasonCard({
    borderColor: "rgba(196, 103, 139, 0.32)",
    featuredBorderColor: "rgba(181, 75, 121, 0.62)",
    textColor: "#6d4559",
    headingColor: "#5c2944",
    accentColor: "#b34c7d",
    shadowColor: "rgba(113, 52, 78, 0.07)",
    background: ["#fffdfd", "#fff6f9"],
    featuredBackground: ["#fffdfd", "#ffeff5"],
    accent: "rgba(218, 139, 178, 0.16)",
    featuredAccent: "rgba(218, 139, 178, 0.23)",
    button: ["#d85f91", "#f0a17d"],
    buttonBorder: "#d06d94",
  }),
  summer: seasonCard({
    borderColor: "rgba(22, 155, 181, 0.32)",
    featuredBorderColor: "rgba(13, 133, 166, 0.62)",
    textColor: "#365b64",
    headingColor: "#164e63",
    accentColor: "#147f9d",
    shadowColor: "rgba(15, 93, 111, 0.07)",
    background: ["#fffdf7", "#fff8e9"],
    featuredBackground: ["#fffdf6", "#fff2d9"],
    accent: "rgba(247, 185, 58, 0.18)",
    featuredAccent: "rgba(247, 185, 58, 0.26)",
    button: ["#187bbb", "#25c5c4"],
    buttonBorder: "#198fae",
  }),
  autumn: seasonCard({
    borderColor: "rgba(174, 92, 38, 0.32)",
    featuredBorderColor: "rgba(166, 83, 39, 0.62)",
    textColor: "#532b1a",
    headingColor: "#532b1a",
    accentColor: "#a04d22",
    shadowColor: "rgba(111, 57, 24, 0.07)",
    background: ["#fffdf8", "#fff7ea"],
    featuredBackground: ["#fffdf8", "#fff2df"],
    accent: "rgba(232, 170, 82, 0.14)",
    featuredAccent: "rgba(232, 170, 82, 0.2)",
    button: ["#8e3f1d", "#c76a28"],
    buttonBorder: "#a65327",
  }),
  winter: seasonCard({
    borderColor: "rgba(72, 135, 181, 0.32)",
    featuredBorderColor: "rgba(35, 103, 156, 0.62)",
    textColor: "#405a70",
    headingColor: "#153b60",
    accentColor: "#226f9f",
    shadowColor: "rgba(25, 67, 105, 0.07)",
    background: ["#ffffff", "#eff8fd"],
    featuredBackground: ["#ffffff", "#e6f5fc"],
    accent: "rgba(69, 139, 190, 0.08)",
    featuredAccent: "rgba(69, 139, 190, 0.12)",
    button: ["#123d77", "#36bdd5"],
    buttonBorder: "#2879ad",
  }),
  halloween: eventCard({
    borderColor: "rgba(232, 113, 35, 0.4)",
    featuredBorderColor: "rgba(176, 91, 225, 0.72)",
    textColor: "#eee5f4",
    headingColor: "#fff8ef",
    mutedColor: "#c9b9d5",
    accentColor: "#ff9a3c",
    shadowColor: "rgba(19, 7, 29, 0.2)",
    background: ["#100b17", "#21112c"],
    featuredBackground: ["#120b1b", "#2a1237"],
    accent: "rgba(255, 171, 71, 0.16)",
    featuredAccent: "rgba(255, 171, 71, 0.24)",
    button: ["#f97316", "#8b3bd1"],
    buttonBorder: "#e8792d",
    buttonText: "#ffffff",
  }),
  christmas_new_year: eventCard({
    borderColor: "rgba(211, 173, 72, 0.42)",
    featuredBorderColor: "rgba(202, 51, 65, 0.72)",
    textColor: "#edf7f1",
    headingColor: "#fffdf5",
    mutedColor: "#c1d4c8",
    accentColor: "#e2b751",
    shadowColor: "rgba(5, 46, 34, 0.19)",
    background: ["#08241b", "#103a2a"],
    featuredBackground: ["#08261c", "#124531"],
    accent: "rgba(255, 255, 255, 0.14)",
    featuredAccent: "rgba(239, 198, 89, 0.18)",
    button: ["#a51f32", "#d2a544", "#176b50"],
    buttonBorder: "#d0a542",
    buttonText: "#ffffff",
  }),
  black_friday: eventCard({
    borderColor: "rgba(255, 255, 255, 0.2)",
    featuredBorderColor: "rgba(44, 205, 255, 0.88)",
    textColor: "#f3f5f7",
    headingColor: "#ffffff",
    mutedColor: "#c4cad1",
    accentColor: "#50d7ff",
    shadowColor: "rgba(0, 0, 0, 0.27)",
    background: ["#050607", "#14171b"],
    featuredBackground: ["#030405", "#15191e"],
    accent: "rgba(255, 255, 255, 0.06)",
    featuredAccent: "rgba(38, 200, 255, 0.18)",
    button: ["#0b79ee", "#20c9f2", "#754dff"],
    buttonBorder: "#31cfff",
    buttonText: "#ffffff",
  }),
};

const PROMO_STYLES = {
  normal: { color: "#0f172a", fontWeight: "700", letterSpacingEm: 0, textTransform: "none", fontStyle: "normal", font: "sans" },
  spring: { color: "#c25787", fontWeight: "700", letterSpacingEm: -0.025, textTransform: "none", fontStyle: "normal", font: "serif", shadow: "rgba(205, 93, 143, 0.2)", gradient: ["#b84f82", "#dc82a8", "#9b83cf"] },
  summer: { color: "#087f9c", fontWeight: "800", letterSpacingEm: 0, textTransform: "none", fontStyle: "normal", font: "sans", shadow: "rgba(20, 170, 190, 0.2)", gradient: ["#147db1", "#1cb9c4", "#e0a92d"] },
  autumn: { color: "#b85a1b", fontWeight: "700", letterSpacingEm: 0, textTransform: "none", fontStyle: "normal", font: "serif", shadow: "rgba(190, 91, 24, 0.22)", gradient: ["#9b421e", "#db7a29", "#e5aa36"] },
  winter: { color: "#236c9c", fontWeight: "800", letterSpacingEm: -0.03, textTransform: "none", fontStyle: "normal", font: "sans", shadow: "rgba(66, 177, 215, 0.24)", gradient: ["#174c7b", "#2d89ba", "#67cee2"] },
  halloween: { color: "#873bd0", fontWeight: "800", letterSpacingEm: -0.025, textTransform: "none", fontStyle: "normal", font: "sans", shadow: "rgba(139, 59, 209, 0.25)", gradient: ["#7029ba", "#a94cbd", "#f47a1f"] },
  christmas_new_year: { color: "#a52334", fontWeight: "700", letterSpacingEm: 0, textTransform: "none", fontStyle: "normal", font: "serif", shadow: "rgba(210, 165, 68, 0.2)", gradient: ["#9e2234", "#cf9f35", "#176c50"] },
  black_friday: { color: "#101317", fontWeight: "800", letterSpacingEm: 0.015, textTransform: "uppercase", fontStyle: "normal", font: "sans", shadow: "rgba(35, 198, 255, 0.23)", gradient: ["#050607", "#363d45", "#0eaee8"] },
  luxury_gold: { color: "#a67c25", fontWeight: "700", letterSpacingEm: 0.012, textTransform: "none", fontStyle: "normal", font: "serif", shadow: "rgba(5, 20, 42, 0.22)", gradient: ["#07172f", "#b78b2f", "#f0d37c", "#8b651d"] },
  cyberpunk: { color: "#00aeca", fontWeight: "800", letterSpacingEm: 0.045, textTransform: "uppercase", fontStyle: "italic", font: "sans", shadow: "rgba(91, 47, 255, 0.3)", gradient: ["#00dff5", "#267dff", "#cf32d6", "#ff3cac"] },
  retro_sale: { color: "#b3302f", fontWeight: "800", letterSpacingEm: -0.015, textTransform: "uppercase", fontStyle: "normal", font: "sans", shadow: "#d7a72f", gradient: ["#a9292a", "#d24a36", "#f1dfae", "#c29426"] },
  dark_fantasy: { color: "#66707a", fontWeight: "700", letterSpacingEm: 0.015, textTransform: "uppercase", fontStyle: "normal", font: "serif", shadow: "rgba(13, 16, 20, 0.24)", gradient: ["#252a2f", "#aeb5b9", "#5d656c", "#741e28"] },
  editorial: { color: "#17191c", fontWeight: "400", letterSpacingEm: -0.045, textTransform: "none", fontStyle: "normal", font: "serif", lineHeight: 1.08 },
  impact_sale: { color: "#d51f2b", fontWeight: "800", letterSpacingEm: 0.018, textTransform: "uppercase", fontStyle: "normal", font: "impact", shadow: "#111216", gradient: ["#cf1724", "#ffffff", "#111216", "#e12631"] },
  arcade: { color: "#1689ff", fontWeight: "800", letterSpacingEm: 0.055, textTransform: "uppercase", fontStyle: "normal", font: "mono", shadow: "#7446e8", gradient: ["#087df2", "#4267ff", "#814de8", "#8dde2f"] },
};

export function planCardPresentation(catalog, flags = {}) {
  const key = pricingTemplateKey(catalog);
  const spec = CARDS[key] || CARDS.normal;
  const featured = Boolean(flags.current || flags.selectedFuture || flags.recommended);
  const recommended = Boolean(flags.recommended && !flags.current && !flags.selectedFuture);
  const background = recommended && spec.recommendedBackground
    ? spec.recommendedBackground
    : featured
      ? spec.featuredBackground
      : spec.background;
  const borderColor = flags.current || flags.selectedFuture
    ? spec.currentBorderColor || spec.featuredBorderColor || spec.borderColor
    : recommended
      ? spec.recommendedBorderColor || spec.featuredBorderColor || spec.borderColor
      : spec.borderColor;
  return {
    key,
    background,
    ends: GRADIENT_150,
    accent: featured ? spec.featuredAccent || spec.accent || null : spec.accent || null,
    borderColor,
    borderStyle: flags.scheduled ? "dashed" : "solid",
    textColor: spec.textColor,
    headingColor: spec.headingColor,
    periodColor: spec.periodColor || spec.textColor,
    listPriceColor: spec.listPriceColor || spec.mutedColor || spec.textColor,
    noteColor: spec.mutedColor || spec.periodColor || spec.textColor,
    badgeColor: spec.badgeColor || spec.mutedColor || spec.textColor,
    recommendedBadgeColor: spec.recommendedBadgeColor || spec.accentColor || spec.headingColor,
    shadowColor: featured && spec.currentShadowColor ? spec.currentShadowColor : spec.shadowColor,
    button: spec.button,
  };
}

export function promotionalHeadlinePresentation(catalog) {
  const text = catalogPromotionalText(catalog);
  const key = promotionalTextStyleKey(catalog);
  const style = PROMO_STYLES[key] || PROMO_STYLES.normal;
  return { text, key, ...style };
}

export const pricingPresentationCardKeys = Object.keys(CARDS);
export const pricingPresentationPromoKeys = Object.keys(PROMO_STYLES);

function seasonCard(spec) {
  return {
    ...spec,
    background: spec.background,
    featuredBackground: spec.featuredBackground,
    periodColor: "#334155",
    listPriceColor: "#64748b",
    badgeColor: "#334155",
    recommendedBadgeColor: spec.accentColor,
    button: {
      borderColor: spec.buttonBorder,
      colors: spec.button,
      textColor: "#ffffff",
      ends: GRADIENT_135,
    },
  };
}

function eventCard(spec) {
  return {
    ...spec,
    periodColor: spec.mutedColor,
    listPriceColor: spec.mutedColor,
    badgeColor: spec.mutedColor,
    recommendedBadgeColor: spec.accentColor,
    button: {
      borderColor: spec.buttonBorder,
      colors: spec.button,
      textColor: spec.buttonText,
      ends: GRADIENT_135,
    },
  };
}

function gradientEnds(angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  return {
    start: { x: round(0.5 - dx / 2), y: round(0.5 - dy / 2) },
    end: { x: round(0.5 + dx / 2), y: round(0.5 + dy / 2) },
  };
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
