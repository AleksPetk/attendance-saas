import {
  sectionBackgroundStyle,
  textEffectClassName,
  textStyle,
} from "./kioskVisual.js";

function footerLogoAlign(logo) {
  const value = logo?.alignment;
  return ["left", "center", "right"].includes(value) ? value : "left";
}

function footerLogoSize(logo) {
  const raw = Number(logo?.size);
  if (!Number.isFinite(raw)) return 0.75;
  return Math.min(1, Math.max(0.35, raw));
}

/**
 * Footer always exists. Optional one-line text + optional independent image.
 * Placement uses left/center/right presets (no free drag).
 */
export default function KioskFooter({ config, logoUrl }) {
  const footer = config?.footer || {};
  const text = footer.text || {};
  const line =
    Array.isArray(text.lines) && typeof text.lines[0] === "string"
      ? text.lines[0].trim()
      : "";
  const textAlign = ["left", "center", "right"].includes(text.alignment)
    ? text.alignment
    : "center";
  const logoAlign = footerLogoAlign(footer.logo);
  const logoSize = footerLogoSize(footer.logo);
  const safeLogoUrl = typeof logoUrl === "string" ? logoUrl.trim() : "";
  const hasLogo = Boolean(safeLogoUrl);
  const hasText = Boolean(line);

  let layout = "empty";
  if (hasLogo && hasText) {
    layout = `logo-${logoAlign}-text`;
  } else if (hasLogo) {
    layout = `logo-only-${logoAlign}`;
  } else if (hasText) {
    layout = "text-only";
  }

  return (
    <footer
      className="kr-footer"
      style={sectionBackgroundStyle(footer.background)}
      data-kr-footer-layout={layout}
    >
      <div className="kr-footer-inner">
        {hasLogo ? (
          <img
            className="kr-footer-logo"
            src={safeLogoUrl}
            alt=""
            data-align={logoAlign}
            style={{ maxHeight: `${logoSize * 100}%` }}
          />
        ) : null}
        {hasText ? (
          <div
            className={`kr-footer-text kr-align-${textAlign} ${textEffectClassName(text.effects)}`}
            style={textStyle(text)}
            data-align={textAlign}
          >
            <p>{line}</p>
          </div>
        ) : null}
      </div>
    </footer>
  );
}
