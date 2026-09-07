import { NavLink, Outlet } from "react-router-dom";
import { useApp } from "../lib/AppProvider";

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  display: "block",
  padding: "10px 12px",
  borderRadius: 8,
  color: isActive ? "#fff" : "var(--sidebar-text)",
  background: isActive ? "rgba(15,118,110,0.55)" : "transparent",
  textDecoration: "none",
  marginBottom: 4,
});

export function DesktopShell() {
  const { t, auth, authState, locale, setLocale } = useApp();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", height: "100%" }}>
      <aside
        style={{
          background: "var(--sidebar)",
          color: "var(--sidebar-text)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>{t("app.name")}</div>
        <NavLink to="/" end style={linkStyle}>{t("nav.home")}</NavLink>
        <NavLink to="/groups" style={linkStyle}>{t("nav.groups")}</NavLink>
        <NavLink to="/people" style={linkStyle}>{t("nav.people")}</NavLink>
        <NavLink to="/history" style={linkStyle}>{t("nav.history")}</NavLink>
        <NavLink to="/staff" style={linkStyle}>{t("nav.staff")}</NavLink>
        <NavLink to="/plan" style={linkStyle}>{t("nav.plan")}</NavLink>
        <NavLink to="/account" style={linkStyle}>{t("nav.account")}</NavLink>
        <NavLink to="/help" style={linkStyle}>{t("nav.help")}</NavLink>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          {String(authState.session?.workspace?.workspace_id || "")}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setLocale("en")} disabled={locale === "en"}>EN</button>
          <button type="button" onClick={() => setLocale("ja")} disabled={locale === "ja"}>JA</button>
        </div>
        <button type="button" onClick={() => void auth.logout()}>{t("nav.logout")}</button>
      </aside>
      <main style={{ padding: 24, overflow: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
