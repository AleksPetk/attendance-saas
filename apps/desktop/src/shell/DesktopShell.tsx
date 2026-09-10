import { useEffect, useId, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { canManageOwnerAccount, canManageStaffAccounts, canViewBilling, canViewGlobalMembers, workspacePlanKey } from "@checkstation/domain";
import { Brand, BrandMark, Button, Badge } from "../components/ui";
import { DesktopAnnouncementBell } from "../components/DesktopAnnouncementBell";
import { useApp } from "../lib/AppProvider";

export function DesktopShell() {
  const { t, auth, authState, locale, setLocale } = useApp(); const location = useLocation(); const navigate = useNavigate(); const session = authState.session;
  const items = [
    { to: "/", label: t("dashboard.title"), icon: "home", show: true },
    { to: "/people", label: t("nav.members"), icon: "people", show: canViewGlobalMembers(session) },
    { to: "/groups", label: t("nav.groups"), icon: "groups", show: true },
    { to: "/history", label: t("nav.history"), icon: "history", show: true },
    { to: "/staff", label: t("nav.staff"), icon: "staff", show: canManageStaffAccounts(session) },
    { to: "/account", label: t("nav.account"), icon: "account", show: canManageOwnerAccount(session) },
    { to: "/plan", label: t("nav.plan"), icon: "plan", show: canViewBilling(session) },
    { to: "/help", label: t("nav.help"), icon: "help", show: true },
  ];
  const page = items.find((item) => item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to));
  return <div className="app-shell"><aside className="sidebar"><Brand showMark={false} /><nav className="sidebar-nav">{items.filter((item) => item.show).map((item) => <NavLink className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`} end={item.to === "/"} key={item.to} to={item.to}><NavIcon name={item.icon} />{item.label}</NavLink>)}</nav><div className="sidebar-footer"><div className="workspace-chip"><strong>{String(session?.workspace?.name || t("app.name"))}</strong><span>{String(session?.workspace?.workspace_id || "")} · {String(session?.role || "")}</span><div className="workspace-plan"><Badge tone="blue">{String(workspacePlanKey(session)).toUpperCase()}</Badge></div></div><div className="sidebar-actions"><Button className="button-sm" disabled={locale === "en"} onClick={() => setLocale("en")} variant="ghost">EN</Button><Button className="button-sm" disabled={locale === "ja"} onClick={() => setLocale("ja")} variant="ghost">JA</Button><Button className="button-sm" onClick={() => void auth.logout()} variant="ghost">{t("nav.logout")}</Button></div></div></aside><main className="desktop-main"><header className="topbar"><div className="topbar-copy"><span className="topbar-eyebrow">{t("app.name").toUpperCase()}</span><h1>{page?.label || t("app.name")}</h1></div><div className="topbar-actions"><DesktopLanguageMenu locale={locale} onSelect={setLocale} /><DesktopAnnouncementBell onViewStatus={() => navigate("/help", { state: { view: "status" } })} /><BrandMark className="topbar-brand-logo" decorative={false} /></div></header><Outlet /></main></div>;
}

function DesktopLanguageMenu({ locale, onSelect }: { locale: "en" | "ja"; onSelect: (locale: "en" | "ja") => void }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div className="desktop-language-root" ref={rootRef}><button aria-controls={menuId} aria-expanded={open} aria-haspopup="menu" aria-label="Language" className="desktop-language-trigger" onClick={() => setOpen((current) => !current)} title="Language" type="button"><GlobeIcon /></button>{open ? <div aria-label="Language" className="desktop-language-menu" id={menuId} role="menu">{([ ["en", "English"], ["ja", "日本語"] ] as const).map(([code, label]) => { const active = locale === code; return <button aria-checked={active} className={`desktop-language-option${active ? " is-active" : ""}`} key={code} onClick={() => { onSelect(code); setOpen(false); }} role="menuitemradio" type="button"><span>{label}</span>{active ? <span aria-hidden="true" className="desktop-language-check">✓</span> : null}</button>; })}</div> : null}</div>;
}

function GlobeIcon() {
  return <svg aria-hidden="true" fill="none" height="24" viewBox="0 0 24 24" width="24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>;
}

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5M9.5 20v-6h5v6" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-2.2A4.8 4.8 0 0 1 8.3 13h1.4a4.8 4.8 0 0 1 4.8 4.8V20M15 6.5a3 3 0 0 1 0 5.8M16 14a4.8 4.8 0 0 1 4.5 4.8V20" /></>,
    groups: <><rect x="3" y="4" width="7" height="7" rx="2" /><rect x="14" y="4" width="7" height="7" rx="2" /><rect x="3" y="15" width="7" height="6" rx="2" /><rect x="14" y="15" width="7" height="6" rx="2" /></>,
    history: <><path d="M4.7 7.3A8.5 8.5 0 1 1 3.5 15" /><path d="M4.7 3.5v3.8H1M12 7.5V12l3 2" /></>,
    staff: <><path d="M7 10V7a5 5 0 0 1 10 0v3" /><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M12 14v3" /></>,
    account: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    plan: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18M7 15h4" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.3 2.3 0 1 1 3.1 2.2c-.9.4-.9 1.2-.9 2M12 17h.01" /></>,
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
