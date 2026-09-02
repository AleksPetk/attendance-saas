import {
  publicDocsDocumentUrl,
  publicStatusPageUrl,
  workspaceStatusHomeUrl,
} from "../publicFooterLinks.js";
import { promoPathFor } from "./locale.js";

/**
 * Locale-aware public footer columns for the promotional website.
 * Docs/Status links carry the current promo locale; those sites keep their own prefs after arrival.
 */
export function buildPublicFooterColumns(locale, t) {
  const lang = locale === "ja" ? "ja" : "en";
  const statusHome = workspaceStatusHomeUrl(lang) || `${publicStatusPageUrl()}/${lang}/`;

  return [
    {
      id: "website",
      title: t("footer.columns.website"),
      items: [
        { id: "features", label: t("footer.items.features"), to: promoPathFor("/features", lang) },
        {
          id: "how-it-works",
          label: t("footer.items.howItWorks"),
          to: promoPathFor("/how-it-works", lang),
        },
        { id: "pricing", label: t("footer.items.pricing"), to: promoPathFor("/pricing", lang) },
        { id: "login", label: t("footer.items.login"), to: "/login", auth: true },
        { id: "staff-login", label: t("footer.items.staffLogin"), to: "/staff-login", auth: true },
        { id: "get-started", label: t("footer.items.getStarted"), to: "/register", auth: true },
      ],
    },
    {
      id: "docs",
      title: t("footer.columns.docs"),
      items: [
        {
          id: "documentation",
          label: t("footer.items.documentation"),
          href: publicDocsDocumentUrl("documentation", lang),
          external: true,
        },
        {
          id: "getting-started",
          label: t("footer.items.gettingStarted"),
          href: publicDocsDocumentUrl("getting-started", lang),
          external: true,
        },
        {
          id: "kiosk-setup",
          label: t("footer.items.kioskSetup"),
          href: publicDocsDocumentUrl("kiosk-setup", lang),
          external: true,
        },
        {
          id: "groups-members",
          label: t("footer.items.groupsMembers"),
          href: publicDocsDocumentUrl("groups-members", lang),
          external: true,
        },
        {
          id: "billing-plans",
          label: t("footer.items.billingPlans"),
          href: publicDocsDocumentUrl("billing-plans", lang),
          external: true,
        },
        {
          id: "faq",
          label: t("footer.items.faq"),
          href: publicDocsDocumentUrl("faq", lang),
          external: true,
        },
      ],
    },
    {
      id: "usage",
      title: t("footer.columns.usage"),
      items: [
        {
          id: "privacy",
          label: t("footer.items.privacyPolicy"),
          href: publicDocsDocumentUrl("privacy-policy", lang),
          external: true,
        },
        {
          id: "terms",
          label: t("footer.items.termsOfUse"),
          href: publicDocsDocumentUrl("terms-of-use", lang),
          external: true,
        },
        {
          id: "support",
          label: t("footer.items.support"),
          href: publicDocsDocumentUrl("support", lang),
          external: true,
        },
        { id: "contact", label: t("footer.items.contact"), to: promoPathFor("/contact", lang) },
        {
          id: "status",
          label: t("footer.items.status"),
          href: statusHome,
          external: true,
        },
      ],
    },
  ];
}
