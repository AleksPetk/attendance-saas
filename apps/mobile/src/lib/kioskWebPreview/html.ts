import {
  inputTemplateAccent,
  kioskOverlayColor,
  resolveKioskCardTemplate,
  type KioskDesignDocument,
  type KioskVisualDesign,
} from "../kioskVisualDesign";
import { KIOSK_WEB_PREVIEW_CSS } from "./bundledCss";
import { KIOSK_FLOW_PANELS_CSS } from "./flowPanelsCss";
import type { KioskViewportProfile } from "../kioskEditorLayout";

export type PreviewPerson = { name: string; code: string; email: string; id?: string; photoUrl?: string | null };
export type PreviewMedia = {
  headerLogoUrl?: string;
  footerLogoUrl?: string;
  backgroundUrl?: string;
};

const ACCENTS: Record<string, string> = {
  clean: "#2563EB", soft: "#3B82F6", bold: "#0F172A", minimal: "#334155",
  outline: "#2563EB", dark: "#38BDF8", glass: "#2563EB", rounded: "#4F46E5",
  compact: "#2563EB", large_touch: "#2563EB", kids_bubble: "#A855F7",
  heart_pop: "#FB7185", ticket: "#2563EB", id_badge: "#2563EB", cyber_hex: "#22D3EE",
  polaroid: "#2563EB", sticker_pack: "#F59E0B", terminal: "#4ADE80", ribbon: "#7C3AED",
  comic: "#F97316", pure: "#64748B", executive: "#1E40AF", welcome: "#EA580C",
  playground: "#7C3AED", active: "#DC2626", pass: "#0284C7", victory: "#CA8A04",
  bare: "#475569",
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clamp(value: number, minimum: number, maximum: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function safeAlignment(value: unknown, fallback: "left" | "center" | "right") {
  return value === "left" || value === "center" || value === "right" ? value : fallback;
}

function sectionBackgroundStyle(background: KioskVisualDesign["main"]["background"]) {
  if (background.mode === "gradient" && background.color2) {
    return `background-color:${escapeHtml(background.color)};background-image:linear-gradient(${Number(background.gradient_angle) || 90}deg, ${escapeHtml(background.color)}, ${escapeHtml(background.color2)});`;
  }
  return `background-color:${escapeHtml(background.color)};`;
}

function textStyle(value: { color: string; size_rem: number; font?: string }) {
  return `color:${escapeHtml(value.color)};--kr-size-rem:${Number(value.size_rem) || 1};font-family:system-ui,-apple-system,sans-serif;`;
}

function textEffectClass(value: { effects?: { shadow?: boolean; outline?: boolean } }) {
  return `kr-text${value.effects?.shadow ? " kr-text-shadow" : ""}${value.effects?.outline ? " kr-text-outline" : ""}`;
}

function logoSize(value: { size?: number } | null | undefined) {
  return clamp(Number(value?.size), 0.35, 1, 0.75);
}

function footerLayout(hasLogo: boolean, hasText: boolean, alignment: unknown) {
  if (hasLogo && hasText) return `logo-${safeAlignment(alignment, "left")}-text`;
  if (hasLogo) return `logo-only-${safeAlignment(alignment, "left")}`;
  return hasText ? "text-only" : "empty";
}

function mainImageStyle(transform: KioskVisualDesign["main"]["image_transform"]) {
  const focalX = clamp(Number(transform.focal_x), 0, 1, 0.5);
  const focalY = clamp(Number(transform.focal_y), 0, 1, 0.5);
  const zoom = clamp(Number(transform.zoom), 1, 5, 1);
  return `object-fit:cover;object-position:${focalX * 100}% ${focalY * 100}%;${zoom === 1 ? "" : `transform:scale(${zoom});`}transform-origin:${focalX * 100}% ${focalY * 100}%;width:100%;height:100%;`;
}

function initials(name: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return `${parts[0][0] || "?"}${parts.length > 1 ? parts[parts.length - 1][0] || "" : ""}`.toUpperCase();
}

function avatarToneStep(name: string) {
  const text = String(name || "").trim().toLowerCase();
  if (!text) return 0;
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash % 5;
}

/** Desktop/browser-compatible avatar markup: photo when present, initials fallback on error/missing. */
export function buildKioskPersonAvatarHtml(person: { name: string; photoUrl?: string | null }, options: { compact?: boolean } = {}): string {
  const tone = avatarToneStep(person.name);
  const letters = escapeHtml(initials(person.name));
  const photo = String(person.photoUrl || "").trim();
  const compact = options.compact ? " kiosk-person-avatar--compact" : "";
  if (!photo) {
    return `<span class="kiosk-person-avatar${compact} kiosk-person-avatar--fallback" aria-hidden="true" data-avatar-tone="${tone}" style="--avatar-tone-step:${tone}"><span class="kiosk-person-initials">${letters}</span></span>`;
  }
  return `<span class="kiosk-person-avatar${compact} kiosk-person-avatar--photo" aria-hidden="true" data-avatar-tone="${tone}" style="--avatar-tone-step:${tone}"><span class="kiosk-person-initials">${letters}</span><img alt="" src="${escapeHtml(photo)}" onerror="var root=this.closest('.kiosk-person-avatar');if(root){root.classList.remove('kiosk-person-avatar--photo');root.classList.add('kiosk-person-avatar--fallback');}this.remove();"/></span>`;
}

function documentShell(bodyClass: string, bodyHtml: string, extraCss = "") {
  const heightFix = bodyClass.includes("kr-preview")
    ? "html,body{height:100%;width:100%;margin:0;overflow:hidden}.kr-shell{height:100%!important;min-height:100%!important;}button.kiosk-person-card{appearance:none;-webkit-appearance:none;font:inherit;color:inherit;text-align:inherit;}"
    : "";
  return `<!DOCTYPE html><html class="${bodyClass.includes("kr-preview") ? "kr-preview-html" : ""}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/><style>${heightFix}${KIOSK_WEB_PREVIEW_CSS}${KIOSK_FLOW_PANELS_CSS}${extraCss}</style></head><body class="${bodyClass}">${bodyHtml}</body></html>`;
}

export type KioskFlowAction = { id: string; label: string };
export type KioskPreviewFlowStage = "browse" | "action" | "confirmation";

/** Desktop/browser action panel: participant summary + primary actions + secondary back. */
export function buildKioskActionPanelHtml(options: {
  participant: PreviewPerson;
  actions: KioskFlowAction[];
  backLabel: string;
  busy?: boolean;
}): string {
  const disabled = options.busy ? " disabled" : "";
  const actions = options.actions.map((action) =>
    `<button type="button" class="kiosk-action-choice" data-kiosk-action="${escapeHtml(action.id)}"${disabled}>${escapeHtml(action.label)}</button>`,
  ).join("");
  return `<div class="kiosk-flow kiosk-flow--action">
    <div class="kiosk-participant-summary">
      ${buildKioskPersonAvatarHtml(options.participant, { compact: true })}
      <div class="kiosk-participant-summary-text"><strong class="kiosk-participant-summary-name">${escapeHtml(options.participant.name)}</strong></div>
    </div>
    <div class="kiosk-actions">${actions}</div>
    <button type="button" class="btn-secondary kiosk-submit" data-kiosk-back="1"${disabled}>${escapeHtml(options.backLabel)}</button>
  </div>`;
}

/** Desktop/browser confirmation panel: check mark + message inside white rounded panel. */
export function buildKioskConfirmationPanelHtml(options: {
  family: string;
  message: string;
  accent: string;
}): string {
  const family = escapeHtml(options.family || "clean");
  const accent = escapeHtml(options.accent || "#2563EB");
  return `<div class="kiosk-confirmation kiosk-confirmation--unified kiosk-confirmation--${family} kiosk-confirmation--live" data-kc-family="${family}" style="--kc-accent:${accent};--kc-accent-2:${accent};--kc-accent-gradient:${accent};--kc-accent-mode:solid" role="status" aria-live="polite">
    <div class="kc-unified-panel">
      <div class="kc-unified-mark" aria-hidden="true"><span class="kc-unified-check">✓</span></div>
      <p class="kc-unified-message">${escapeHtml(options.message)}</p>
    </div>
  </div>`;
}

/** Force portrait=2 / landscape=4 columns without distorting template card design. */
export function kioskPreviewGridOverrideCss(columns: 2 | 4): string {
  return `
.kr-shell .kiosk-people-grid,
.kr-shell[data-layout] .kiosk-people-grid,
.kr-shell[data-card-template] .kiosk-people-grid {
  display:grid !important;
  grid-template-columns:repeat(${columns},minmax(0,1fr)) !important;
  gap:clamp(0.55rem,1.4vw,1rem) !important;
  width:100% !important;
  max-width:none !important;
  margin-inline:0 !important;
  align-items:start !important;
  justify-content:stretch !important;
}
.kr-shell .kiosk-person-card {
  width:100% !important;
  max-width:100% !important;
  height:auto !important;
  align-self:start !important;
}
.kr-shell[data-layout="split"] .kr-main-content {
  grid-template-columns:1fr !important;
}
.kr-shell[data-layout="split"] .kr-main-title,
.kr-shell[data-layout="split"] .kr-main-slot {
  grid-column:1 !important;
}
/* Keep Header/Footer fixed; scroll participant content like live kiosk. */
.kr-main {
  min-height:0 !important;
  overflow:hidden !important;
}
.kr-main-content {
  flex:1 1 auto !important;
  min-height:0 !important;
  overflow-x:hidden !important;
  overflow-y:auto !important;
  -webkit-overflow-scrolling:touch;
  overscroll-behavior:contain;
  touch-action:pan-y;
}
.kr-main-slot {
  min-height:0;
}
/* Desktop Electron parity: photo must cover the avatar frame (not a thin strip). */
.kr-shell .kiosk-person-avatar {
  position:relative;
}
.kr-shell .kiosk-person-avatar > .kiosk-person-initials {
  position:relative;
  z-index:0;
}
.kr-shell .kiosk-person-avatar > img {
  position:absolute;
  inset:0;
  z-index:1;
  width:100%;
  height:100%;
  object-fit:cover;
  object-position:center;
  display:block;
}
`;
}

export type KioskPreviewSafeInsets = { top: number; right: number; bottom: number; left: number };

function safeInset(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value || 0)) : 0;
}

/** Phone-only presentation CSS. Tablet intentionally receives no overrides. */
export function phoneKioskResponsiveCss(
  profile: KioskViewportProfile,
  insets: Partial<KioskPreviewSafeInsets> = {},
): string {
  if (profile === "tablet") return "";
  const landscape = profile === "phone-landscape";
  const rootSize = landscape ? 13 : 14;
  const headerHeight = landscape ? "48px" : "60px";
  const footerHeight = landscape ? "16px" : "42px";
  const headerTitleMax = landscape ? "44px" : "25px";
  const mainTitleMax = landscape ? "clamp(20px, 5.5dvh, 24px)" : "28px";
  const footerTextMax = landscape ? "14px" : "13px";
  const mainPaddingY = landscape ? 5 : 9;
  const mainPaddingX = landscape ? 14 : 11;
  const gridGap = landscape ? 8 : 9;
  const safeTop = safeInset(insets.top);
  const safeRight = safeInset(insets.right);
  const safeBottom = safeInset(insets.bottom);
  const safeLeft = safeInset(insets.left);

  return `
html.kr-preview-html { font-size:${rootSize}px; }
.kr-preview-body { background:#0f172a; }
.kr-shell[data-mobile-viewport="${profile}"] {
  grid-template-rows:calc(${headerHeight} + ${safeTop}px) minmax(0,1fr) calc(${footerHeight} + ${safeBottom}px) !important;
  min-height:100% !important;
  height:100% !important;
}
.kr-shell[data-mobile-viewport="${profile}"] .kr-header {
  height:auto !important;
  min-height:0 !important;
}
.kr-shell[data-mobile-viewport="${profile}"] .kr-header-inner {
  gap:${landscape ? 6 : 7}px !important;
  padding:${safeTop + (landscape ? 0 : 5)}px ${safeRight + (landscape ? 36 : 51)}px ${landscape ? 0 : 5}px ${safeLeft + (landscape ? 12 : 10)}px !important;
}
.kr-shell[data-mobile-viewport="${profile}"] .kr-header-logo {
  max-width:${landscape ? "96px" : "76px"} !important;
  max-height:${landscape ? "48px" : "36px"} !important;
}
.kr-shell[data-mobile-viewport="${profile}"] .kr-header-title.kr-text {
  font-size:min(calc(var(--kr-size-rem, 1.5) * 1rem), ${headerTitleMax}) !important;
  ${landscape ? "line-height:1 !important;" : ""}
}
.kr-shell[data-mobile-viewport="${profile}"] .kr-main-content {
  padding:${mainPaddingY}px ${safeRight + mainPaddingX}px ${mainPaddingY}px ${safeLeft + mainPaddingX}px !important;
}
.kr-shell[data-mobile-viewport="${profile}"] .kr-main[data-card-helper="on"] .kr-main-content {
  padding-bottom:${landscape ? 25 : 32}px !important;
}
.kr-shell[data-mobile-viewport="${profile}"] .kr-main-title.kr-text {
  max-width:100% !important;
  margin-bottom:${landscape ? 4 : 7}px !important;
  font-size:min(calc(var(--kr-size-rem, 1.75) * 1rem), ${mainTitleMax}) !important;
  line-height:1.12 !important;
  white-space:nowrap !important;
  overflow:hidden !important;
}
.kr-shell[data-mobile-viewport="${profile}"] .kiosk-people-grid {
  gap:${gridGap}px !important;
}
${landscape ? `.kr-shell[data-mobile-viewport="phone-landscape"] .kiosk-people-grid {
  --kr-safe-card-width:calc((100vw - ${safeLeft}px - ${safeRight}px - 28px - 24px) / 4);
  grid-template-columns:repeat(4,minmax(0,var(--kr-safe-card-width))) !important;
  justify-content:center !important;
}` : ""}
.kr-shell[data-mobile-viewport="${profile}"] .kiosk-person-content {
  gap:${landscape ? 2 : 4}px !important;
}
.kr-shell[data-mobile-viewport="${profile}"] .kiosk-person-avatar {
  max-width:${landscape ? 34 : 42}px !important;
  max-height:${landscape ? 34 : 42}px !important;
}
.kr-shell[data-mobile-viewport="${profile}"] .kiosk-participant-summary .kiosk-person-avatar--compact,
.kr-shell[data-mobile-viewport="${profile}"] .kiosk-flow--action .kiosk-person-avatar--compact {
  max-width:3rem !important;
  max-height:3rem !important;
  width:3rem !important;
  height:3rem !important;
}
.kr-shell[data-mobile-viewport="${profile}"] .kiosk-flow--action,
.kr-shell[data-mobile-viewport="${profile}"] .kiosk-confirmation--live .kc-unified-panel {
  width:100% !important;
  max-width:min(28rem, 100%) !important;
  margin-inline:auto !important;
}
.kr-shell[data-mobile-viewport="${profile}"] .kr-card-helper-dock {
  padding:0 ${safeRight + (landscape ? 14 : 8)}px ${landscape ? 5 : 7}px ${safeLeft + (landscape ? 14 : 8)}px !important;
}
.kr-shell[data-mobile-viewport="${profile}"] .kr-card-helper {
  max-width:${landscape ? 190 : 240}px !important;
  padding:${landscape ? "3px 7px" : "5px 9px"} !important;
  font-size:${landscape ? 11 : 11}px !important;
  line-height:1.18 !important;
}
.kr-shell[data-mobile-viewport="${profile}"] .kr-footer {
  height:auto !important;
  min-height:0 !important;
}
.kr-shell[data-mobile-viewport="${profile}"] .kr-footer-inner {
  gap:${landscape ? 5 : 7}px !important;
  padding:${landscape ? 1 : 5}px ${safeRight + (landscape ? 12 : 9)}px ${safeBottom + (landscape ? 1 : 5)}px ${safeLeft + (landscape ? 12 : 9)}px !important;
}
.kr-shell[data-mobile-viewport="${profile}"] .kr-footer-logo {
  max-width:${landscape ? "42px" : "58px"} !important;
  max-height:${landscape ? "14px" : "27px"} !important;
}
.kr-shell[data-mobile-viewport="${profile}"] .kr-footer-text.kr-text {
  font-size:min(calc(var(--kr-size-rem, 0.875) * 1rem), ${footerTextMax}) !important;
  ${landscape ? "line-height:1 !important;" : ""}
}
`;
}

function phoneTitleFitScript(profile: KioskViewportProfile): string {
  if (profile === "tablet") return "";
  const minimum = profile === "phone-landscape" ? 12 : 15;
  return `<script>(function(){
    function fitMainTitle(){
      var title=document.querySelector('.kr-main-title');
      if(!title)return;
      title.style.setProperty('white-space','nowrap','important');
      var size=parseFloat(window.getComputedStyle(title).fontSize)||${minimum};
      while(title.scrollWidth>title.clientWidth&&size>${minimum}){
        size-=1;
        title.style.setProperty('font-size',size+'px','important');
      }
    }
    requestAnimationFrame(fitMainTitle);
    window.addEventListener('resize',fitMainTitle,{passive:true});
  })();true;</script>`;
}

export function buildKioskPreviewHtml(options: {
  config: KioskVisualDesign;
  mode: "card" | "input";
  media?: PreviewMedia;
  people?: PreviewPerson[];
  helperText?: string;
  showName?: boolean;
  showCode?: boolean;
  showEmail?: boolean;
  continueLabel?: string;
  participantCodeLabel?: string;
  secondFieldLabel?: string;
  secondFieldValue?: string;
  inputFieldCount?: number;
  interactivePeople?: boolean;
  /** Live kiosk Input identify — editable fields that postMessage to React Native. */
  interactiveIdentify?: boolean;
  formTitle?: string;
  showPin?: boolean;
  pinLabel?: string;
  /** Portrait=2, landscape=4. Defaults to 2. */
  gridColumns?: 2 | 4;
  viewportProfile?: KioskViewportProfile;
  safeInsets?: Partial<KioskPreviewSafeInsets>;
  /** Live flow stage after participant selection / confirmation. Default browse. */
  flowStage?: KioskPreviewFlowStage;
  actionParticipant?: PreviewPerson | null;
  actionChoices?: KioskFlowAction[];
  actionBackLabel?: string;
  actionBusy?: boolean;
  confirmationMessage?: string;
}): string {
  const { config, mode } = options;
  const media = options.media || {};
  const cardTemplate = resolveKioskCardTemplate(config.main);
  const flowTemplate = mode === "card" ? cardTemplate.id : config.main.input_template;
  const layout = mode === "card" ? cardTemplate.layout : config.main.layout_preset;
  const accent = ACCENTS[flowTemplate] || "#2563EB";
  const overlay = kioskOverlayColor(config.main.overlay);
  const mainUsesImage = config.main.background.mode === "image" && Boolean(media.backgroundUrl);
  const footerText = String(config.footer.text.lines?.[0] || "").trim();
  const flowStage: KioskPreviewFlowStage = options.flowStage || "browse";
  const helper = mode === "card" && flowStage === "browse" ? String(options.helperText || "").trim() : "";
  const people = options.people || [];
  const tag = options.interactivePeople ? "button" : "article";
  const gridColumns = options.gridColumns === 4 ? 4 : 2;
  const viewportProfile = options.viewportProfile || "tablet";
  const liveShell = Boolean(options.interactivePeople || options.interactiveIdentify || flowStage !== "browse");
  const showSecondField = options.inputFieldCount === 2 || Boolean(options.secondFieldLabel);
  const codeLabel = options.participantCodeLabel || "Participant code";
  const formTitle = options.formTitle || codeLabel;
  const showMainTitle = flowStage === "browse" && Boolean(config.main.title.text);

  const peopleHtml = people.map((person) => `
    <${tag}${options.interactivePeople ? ' type="button"' : ""} class="kiosk-person-card"${person.id ? ` data-person-id="${escapeHtml(person.id)}"` : ""}>
      ${buildKioskPersonAvatarHtml(person)}
      <span class="kiosk-person-content">
        ${options.showName === false ? "" : `<strong class="kiosk-person-name">${escapeHtml(person.name)}</strong>`}
        ${options.showCode === false ? "" : `<span class="kiosk-person-code kiosk-person-sub">${escapeHtml(person.code)}</span>`}
        ${options.showEmail ? `<span class="kiosk-person-email kiosk-person-sub">${escapeHtml(person.email)}</span>` : ""}
      </span>
    </${tag}>`).join("");

  const inputHtml = options.interactiveIdentify
    ? `
    <form class="kiosk-flow kiosk-flow--identify kiosk-identify-form" id="kiosk-identify-form" autocomplete="off">
      <h2>${escapeHtml(formTitle)}</h2>
      <label class="field"><span class="field-label">${escapeHtml(codeLabel)}</span><input name="identifier" id="kiosk-identify-code" autocapitalize="characters" autocomplete="off" /></label>
      ${showSecondField ? `<label class="field"><span class="field-label">${escapeHtml(options.secondFieldLabel || "")}</span><input name="second" id="kiosk-identify-second" autocomplete="off" /></label>` : ""}
      ${options.showPin ? `<label class="field"><span class="field-label">${escapeHtml(options.pinLabel || "PIN")}</span><input class="kiosk-pin-input" name="pin" id="kiosk-identify-pin" type="password" autocomplete="off" /></label>` : ""}
      <button class="btn-primary kiosk-submit" type="submit">${escapeHtml(options.continueLabel || "Continue")}</button>
    </form>`
    : `
    <form class="kiosk-flow kiosk-flow--identify kiosk-identify-form" onsubmit="return false;">
      <h2>${escapeHtml(formTitle)}</h2>
      <label class="field"><span class="field-label">${escapeHtml(codeLabel)}</span><input readonly value="G12-1042" /></label>
      ${showSecondField ? `<label class="field"><span class="field-label">${escapeHtml(options.secondFieldLabel || "")}</span><input readonly value="${escapeHtml(options.secondFieldValue || "")}" /></label>` : ""}
      <button class="kiosk-submit" type="button">${escapeHtml(options.continueLabel || "Continue")}</button>
    </form>`;

  let slotHtml = "";
  if (flowStage === "confirmation") {
    slotHtml = buildKioskConfirmationPanelHtml({
      family: flowTemplate,
      message: options.confirmationMessage || "",
      accent,
    });
  } else if (flowStage === "action" && options.actionParticipant) {
    slotHtml = buildKioskActionPanelHtml({
      participant: options.actionParticipant,
      actions: options.actionChoices || [],
      backLabel: options.actionBackLabel || "Back",
      busy: options.actionBusy,
    });
  } else {
    slotHtml = mode === "card"
      ? `<div class="kiosk-people-grid desktop-kiosk-builder-samples">${peopleHtml}</div>`
      : inputHtml;
  }

  const body = `
  <div class="kr-shell" data-kr-mode="${liveShell ? "live" : "editor"}" data-mobile-viewport="${viewportProfile}" data-kiosk-behavior="${mode}" data-layout="${escapeHtml(layout)}"
    data-input-template="${escapeHtml(config.main.input_template)}" data-card-template="${escapeHtml(cardTemplate.id)}"
    data-flow-template="${escapeHtml(flowTemplate)}" data-button="${escapeHtml(config.main.button_preset)}"
    data-input="${escapeHtml(config.main.input_preset)}" data-card="${escapeHtml(config.main.card_preset)}"
    data-grid-cols="${gridColumns}" style="--kr-accent:${accent}">
    <header class="kr-header" data-kr-header-align="${safeAlignment(config.header.alignment, "left")}" style="${sectionBackgroundStyle(config.header.background)}">
      <div class="kr-header-inner">
        ${media.headerLogoUrl ? `<img alt="" class="kr-header-logo" src="${escapeHtml(media.headerLogoUrl)}" style="max-height:${logoSize(config.header.logo) * 100}%"/>` : ""}
        ${config.header.title.text ? `<h1 class="kr-header-title ${textEffectClass(config.header.title)}" style="${textStyle(config.header.title)}">${escapeHtml(config.header.title.text)}</h1>` : ""}
      </div>
    </header>
    <section class="kr-main" data-layout="${escapeHtml(config.main.layout_preset)}" data-has-title="${showMainTitle ? "on" : "off"}"
      data-card-helper="${helper ? "on" : "off"}" data-title-align="${safeAlignment(config.main.title.alignment, "center")}"
      style="${mainUsesImage ? "" : sectionBackgroundStyle(config.main.background)}">
      ${mainUsesImage ? `<div class="kr-main-bg-image" aria-hidden="true"><img alt="" src="${escapeHtml(media.backgroundUrl)}" style="${mainImageStyle(config.main.image_transform)}"/></div>` : ""}
      ${overlay ? `<div class="kr-main-overlay" style="background-color:${escapeHtml(overlay)}" aria-hidden="true"></div>` : ""}
      <div class="kr-main-content">
        ${showMainTitle ? `<div class="kr-main-copy"><h2 class="kr-main-title ${textEffectClass(config.main.title)}" style="${textStyle(config.main.title)}">${escapeHtml(config.main.title.text)}</h2></div>` : ""}
        <div class="kr-main-slot">${slotHtml}</div>
      </div>
      ${helper ? `<div class="kr-card-helper-dock"><div class="kr-card-helper" role="note">${escapeHtml(helper)}</div></div>` : ""}
    </section>
    <footer class="kr-footer" data-kr-footer-layout="${footerLayout(Boolean(media.footerLogoUrl), Boolean(footerText), config.footer.logo?.alignment)}"
      style="${sectionBackgroundStyle(config.footer.background)}">
      <div class="kr-footer-inner">
        ${media.footerLogoUrl ? `<img alt="" class="kr-footer-logo" data-align="${safeAlignment(config.footer.logo?.alignment, "left")}" src="${escapeHtml(media.footerLogoUrl)}" style="max-height:${logoSize(config.footer.logo) * 100}%"/>` : ""}
        ${footerText ? `<div class="kr-footer-text kr-align-${safeAlignment(config.footer.text.alignment, "center")} ${textEffectClass(config.footer.text)}" data-align="${safeAlignment(config.footer.text.alignment, "center")}" style="${textStyle(config.footer.text)}"><p>${escapeHtml(footerText)}</p></div>` : ""}
      </div>
    </footer>
  </div>`;

  const interactivePeopleScript = options.interactivePeople && flowStage === "browse"
    ? `<script>
    document.querySelectorAll('[data-person-id]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'person', id: btn.getAttribute('data-person-id') }));
        }
      });
    });
    true;
  </script>`
    : "";

  const interactiveIdentifyScript = options.interactiveIdentify && flowStage === "browse"
    ? `<script>
    (function(){
      var form = document.getElementById('kiosk-identify-form');
      if (!form) return;
      form.addEventListener('submit', function(event){
        event.preventDefault();
        var code = document.getElementById('kiosk-identify-code');
        var second = document.getElementById('kiosk-identify-second');
        var pin = document.getElementById('kiosk-identify-pin');
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'identify',
            identifier: code ? code.value : '',
            second: second ? second.value : '',
            pin: pin ? pin.value : ''
          }));
        }
      });
    })();
    true;
  </script>`
    : "";

  const interactiveActionScript = flowStage === "action"
    ? `<script>
    (function(){
      document.querySelectorAll('[data-kiosk-action]').forEach(function(btn){
        btn.addEventListener('click', function(){
          if (btn.disabled) return;
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'action', action: btn.getAttribute('data-kiosk-action') }));
          }
        });
      });
      var back = document.querySelector('[data-kiosk-back]');
      if (back) {
        back.addEventListener('click', function(){
          if (back.disabled) return;
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'back' }));
          }
        });
      }
    })();
    true;
  </script>`
    : "";

  return documentShell(
    "kr-preview-body",
    body + interactivePeopleScript + interactiveIdentifyScript + interactiveActionScript + phoneTitleFitScript(viewportProfile),
    kioskPreviewGridOverrideCss(gridColumns) + phoneKioskResponsiveCss(viewportProfile, options.safeInsets),
  );
}

export function buildCardTemplatePickerHtml(options: {
  ids: string[];
  selected: string;
  labels: Record<string, { label?: string; description?: string }>;
}): string {
  const cards = options.ids.map((id) => {
    const meta = options.labels[id] || {};
    const active = id === options.selected ? " active" : "";
    return `<button type="button" class="kb-template-card${active}" data-template-id="${escapeHtml(id)}">
      <span class="kb-card-template-mini kb-card-template-mini--${escapeHtml(id)}" aria-hidden="true">
        <span class="kb-card-mini-deco"></span>
        <span class="kb-card-mini-avatar"></span>
        <span class="kb-card-mini-body">
          <span class="kb-card-mini-line kb-card-mini-line-strong"></span>
          <span class="kb-card-mini-line"></span>
        </span>
      </span>
      <strong>${escapeHtml(meta.label || id)}</strong>
      ${meta.description ? `<small>${escapeHtml(meta.description)}</small>` : ""}
    </button>`;
  }).join("");

  const script = `<script>
    document.querySelectorAll('[data-template-id]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-template-id');
        document.querySelectorAll('[data-template-id]').forEach(function(other){
          other.classList.toggle('active', other.getAttribute('data-template-id') === id);
        });
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'select', id: id }));
        }
      });
    });
    true;
  </script>`;

  return documentShell("kb-picker-body", `<div class="kb-template-grid" role="list">${cards}</div>${script}`);
}

export function buildInputTemplatePickerHtml(options: {
  ids: string[];
  selected: string;
  labels: Record<string, { label?: string; description?: string }>;
}): string {
  const cards = options.ids.map((id) => {
    const meta = options.labels[id] || {};
    const accent = inputTemplateAccent(id);
    const active = id === options.selected ? " active" : "";
    return `<button type="button" class="kb-template-card${active}" data-template-id="${escapeHtml(id)}">
      <span class="kb-input-template-mini" style="color:${escapeHtml(accent)}" aria-hidden="true">
        <span class="kb-input-template-mini-field"></span>
        <span class="kb-input-template-mini-button"></span>
      </span>
      <strong>${escapeHtml(meta.label || id)}</strong>
      ${meta.description ? `<small>${escapeHtml(meta.description)}</small>` : ""}
    </button>`;
  }).join("");

  const script = `<script>
    document.querySelectorAll('[data-template-id]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-template-id');
        document.querySelectorAll('[data-template-id]').forEach(function(other){
          other.classList.toggle('active', other.getAttribute('data-template-id') === id);
        });
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'select', id: id }));
        }
      });
    });
    true;
  </script>`;

  return documentShell("kb-picker-body", `<div class="kb-template-grid" role="list">${cards}</div>${script}`);
}

/** Injected when selection changes from React without reloading the picker document. */
export function templatePickerSelectionScript(selectedId: string): string {
  return `(function(){
    var id = ${JSON.stringify(String(selectedId || ""))};
    document.querySelectorAll('[data-template-id]').forEach(function(btn){
      btn.classList.toggle('active', btn.getAttribute('data-template-id') === id);
    });
    true;
  })();`;
}

export function buildKioskPeopleGridHtml(options: {
  config: KioskVisualDesign;
  media?: PreviewMedia;
  people: Array<PreviewPerson & { id: string }>;
  helperText?: string;
  showName?: boolean;
  showCode?: boolean;
  showEmail?: boolean;
}): string {
  const interactivePeople = options.people.map((person) => ({
    ...person,
    // Encode selection id into the card via data attribute in HTML below.
  }));
  const base = buildKioskPreviewHtml({
    config: options.config,
    mode: "card",
    media: options.media,
    people: interactivePeople,
    helperText: options.helperText,
    showName: options.showName,
    showCode: options.showCode,
    showEmail: options.showEmail,
  });
  // Rebuild people cards with data-person-id for live selection.
  const cards = options.people.map((person) => `
    <button type="button" class="kiosk-person-card" data-person-id="${escapeHtml(person.id)}">
      ${buildKioskPersonAvatarHtml(person)}
      <span class="kiosk-person-content">
        ${options.showName === false ? "" : `<strong class="kiosk-person-name">${escapeHtml(person.name)}</strong>`}
        ${options.showCode === false ? "" : `<span class="kiosk-person-code kiosk-person-sub">${escapeHtml(person.code)}</span>`}
        ${options.showEmail ? `<span class="kiosk-person-email kiosk-person-sub">${escapeHtml(person.email)}</span>` : ""}
      </span>
    </button>`).join("");
  const withCards = base.replace(
    /<div class="kiosk-people-grid desktop-kiosk-builder-samples">[\s\S]*?<\/div>\s*<\/div>\s*(?:<div class="kr-card-helper-dock">)?/,
    `<div class="kiosk-people-grid desktop-kiosk-builder-samples">${cards}</div></div>${options.helperText ? '<div class="kr-card-helper-dock">' : ""}`,
  );
  const script = `<script>
    document.querySelectorAll('[data-person-id]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'person', id: btn.getAttribute('data-person-id') }));
        }
      });
    });
    true;
  </script>`;
  return withCards.replace("</body>", `${script}</body>`);
}
