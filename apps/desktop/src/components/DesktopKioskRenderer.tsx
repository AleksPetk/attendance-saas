import type { CSSProperties, ReactNode } from "react";
import { kioskOverlayColor, resolveKioskCardTemplate, type KioskDesignDocument, type KioskTextStyle } from "@checkstation/domain";
import { useAuthenticatedAsset } from "./AuthenticatedImage";
import { cssBackground, kioskCssFontFamily } from "../lib/kioskDesign";

type KioskMode = "card" | "input";

type Props = {
  children: ReactNode;
  design: KioskDesignDocument;
  kioskMode: KioskMode;
  onExit: () => void;
  exitLabel: string;
};

/**
 * Electron counterpart of Workspace's KioskRenderer.
 *
 * Keep this DOM/data-attribute contract aligned with the canonical Workspace
 * renderer: the shared kiosk styles use it to apply saved layout, card, input,
 * and flow presets. Media is resolved through Electron's authenticated bridge.
 */
export function DesktopKioskRenderer({ children, design, kioskMode, onExit, exitLabel }: Props) {
  const { config } = design;
  const headerLogo = useAuthenticatedAsset(design.header_logo_url);
  const footerLogo = useAuthenticatedAsset(design.footer_logo_url);
  const mainImage = useAuthenticatedAsset(design.main_background_image_url);
  const cardTemplate = resolveKioskCardTemplate(config.main);
  const layout = kioskMode === "card" ? cardTemplate.layout : config.main.layout_preset;
  const flowTemplate = desktopKioskFlowTemplate(design, kioskMode);
  const mainUsesImage = config.main.background.mode === "image" && Boolean(mainImage);
  const overlay = kioskOverlayColor(config.main.overlay);

  return (
    <div
      className="kr-shell"
      data-kr-mode="live"
      data-kiosk-behavior={kioskMode}
      data-layout={layout}
      data-input-template={config.main.input_template}
      data-card-template={cardTemplate.id}
      data-flow-template={flowTemplate}
      data-button={config.main.button_preset}
      data-input={config.main.input_preset}
      data-card={config.main.card_preset}
      style={{ "--kr-accent": desktopKioskTemplateAccent(flowTemplate) } as CSSProperties}
    >
      <button type="button" className="kr-exit" onClick={onExit} aria-label={exitLabel}>
        {exitLabel}
      </button>
      <header
        className="kr-header"
        data-kr-header-align={safeAlignment(config.header.alignment, "left")}
        style={sectionStyle(config.header.background)}
      >
        <div className="kr-header-inner">
          {headerLogo ? (
            <img
              alt=""
              className="kr-header-logo"
              src={headerLogo}
              style={{ maxHeight: `${logoSize(config.header.logo) * 100}%` }}
            />
          ) : null}
          {config.header.title.text ? (
            <h1 className={`kr-header-title ${textEffectClass(config.header.title)}`} style={textStyle(config.header.title)}>
              {config.header.title.text}
            </h1>
          ) : null}
        </div>
      </header>
      <section
        className="kr-main"
        data-layout={config.main.layout_preset}
        data-has-title={config.main.title.text ? "on" : "off"}
        data-card-helper="off"
        data-title-align={safeAlignment(config.main.title.alignment, "center")}
        style={mainUsesImage ? undefined : sectionStyle(config.main.background)}
      >
        {mainUsesImage ? (
          <div className="kr-main-bg-image" aria-hidden="true">
            <img alt="" src={mainImage} style={mainImageStyle(config.main.image_transform)} />
          </div>
        ) : null}
        {overlay ? <div className="kr-main-overlay" style={{ backgroundColor: overlay }} aria-hidden="true" /> : null}
        <div className="kr-main-content">
          {config.main.title.text ? (
            <div className="kr-main-copy">
              <h2 className={`kr-main-title ${textEffectClass(config.main.title)}`} style={textStyle(config.main.title)}>
                {config.main.title.text}
              </h2>
            </div>
          ) : null}
          <div className="kr-main-slot">{children}</div>
        </div>
      </section>
      <footer
        className="kr-footer"
        data-kr-footer-layout={footerLayout(Boolean(footerLogo), Boolean(footerLine(config.footer.text.lines)), config.footer.logo?.alignment)}
        style={sectionStyle(config.footer.background)}
      >
        <div className="kr-footer-inner">
          {footerLogo ? (
            <img
              alt=""
              className="kr-footer-logo"
              data-align={safeAlignment(config.footer.logo?.alignment, "left")}
              src={footerLogo}
              style={{ maxHeight: `${logoSize(config.footer.logo) * 100}%` }}
            />
          ) : null}
          {footerLine(config.footer.text.lines) ? (
            <div
              className={`kr-footer-text kr-align-${safeAlignment(config.footer.text.alignment, "center")} ${textEffectClass(config.footer.text)}`}
              data-align={safeAlignment(config.footer.text.alignment, "center")}
              style={textStyle(config.footer.text)}
            >
              <p>{footerLine(config.footer.text.lines)}</p>
            </div>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

function sectionStyle(background: KioskDesignDocument["config"]["main"]["background"]): CSSProperties {
  return background.mode === "gradient"
    ? { backgroundColor: background.color, backgroundImage: cssBackground(background) }
    : { backgroundColor: background.color };
}

function textStyle(value: KioskTextStyle): CSSProperties {
  return {
    color: value.color,
    fontFamily: kioskCssFontFamily(value.font),
    "--kr-size-rem": String(value.size_rem),
  } as CSSProperties;
}

function textEffectClass(value: KioskTextStyle) {
  return `kr-text${value.effects.shadow ? " kr-text-shadow" : ""}${value.effects.outline ? " kr-text-outline" : ""}`;
}

function mainImageStyle(transform: KioskDesignDocument["config"]["main"]["image_transform"]): CSSProperties {
  const focalX = clamp(Number(transform.focal_x), 0, 1, 0.5);
  const focalY = clamp(Number(transform.focal_y), 0, 1, 0.5);
  const zoom = clamp(Number(transform.zoom), 1, 5, 1);
  return {
    objectFit: "cover",
    objectPosition: `${focalX * 100}% ${focalY * 100}%`,
    transform: zoom === 1 ? undefined : `scale(${zoom})`,
    transformOrigin: `${focalX * 100}% ${focalY * 100}%`,
  };
}

function safeAlignment(value: unknown, fallback: "left" | "center" | "right") {
  return value === "left" || value === "center" || value === "right" ? value : fallback;
}

function logoSize(value: { size?: number } | null | undefined) {
  return clamp(Number(value?.size), 0.35, 1, 0.75);
}

function footerLine(lines: string[]) {
  return typeof lines?.[0] === "string" ? lines[0].trim() : "";
}

function footerLayout(hasLogo: boolean, hasText: boolean, alignment: unknown) {
  if (hasLogo && hasText) return `logo-${safeAlignment(alignment, "left")}-text`;
  if (hasLogo) return `logo-only-${safeAlignment(alignment, "left")}`;
  return hasText ? "text-only" : "empty";
}

function clamp(value: number, minimum: number, maximum: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

export function desktopKioskFlowTemplate(design: KioskDesignDocument, kioskMode: KioskMode) {
  return kioskMode === "card" ? resolveKioskCardTemplate(design.config.main).id : design.config.main.input_template;
}

export function desktopKioskTemplateAccent(template: string) {
  const accents: Record<string, string> = {
    clean: "#2563EB", soft: "#3B82F6", bold: "#0F172A", minimal: "#334155",
    outline: "#2563EB", dark: "#38BDF8", glass: "#2563EB", rounded: "#4F46E5",
    compact: "#2563EB", large_touch: "#2563EB", kids_bubble: "#A855F7",
    heart_pop: "#FB7185", ticket: "#2563EB", id_badge: "#2563EB", cyber_hex: "#22D3EE",
    polaroid: "#2563EB", sticker_pack: "#F59E0B", terminal: "#4ADE80", ribbon: "#7C3AED",
    comic: "#F97316", pure: "#64748B", executive: "#1E40AF", welcome: "#EA580C",
    playground: "#7C3AED", active: "#DC2626", pass: "#0284C7", victory: "#CA8A04",
    bare: "#475569",
  };
  return accents[template] || "#2563EB";
}
