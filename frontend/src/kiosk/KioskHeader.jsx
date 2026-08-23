import {
  sectionBackgroundStyle,
  textEffectClassName,
  textStyle,
} from "./kioskVisual.js";

const ALIGNS = new Set(["left", "center", "right"]);

function headerLogoSize(logo) {
  const raw = Number(logo?.size);
  if (!Number.isFinite(raw)) return 0.75;
  return Math.min(1, Math.max(0.35, raw));
}

/**
 * Header always exists. Optional logo + optional title.
 * Placement uses left/center/right presets (no free drag).
 */
export default function KioskHeader({ config, logoUrl }) {
  const header = config?.header || {};
  const title = header.title || {};
  const alignment = ALIGNS.has(header.alignment) ? header.alignment : "left";
  const logoSize = headerLogoSize(header.logo);
  const safeLogoUrl = typeof logoUrl === "string" ? logoUrl.trim() : "";
  const hasLogo = Boolean(safeLogoUrl);
  const hasTitle = Boolean(title.text);

  return (
    <header
      className="kr-header"
      style={sectionBackgroundStyle(header.background)}
      data-kr-header-align={alignment}
    >
      <div className="kr-header-inner">
        {hasLogo ? (
          <img
            className="kr-header-logo"
            src={safeLogoUrl}
            alt=""
            style={{ maxHeight: `${logoSize * 100}%` }}
          />
        ) : null}
        {hasTitle ? (
          <h1
            className={`kr-header-title ${textEffectClassName(title.effects)}`}
            style={textStyle(title)}
          >
            {title.text}
          </h1>
        ) : null}
      </div>
    </header>
  );
}
