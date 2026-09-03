import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState as EmptyStateComponent, PhotoThumb, StatusBadge, Wordmark } from "./components.jsx";
import {
  canManageOwnerAccount,
  canManageStaffAccounts,
  canViewGlobalMembers,
  isWorkspaceOwner,
  workspaceTopbarNotice,
} from "./workspaceSession.js";
import { SidebarAccountChip } from "./workspaceSidebarAccount.js";
import WorkspaceAnnouncementBell from "./WorkspaceAnnouncementBell.jsx";
import { WorkspaceLanguageMenu } from "./i18n/LanguageSwitcher.jsx";
import {
  canAccessStaffManagement,
  shouldShowLockedStaffNav,
} from "./workspaceEntitlements.js";
import workspaceHeaderIcon from "./assets/brand/workspace-header-icon.webp";

const NAV_ITEM_KEYS = [
  { name: "dashboard", labelKey: "nav.dashboard", icon: "▦" },
  { name: "members", labelKey: "nav.members", icon: "◉", requiresGlobalMembers: true },
  { name: "groups", labelKey: "nav.groups", icon: "◈" },
  { name: "history", labelKey: "nav.history", icon: "↻" },
  { name: "staff", labelKey: "nav.staff", icon: "🔑", requiresStaffManagement: true },
  { name: "account", labelKey: "nav.account", icon: "⚙", requiresOwnerAccount: true },
];

const PAGE_TITLE_KEYS = {
  dashboard: "pageTitles.dashboard",
  members: "pageTitles.members",
  "member-editor": "pageTitles.members",
  "member-create": "pageTitles.members",
  "member-profile": "pageTitles.members",
  groups: "pageTitles.groups",
  "group-editor": "pageTitles.groups",
  "group-detail": "pageTitles.groups",
  "kiosk-settings": "pageTitles.kioskSettings",
  "kiosk-builder": "pageTitles.kioskBuilder",
  history: "pageTitles.history",
  staff: "pageTitles.staff",
  account: "pageTitles.account",
};

function isNavActive(routeName, itemName) {
  if (itemName === "members") {
    return (
      routeName === "members" ||
      routeName === "member-editor" ||
      routeName === "member-create" ||
      routeName === "member-profile"
    );
  }
  if (itemName === "groups") {
    return routeName === "groups" || routeName === "group-editor" || routeName === "group-detail" || routeName === "kiosk-settings" || routeName === "kiosk-builder";
  }
  return routeName === itemName;
}

export default function WorkspaceLayout({ session, route, onNavigate, onSignOut, children }) {
  const { t } = useTranslation(["workspace", "common"]);
  const topbarNotice = workspaceTopbarNotice(session);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pageTitleKey = PAGE_TITLE_KEYS[route.name] || "pageTitles.workspace";
  const pageTitle = t(pageTitleKey);

  const roleCanManageStaff = canManageStaffAccounts(session);
  const staffUnlocked = canAccessStaffManagement(session, roleCanManageStaff);
  const staffLocked = shouldShowLockedStaffNav(session, roleCanManageStaff);

  const visibleNavItems = useMemo(
    () =>
      NAV_ITEM_KEYS.filter((item) => {
        if (item.requiresOwnerAccount) return canManageOwnerAccount(session);
        if (item.requiresStaffManagement) return staffUnlocked || staffLocked;
        if (item.requiresGlobalMembers) return canViewGlobalMembers(session);
        return true;
      }),
    [session, staffLocked, staffUnlocked],
  );

  return (
    <div className="workspace-shell">
      {sidebarOpen ? (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label={t("common:closeNavigation")}
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside className={sidebarOpen ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <Wordmark name={t("common:productName")} subtitle={t("workspaceSubtitle")} />
        </div>
        <nav className="sidebar-nav" aria-label={t("pageTitles.workspace")}>
          {visibleNavItems.map((item) => {
            const lockedStaff = item.name === "staff" && staffLocked && !staffUnlocked;
            return (
              <button
                key={item.name}
                type="button"
                className={`nav-link${isNavActive(route.name, item.name) ? " active" : ""}${
                  lockedStaff ? " is-plan-locked" : ""
                }`}
                title={lockedStaff ? t("staffNavLocked") : undefined}
                data-tutorial-target={`sidebar-${item.name}`}
                onClick={() => {
                  onNavigate({ name: item.name });
                  setSidebarOpen(false);
                }}
              >
                <span className="nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                {t(item.labelKey)}
                {lockedStaff ? (
                  <span className="nav-lock-badge" aria-label={t("common:upgradeRequired")}>
                    {t("common:locked")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-account">
          <SidebarAccountChip session={session} />
          <button type="button" className="btn-text" onClick={onSignOut}>
            {t("common:signOut")}
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="sidebar-toggle"
              aria-label={t("common:openMenu")}
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>
            <div className="topbar-copy">
              <p className="eyebrow">{t("common:productName")}</p>
              <h1>{pageTitle}</h1>
            </div>
          </div>
          {isWorkspaceOwner(session) && topbarNotice ? (
            <p className="notice">{topbarNotice}</p>
          ) : null}
          <div className="workspace-topbar-actions">
            <WorkspaceLanguageMenu />
            <WorkspaceAnnouncementBell session={session} onNavigate={onNavigate} />
            <img
              className="workspace-header-icon"
              src={workspaceHeaderIcon}
              alt=""
              width="36"
              height="36"
              decoding="async"
              aria-hidden="true"
            />
          </div>
        </header>
        <div className="content">
          <div className="content-inner">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }) {
  return <EmptyStateComponent title={title} body={body} action={action} />;
}

export function PersonRow({
  person,
  subtitle,
  status,
  onOpen,
  actions,
  inactive = false,
  planLocked = false,
}) {
  const { t } = useTranslation("common");
  const identity = (
    <>
      <PhotoThumb url={person.photo_url} name={person.name} />
      <div className="person-copy">
        <strong>{person.name}</strong>
        <p className="person-subtitle">{subtitle}</p>
      </div>
    </>
  );
  return (
    <article
      className={`person-row${inactive ? " person-row-inactive" : ""}${
        planLocked ? " person-row-plan-locked" : ""
      }`}
    >
      {onOpen ? (
        <button type="button" className="person-main" onClick={onOpen}>
          {identity}
        </button>
      ) : (
        <div className="person-main static">{identity}</div>
      )}
      <div className="person-meta">
        {status ? <StatusBadge status={status} /> : null}
        {planLocked ? <span className="plan-locked-badge">{t("planLocked")}</span> : null}
        {actions}
      </div>
    </article>
  );
}
