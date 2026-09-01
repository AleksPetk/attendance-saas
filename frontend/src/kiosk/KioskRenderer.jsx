import { useTranslation } from "react-i18next";
import KioskFooter from "./KioskFooter.jsx";
import KioskHeader from "./KioskHeader.jsx";
import KioskMain from "./KioskMain.jsx";
import { resolveInputTemplate } from "./inputTemplates.js";
import { CARD_TEMPLATES, resolveCardTemplate } from "./cardTemplates.js";
import { flowTemplateAccent, resolveFlowTemplate } from "./flowTemplate.js";
import { resolveKioskMediaUrl } from "./kioskMedia.js";
import "./kioskFonts.css";
import "./kioskRenderer.css";
import "./kioskPresets.css";
import "./inputTemplates.css";
import "./kioskFlowStages.css";
import "./cardTemplates.css";
import "./templateFamiliesCard.css";
import "./templateFamiliesInput.css";

/**
 * Shared visual kiosk renderer.
 *
 * mode:
 * - "live": real launched kiosk
 * - "editor": builder canvas (fake sample content only; no attendance APIs)
 *
 * Header, Main, and Footer always render. Content may be empty.
 *
 * Component accent (--kr-accent) comes from the active flow template
 * (Card template on card kiosks, Input template on input kiosks),
 * never from Header background — sections own their colors independently.
 */
export default function KioskRenderer({
  design,
  mode = "live",
  kioskBehavior,
  showExit = false,
  onExit,
  children,
}) {
  const { t } = useTranslation("kiosk");
  const config = design?.config;
  if (!config) return children;

  const inputTemplate = resolveInputTemplate(config.main || {});
  const cardTemplate = resolveCardTemplate(config.main || {});
  const kioskMode = kioskBehavior?.mode || "card";
  const layoutPreset = config.main?.layout_preset || "centered";
  const layout =
    kioskMode === "card"
      ? (CARD_TEMPLATES[cardTemplate]?.layout ?? layoutPreset)
      : layoutPreset;
  const flowTemplate = resolveFlowTemplate(config.main || {}, kioskMode);
  const accent = flowTemplateAccent(flowTemplate);
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
      data-kiosk-behavior={kioskMode}
      data-layout={layout}
      data-input-template={inputTemplate}
      data-card-template={cardTemplate}
      data-flow-template={flowTemplate}
      data-button={config.main?.button_preset || "rounded"}
      data-input={config.main?.input_preset || "outlined"}
      data-card={config.main?.card_preset || "elevated"}
      style={{ "--kr-accent": accent }}
    >
      {showExit ? (
        <button type="button" className="kr-exit" onClick={onExit} aria-label={t("exitKioskAria")}>
          {t("exit")}
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
