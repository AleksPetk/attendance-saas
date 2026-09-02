import { Link, useLocation, useNavigationType } from "react-router-dom";
import { useLayoutEffect, useMemo, useState } from "react";
import { Wordmark } from "./components.jsx";
import { brandLogoMark, brandLogoText } from "./assets/brand/brandLogo.js";
import { footerItemIsLinked, splitFooterItemsIntoColumns } from "./publicFooterLinks.js";
import { buildPublicFooterColumns } from "./promo/footerColumns.js";
import PromoLanguageMenu from "./promo/PromoLanguageMenu.jsx";
import { usePromoLocale } from "./promo/PromoLocaleContext.jsx";
import { promoLogicalPath } from "./promo/locale.js";

function BrandPicture({ asset, className, decorative = false }) {
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={asset.avifSrc} />
      <source type="image/webp" srcSet={asset.webpSrc} />
      <img
        src={asset.pngSrc}
        alt={decorative ? "" : asset.alt}
        width={asset.width}
        height={asset.height}
        decoding="async"
        aria-hidden={decorative ? true : undefined}
      />
    </picture>
  );
}

function FooterItemList({ items, handoffToAuth }) {
  return (
    <ul className="public-footer-col-list">
      {items.map((item) => (
        <li key={item.id}>
          {typeof item.href === "string" && item.href ? (
            <a
              href={item.href}
              {...(item.external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {item.label}
            </a>
          ) : item.auth && typeof item.to === "string" ? (
            <a
              href={item.to}
              onClick={(event) => {
                event.preventDefault();
                handoffToAuth(item.to);
              }}
            >
              {item.label}
            </a>
          ) : footerItemIsLinked(item) ? (
            <Link to={item.to}>{item.label}</Link>
          ) : (
            <span className="public-footer-item-disabled">{item.label}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function FooterLinkColumn({ title, items, handoffToAuth }) {
  const [leftItems, rightItems] = splitFooterItemsIntoColumns(items);

  return (
    <div className="public-footer-col">
      <h3 className="public-footer-col-title">{title}</h3>
      <div className="public-footer-col-split">
        <FooterItemList items={leftItems} handoffToAuth={handoffToAuth} />
        <FooterItemList items={rightItems} handoffToAuth={handoffToAuth} />
      </div>
    </div>
  );
}

export default function PublicPageShell({ children }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const { t, locale, pathFor, handoffToAuth } = usePromoLocale();
  const path = location.pathname;
  const logical = promoLogicalPath(path);
  const [menuOpen, setMenuOpen] = useState(false);
  const copyrightYear = new Date().getFullYear();
  const footerColumns = useMemo(() => buildPublicFooterColumns(locale, t), [locale, t]);

  useLayoutEffect(() => {
    if (location.hash) {
      const targetId = decodeURIComponent(location.hash.slice(1));
      document.getElementById(targetId)?.scrollIntoView();
      return;
    }

    if (navigationType !== "POP") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [location.key, location.hash, navigationType]);

  const active = useMemo(() => {
    if (logical === "/") return "home";
    if (logical.startsWith("/features")) return "features";
    if (logical.startsWith("/how-it-works")) return "how-it-works";
    if (logical.startsWith("/pricing")) return "pricing";
    if (logical.startsWith("/contact")) return "contact";
    return "";
  }, [logical]);

  return (
    <div className={`public-shell${locale === "ja" ? " public-shell--ja" : ""}`}>
      <header className="public-nav">
        <Link
          to={pathFor("/")}
          className="public-nav-brand"
          aria-label={t("shell.brandAria")}
        >
          <Wordmark logo />
        </Link>
        <div className="public-nav-end">
          <nav
            className={menuOpen ? "public-nav-links open" : "public-nav-links"}
            aria-label={t("shell.navAria")}
          >
            <Link
              className={active === "home" ? "public-nav-link active" : "public-nav-link"}
              to={pathFor("/")}
              onClick={() => setMenuOpen(false)}
            >
              {t("shell.navHome")}
            </Link>
            <Link
              className={active === "features" ? "public-nav-link active" : "public-nav-link"}
              to={pathFor("/features")}
              onClick={() => setMenuOpen(false)}
            >
              {t("shell.navFeatures")}
            </Link>
            <Link
              className={active === "how-it-works" ? "public-nav-link active" : "public-nav-link"}
              to={pathFor("/how-it-works")}
              onClick={() => setMenuOpen(false)}
            >
              {t("shell.navHowItWorks")}
            </Link>
            <Link
              className={active === "pricing" ? "public-nav-link active" : "public-nav-link"}
              to={pathFor("/pricing")}
              onClick={() => setMenuOpen(false)}
            >
              {t("shell.navPricing")}
            </Link>
            <a
              className="public-nav-link"
              href="/login"
              onClick={(event) => {
                event.preventDefault();
                setMenuOpen(false);
                handoffToAuth("/login");
              }}
            >
              {t("shell.navLogin")}
            </a>
            <a
              className="public-nav-link primary"
              href="/register"
              onClick={(event) => {
                event.preventDefault();
                setMenuOpen(false);
                handoffToAuth("/register");
              }}
            >
              {t("shell.navGetStarted")}
            </a>
          </nav>
          <div className="public-nav-language">
            <PromoLanguageMenu />
          </div>
          <button
            type="button"
            className="public-nav-toggle"
            aria-expanded={menuOpen}
            aria-label={t("shell.toggleNavAria")}
            onClick={() => setMenuOpen((open) => !open)}
          >
            ☰
          </button>
        </div>
      </header>
      <main className="public-container">{children}</main>
      <footer className="public-footer">
        <div className="public-footer-inner">
          <div className="public-footer-brand">
            <Link
              to={pathFor("/")}
              className="public-footer-brand-link"
              aria-label={t("shell.brandAria")}
            >
              <BrandPicture asset={brandLogoText} className="public-footer-logo-text" />
            </Link>
            <p className="public-footer-tagline">{t("shell.footerTagline")}</p>
            <div className="public-footer-copy">
              <p className="public-footer-copy-line">
                {t("shell.footerCopyright", { year: copyrightYear })}
              </p>
              <p className="public-footer-copy-line public-footer-copy-rights">
                <BrandPicture
                  asset={brandLogoMark}
                  className="public-footer-logo-mark"
                  decorative
                />
                <span>{t("shell.footerRights")}</span>
              </p>
            </div>
          </div>
          <nav className="public-footer-columns" aria-label={t("shell.footerNavAria")}>
            {footerColumns.map((column) => (
              <FooterLinkColumn
                key={column.id}
                title={column.title}
                items={column.items}
                handoffToAuth={handoffToAuth}
              />
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
