import { useState } from "react";
import { EmptyState as EmptyStateComponent, PhotoThumb, StatusBadge, Wordmark } from "./components.jsx";
import {
  canManageOwnerAccount,
  canManageStaffAccounts,
  canViewGlobalMembers,
  workspaceRoleLabel,
  workspaceTopbarNotice,
} from "./workspaceSession.js";
import {
  canAccessStaffManagement,
  shouldShowLockedStaffNav,
} from "./workspaceEntitlements.js";

const NAV_ITEMS = [
  { name: "dashboard", label: "Dashboard", icon: "▦" },
  { name: "members", label: "Members", icon: "◉", requiresGlobalMembers: true },
  { name: "groups", label: "Groups", icon: "◈" },
  { name: "history", label: "History", icon: "↻" },
  { name: "staff", label: "Staff", icon: "🔑", requiresStaffManagement: true },
  { name: "account", label: "Account", icon: "⚙", requiresOwnerAccount: true },
];

const PAGE_TITLES = {
  dashboard: "Dashboard",
  members: "Members",
  "member-editor": "Members",
  "member-create": "Members",
  "member-profile": "Members",
  groups: "Groups",
  "group-editor": "Groups",
  "group-detail": "Groups",
  "kiosk-settings": "Kiosk Settings",
  "kiosk-builder": "Kiosk Builder",
  history: "History",
  staff: "Staff management",
  account: "Account",
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
  const workspace = session.workspace;
  const roleLabel = workspaceRoleLabel(session);
  const topbarNotice = workspaceTopbarNotice(session);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pageTitle = PAGE_TITLES[route.name] || "Workspace";

  const roleCanManageStaff = canManageStaffAccounts(session);
  const staffUnlocked = canAccessStaffManagement(session, roleCanManageStaff);
  const staffLocked = shouldShowLockedStaffNav(session, roleCanManageStaff);

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.requiresOwnerAccount) return canManageOwnerAccount(session);
    if (item.requiresStaffManagement) return staffUnlocked || staffLocked;
    if (item.requiresGlobalMembers) return canViewGlobalMembers(session);
    return true;
  });

  return (
    <div className="workspace-shell">
      {sidebarOpen ? (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside className={sidebarOpen ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <Wordmark subtitle="Workspace" />
        </div>
        <nav className="sidebar-nav" aria-label="Workspace">
          {visibleNavItems.map((item) => {
            const lockedStaff = item.name === "staff" && staffLocked && !staffUnlocked;
            return (
              <button
                key={item.name}
                type="button"
                className={`nav-link${isNavActive(route.name, item.name) ? " active" : ""}${
                  lockedStaff ? " is-plan-locked" : ""
                }`}
                title={lockedStaff ? "Staff management requires Plus or Business" : undefined}
                onClick={() => {
                  onNavigate({ name: item.name });
                  setSidebarOpen(false);
                }}
              >
                <span className="nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
                {lockedStaff ? (
                  <span className="nav-lock-badge" aria-label="Upgrade required">
                    Locked
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-account">
          <div className="account-chip">
            <span className="account-email">{workspace.identity}</span>
            <span className="account-role">{roleLabel}</span>
          </div>
          <button type="button" className="btn-text" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="sidebar-toggle"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>
            <div className="topbar-copy">
              <p className="eyebrow">Check Station</p>
              <h1>{pageTitle}</h1>
            </div>
          </div>
          {topbarNotice ? (
            <p className="notice">{topbarNotice}</p>
          ) : null}
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
        {planLocked ? <span className="plan-locked-badge">Plan locked</span> : null}
        {actions}
      </div>
    </article>
  );
}
