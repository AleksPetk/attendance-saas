import KioskFooter from "./KioskFooter.jsx";
import KioskHeader from "./KioskHeader.jsx";
import KioskMain from "./KioskMain.jsx";
import {
  inputTemplateAccent,
  resolveInputTemplate,
} from "./inputTemplates.js";
import { resolveKioskMediaUrl } from "./kioskMedia.js";
import "./kioskFonts.css";
import "./kioskRenderer.css";
import "./kioskPresets.css";
import "./inputTemplates.css";

/**
 * Shared visual kiosk renderer.
 *
 * mode:
 * - "live": real launched kiosk
 * - "editor": builder canvas (fake sample content only; no attendance APIs)
 *
 * Header, Main, and Footer always render. Content may be empty.
 *
 * Component accent (--kr-accent) comes from the Input template (or default),
 * never from Header background — sections own their colors independently.
 */
export default function KioskRenderer({
  design,
  mode = "live",
  showExit = false,
  onExit,
  children,
}) {
  const config = design?.config;
  if (!config) return children;

  const layout = config.main?.layout_preset || "centered";
  const inputTemplate = resolveInputTemplate(config.main || {});
  const accent = inputTemplateAccent(inputTemplate);
  const allowBlob = mode === "editor";
  const headerLogoUrl = resolveKioskMediaUrl(design.header_logo_url, { allowBlob });
  const footerLogoUrl = resolveKioskMediaUrl(design.footer_logo_url, { allowBlob });
  const backgroundImageUrl = resolveKioskMediaUrl(design.main_background_image_url, {
    allowBlob,
  });

  return (
    <div
      className="kr-shell"
      data-kr-mode={mode}
      data-layout={layout}
      data-input-template={inputTemplate}
      data-button={config.main?.button_preset || "rounded"}
      data-input={config.main?.input_preset || "outlined"}
      data-card={config.main?.card_preset || "elevated"}
      style={{ "--kr-accent": accent }}
    >
      {showExit ? (
        <button type="button" className="kr-exit" onClick={onExit} aria-label="Exit kiosk">
          Exit
        </button>
      ) : null}
      <KioskHeader config={config} logoUrl={headerLogoUrl} />
      <KioskMain config={config} backgroundImageUrl={backgroundImageUrl}>
        {children}
      </KioskMain>
      <KioskFooter config={config} logoUrl={footerLogoUrl} />
    </div>
  );
}
