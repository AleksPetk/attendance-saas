import { Link, useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
import { Wordmark } from "./components.jsx";
import { brandLogoMark, brandLogoText } from "./assets/brand/brandLogo.js";
import {
  PUBLIC_FOOTER_COLUMNS,
  footerItemIsLinked,
  splitFooterItemsIntoColumns,
} from "./publicFooterLinks.js";

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

function FooterItemList({ items }) {
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

function FooterLinkColumn({ title, items }) {
  const [leftItems, rightItems] = splitFooterItemsIntoColumns(items);

  return (
    <div className="public-footer-col">
      <h3 className="public-footer-col-title">{title}</h3>
      <div className="public-footer-col-split">
        <FooterItemList items={leftItems} />
        <FooterItemList items={rightItems} />
      </div>
    </div>
  );
}

export default function PublicPageShell({ children }) {
  const location = useLocation();
  const path = location.pathname;
  const [menuOpen, setMenuOpen] = useState(false);
  const copyrightYear = new Date().getFullYear();

  const active = useMemo(() => {
    if (path === "/") return "home";
    if (path.startsWith("/features")) return "features";
    if (path.startsWith("/how-it-works")) return "how-it-works";
    if (path.startsWith("/pricing")) return "pricing";
    if (path.startsWith("/contact")) return "contact";
    if (path.startsWith("/login")) return "login";
    if (path.startsWith("/register")) return "register";
    if (path.startsWith("/staff-login")) return "staff-login";
    return "";
  }, [path]);

  return (
    <div className="public-shell">
      <header className="public-nav">
        <Link to="/" className="public-nav-brand" aria-label="Check Station">
          <Wordmark logo />
        </Link>
        <button
          type="button"
          className="public-nav-toggle"
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          ☰
        </button>
        <nav
          className={menuOpen ? "public-nav-links open" : "public-nav-links"}
          aria-label="Public navigation"
        >
          <Link
            className={active === "home" ? "public-nav-link active" : "public-nav-link"}
            to="/"
            onClick={() => setMenuOpen(false)}
          >
            Home
          </Link>
          <Link
            className={active === "features" ? "public-nav-link active" : "public-nav-link"}
            to="/features"
            onClick={() => setMenuOpen(false)}
          >
            Features
          </Link>
          <Link
            className={active === "how-it-works" ? "public-nav-link active" : "public-nav-link"}
            to="/how-it-works"
            onClick={() => setMenuOpen(false)}
          >
            How it works
          </Link>
          <Link
            className={active === "pricing" ? "public-nav-link active" : "public-nav-link"}
            to="/pricing"
            onClick={() => setMenuOpen(false)}
          >
            Pricing
          </Link>
          <Link className="public-nav-link" to="/login" onClick={() => setMenuOpen(false)}>
            Login
          </Link>
          <Link className="public-nav-link primary" to="/register" onClick={() => setMenuOpen(false)}>
            Get started
          </Link>
        </nav>
      </header>
      <main className="public-container">{children}</main>
      <footer className="public-footer">
        <div className="public-footer-inner">
          <div className="public-footer-brand">
            <Link to="/" className="public-footer-brand-link" aria-label="Check Station">
              <BrandPicture asset={brandLogoText} className="public-footer-logo-text" />
            </Link>
            <p className="public-footer-tagline">Configurable check-in platform</p>
            <div className="public-footer-copy">
              <p className="public-footer-copy-line">© {copyrightYear} CheckStation</p>
              <p className="public-footer-copy-line public-footer-copy-rights">
                <BrandPicture
                  asset={brandLogoMark}
                  className="public-footer-logo-mark"
                  decorative
                />
                <span>All rights reserved.</span>
              </p>
            </div>
          </div>
          <nav className="public-footer-columns" aria-label="Footer">
            {PUBLIC_FOOTER_COLUMNS.map((column) => (
              <FooterLinkColumn key={column.id} title={column.title} items={column.items} />
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
