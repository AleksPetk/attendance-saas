import {
  mainImageCoverStyle,
  overlayLayerStyle,
  sectionBackgroundStyle,
  textEffectClassName,
  textStyle,
} from "./kioskVisual.js";

const TITLE_ALIGNS = new Set(["left", "center", "right"]);

export default function KioskMain({ config, backgroundImageUrl, cardHelper = "", children }) {
  const main = config?.main || {};
  const background = main.background || {};
  const title = main.title || {};
  const safeBackgroundUrl =
    typeof backgroundImageUrl === "string" ? backgroundImageUrl.trim() : "";
  const useImage = background.mode === "image" && Boolean(safeBackgroundUrl);
  const overlay = overlayLayerStyle(main.overlay);
  const layout = main.layout_preset || "centered";
  const hasTitle = Boolean(title.text);
  const titleAlign = TITLE_ALIGNS.has(title.alignment) ? title.alignment : "center";

  return (
    <section
      className="kr-main"
      data-layout={layout}
      data-has-title={hasTitle ? "on" : "off"}
      data-card-helper={cardHelper ? "on" : "off"}
      data-title-align={titleAlign}
      style={useImage ? undefined : sectionBackgroundStyle(background)}
    >
      {useImage ? (
        <div className="kr-main-bg-image" aria-hidden="true">
          <img
            src={safeBackgroundUrl}
            alt=""
            style={mainImageCoverStyle(main.image_transform)}
          />
        </div>
      ) : null}
      {overlay ? <div className="kr-main-overlay" style={overlay} aria-hidden="true" /> : null}
      <div className="kr-main-content">
        {title.text ? (
          <div className="kr-main-copy">
            <h2
              className={`kr-main-title ${textEffectClassName(title.effects)}`}
              style={textStyle(title)}
            >
              {title.text}
            </h2>
          </div>
        ) : null}
        <div className="kr-main-slot">{children}</div>
      </div>
      {cardHelper ? (
        <div className="kr-card-helper-dock">
          <div className="kr-card-helper" role="note">
            {cardHelper}
          </div>
        </div>
      ) : null}
    </section>
  );
}
