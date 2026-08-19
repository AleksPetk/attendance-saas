import { Link, useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
import { Wordmark } from "./components.jsx";

export default function PublicPageShell({ children }) {
  const location = useLocation();
  const path = location.pathname;
  const [menuOpen, setMenuOpen] = useState(false);

  const active = useMemo(() => {
    if (path === "/") return "home";
    if (path.startsWith("/features")) return "features";
    if (path.startsWith("/how-it-works")) return "how-it-works";
    if (path.startsWith("/pricing")) return "pricing";
    if (path.startsWith("/login")) return "login";
    if (path.startsWith("/register")) return "register";
    if (path.startsWith("/staff-login")) return "staff-login";
    return "";
  }, [path]);

  return (
    <div className="public-shell">
      <header className="public-nav">
        <Link to="/" className="public-nav-brand">
          <Wordmark subtitle="Configurable check-in" />
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
          <Wordmark subtitle="Configurable check-in platform" />
          <p>© {new Date().getFullYear()} Check Station. All rights reserved.</p>
          <div className="public-footer-links">
            <Link to="/features">Features</Link>
            <Link to="/how-it-works">How it works</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/staff-login">Staff login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
