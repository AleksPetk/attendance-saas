import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { localeHtmlLang } from "./language.js";

/**
 * Set document.title for authenticated workspace screens.
 * @param {string} titleKey - i18n key (with optional ns prefix)
 * @param {object} options - passed to t()
 */
export function usePageTitle(titleKey, options = {}) {
  const { t, i18n } = useTranslation(options.ns || "workspace");

  useEffect(() => {
    const pageTitle = options.ns ? t(titleKey, options) : t(titleKey, options);
    const product = t("common:productName", { defaultValue: "CheckStation" });
    document.title = pageTitle ? `${pageTitle} · ${product}` : product;
    document.documentElement.lang = localeHtmlLang(i18n.language);
  }, [t, i18n.language, titleKey, options.ns]);
}
