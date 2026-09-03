import { useTranslation } from "react-i18next";
import { mockProvider } from "./mockProvider.js";
import { resolveBannerModel } from "./state.js";
import "./advertising.css";

export default function AdBanner({ session, placement }) {
  const { t } = useTranslation("entitlements");
  const model = resolveBannerModel(session, placement, mockProvider);
  if (!model) return null;
  return (
    <aside className="ad-banner" data-ad-placement={placement} aria-label={t("advertising.ariaLabel")}>
      <p className="ad-kicker">{model.kicker}</p>
      <p className="ad-headline">{model.headline}</p>
    </aside>
  );
}
