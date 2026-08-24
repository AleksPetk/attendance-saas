import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import SignInScreen from "./SignInScreen.jsx";
import WorkspaceLayout from "./WorkspaceLayout.jsx";
import MembersScreen from "./MembersScreen.jsx";
import MemberCreateScreen from "./MemberCreateScreen.jsx";
import MemberProfileScreen from "./MemberProfileScreen.jsx";
import GroupsScreen from "./GroupsScreen.jsx";
import GroupEditorScreen from "./GroupEditorScreen.jsx";
import GroupDetailScreen from "./GroupDetailScreen.jsx";
import GroupClassDetailScreen from "./GroupClassDetailScreen.jsx";
import KioskSettingsScreen from "./kiosk/KioskSettingsScreen.jsx";
import KioskBuilderScreen from "./kiosk/builder/KioskBuilderScreen.jsx";
import HistoryScreen from "./HistoryScreen.jsx";
import GroupKioskScreen from "./GroupKioskScreen.jsx";

import PublicHomeScreen from "./PublicHomeScreen.jsx";
import PublicFeaturesScreen from "./PublicFeaturesScreen.jsx";
import PublicHowItWorksScreen from "./PublicHowItWorksScreen.jsx";
import PublicPricingScreen from "./PublicPricingScreen.jsx";
import OwnerLoginScreen from "./OwnerLoginScreen.jsx";
import StaffLoginScreen from "./StaffLoginScreen.jsx";
import RegisterScreen from "./RegisterScreen.jsx";
import CheckEmailScreen from "./CheckEmailScreen.jsx";
import VerifyEmailScreen from "./VerifyEmailScreen.jsx";
import VerifyBackupEmailScreen from "./VerifyBackupEmailScreen.jsx";
import VerifyPrimaryEmailScreen from "./VerifyPrimaryEmailScreen.jsx";
import ForgotPasswordScreen from "./ForgotPasswordScreen.jsx";
import ResetPasswordScreen from "./ResetPasswordScreen.jsx";
import DashboardScreen from "./DashboardScreen.jsx";
import StaffManagementScreen from "./StaffManagementScreen.jsx";
import AccountScreen from "./AccountScreen.jsx";
import { api } from "./api.js";
import { LoadingState } from "./components.jsx";
import { confirmWorkspaceLeave } from "./kiosk/builder/workspaceLeaveGuard.js";

const SESSION_KEY = "attendance-saas-local-session";

function beginKioskExitGuard() {
  window.__kioskExitGuardUntil = Date.now() + 2500;
}

function readSession() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function MemberProfileByParam({ session, onNavigate }) {
  const { memberId } = useParams();
  return (
    <MemberProfileScreen
      session={session}
      memberId={memberId ? Number(memberId) : undefined}
      onNavigate={onNavigate}
    />
  );
}

function GroupEditorByParam({ session, onNavigate }) {
  const { groupId } = useParams();
  return <GroupEditorScreen session={session} groupId={groupId ? Number(groupId) : undefined} onNavigate={onNavigate} />;
}

function GroupKioskBuilderByParam({ session, onNavigate }) {
  const { groupId } = useParams();
  return (
    <KioskBuilderScreen
      session={session}
      groupId={groupId ? Number(groupId) : undefined}
      onNavigate={onNavigate}
    />
  );
}

function GroupKioskSettingsByParam({ session, onNavigate }) {
  const { groupId } = useParams();
  return (
    <KioskSettingsScreen
      session={session}
      groupId={groupId ? Number(groupId) : undefined}
      onNavigate={onNavigate}
    />
  );
}

function GroupDetailByParam({ session, onNavigate }) {
  const { groupId } = useParams();
  return <GroupDetailScreen session={session} groupId={groupId ? Number(groupId) : undefined} onNavigate={onNavigate} />;
}

function GroupClassDetailByParam({ session, onNavigate }) {
  const { groupId, classId } = useParams();
  return (
    <GroupClassDetailScreen
      session={session}
      groupId={groupId ? Number(groupId) : undefined}
      classId={classId ? Number(classId) : undefined}
      onNavigate={onNavigate}
    />
  );
}

function kioskTargetPath(workspace) {
  const groupId = workspace?.kiosk_group_id;
  if (groupId) return `/kiosk/${groupId}`;
  return "/kiosk/locked";
}

function KioskByParam({ session, onUnlocked, onKioskEntered }) {
  const { groupId } = useParams();
  const numericId = groupId && groupId !== "locked" ? Number(groupId) : 0;
  return (
    <GroupKioskScreen
      session={session}
      groupId={numericId || session?.workspace?.kiosk_group_id || 0}
      onUnlocked={onUnlocked}
      onKioskEntered={onKioskEntered}
    />
  );
}

function RequireSession({ loadingSession, session, children }) {
  if (loadingSession) {
    return (
      <div className="page">
        <LoadingState label="Loading workspace…" />
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function RedirectIfSignedIn({ session, children }) {
  if (session?.workspace?.kiosk_locked) {
    return <Navigate to={kioskTargetPath(session.workspace)} replace />;
  }
  if (session) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function KioskLockGate({ loadingSession, session, children }) {
  const location = useLocation();
  if (loadingSession) {
    return (
      <div className="page">
        <LoadingState label="Loading workspace…" />
      </div>
    );
  }
  const locked = Boolean(session?.workspace?.kiosk_locked);
  if (locked) {
    const target = kioskTargetPath(session.workspace);
    if (!location.pathname.startsWith("/kiosk/")) {
      return <Navigate to={target} replace />;
    }
    const lockedId = session.workspace.kiosk_group_id;
    const match = location.pathname.match(/^\/kiosk\/([^/]+)/);
    if (lockedId && match && match[1] !== "locked" && match[1] !== String(lockedId)) {
      return <Navigate to={`/kiosk/${lockedId}`} replace />;
    }
  }
  return children;
}

function WorkspaceRoutes({ session, setSession, onKioskEntered, onKioskUnlockedLocally }) {
  const isOwner = session.workspace.account_kind === "owner";
  const kioskLocked = Boolean(session.workspace.kiosk_locked);
  const canUseKiosk = isOwner || kioskLocked;
  const nav = useNavigate();
  const location = useLocation();
  const sidebarRoute = (() => {
    if (location.pathname.startsWith("/dashboard")) return { name: "dashboard" };
    if (location.pathname.startsWith("/account")) return { name: "account" };
    if (location.pathname.startsWith("/staff")) return { name: "staff" };
    if (location.pathname.startsWith("/history")) return { name: "history" };
    if (location.pathname.startsWith("/groups")) {
      if (location.pathname.includes("/kiosk-builder")) return { name: "kiosk-builder" };
      if (location.pathname.includes("/kiosk-settings")) return { name: "kiosk-settings" };
      return { name: "groups" };
    }
    return { name: "members" };
  })();

  function onNavigate(route) {
    if (!route || !route.name) return;
    if (!confirmWorkspaceLeave()) return;
    if (route.name === "members") {
      nav(route.status === "archived" ? "/members?status=archived" : "/members", {
        replace: Boolean(route.replace),
      });
    }
    if (route.name === "dashboard") nav("/dashboard");
    if (route.name === "account") nav("/account");
    if (route.name === "staff") nav("/staff");
    if (route.name === "member-editor" || route.name === "member-create") {
      if (route.memberId) nav(`/members/${route.memberId}`);
      else nav("/members/new");
    }
    if (route.name === "member-profile") nav(`/members/${route.memberId}`);
    if (route.name === "groups") {
      nav(route.status === "archived" ? "/groups?status=archived" : "/groups", {
        replace: Boolean(route.replace),
      });
    }
    if (route.name === "group-editor") {
      if (route.groupId) nav(`/groups/${route.groupId}/edit`);
      else nav("/groups/new");
    }
    if (route.name === "group-detail") nav(`/groups/${route.groupId}`);
    if (route.name === "group-class") {
      nav(`/groups/${route.groupId}/classes/${route.classId}`);
    }
    if (route.name === "kiosk-builder") nav(`/groups/${route.groupId}/kiosk-builder`);
    if (route.name === "kiosk-settings") nav(`/groups/${route.groupId}/kiosk-settings`);
    if (route.name === "history") nav(`/history`);
    if (route.name === "kiosk") nav(`/kiosk/${route.groupId}`);
  }

  function onKioskUnlocked({ groupAvailable, lockPayload } = {}) {
    const match = location.pathname.match(/^\/kiosk\/(\d+)/);
    const groupId = match ? Number(match[1]) : session.workspace.kiosk_group_id;
    beginKioskExitGuard();
    flushSync(() => {
      onKioskUnlockedLocally(lockPayload);
    });
    if (groupAvailable && groupId) {
      nav(`/groups/${groupId}`, { replace: true });
    } else {
      nav("/groups", { replace: true });
    }
  }

  if (location.pathname.startsWith("/kiosk/")) {
    return (
      <Routes>
        <Route
          path="/kiosk/:groupId"
          element={
            canUseKiosk ? (
              <KioskByParam
                session={session}
                onUnlocked={onKioskUnlocked}
                onKioskEntered={onKioskEntered}
              />
            ) : (
              <div className="page" style={{ padding: "var(--space-8)" }}>
                <div className="empty-state">
                  <h2>Owner-only</h2>
                  <p>Only the paying workspace owner can launch the kiosk in this local slice.</p>
                </div>
              </div>
            )
          }
        />
      </Routes>
    );
  }

  if (location.pathname.includes("/kiosk-builder")) {
    return (
      <Routes>
        <Route
          path="/groups/:groupId/kiosk-builder"
          element={<GroupKioskBuilderByParam session={session} onNavigate={onNavigate} />}
        />
      </Routes>
    );
  }

  return (
    <WorkspaceLayout
      session={session}
      route={sidebarRoute}
      onNavigate={onNavigate}
      onSignOut={() => {
        api.logout().catch(() => {});
        setSession(null);
        nav("/login");
      }}
    >
      <Routes>
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="/account" element={<AccountScreen onAccountDeleted={() => {
          setSession(null);
          nav("/login?deleted=1");
        }} />} />
        <Route path="/members" element={<MembersScreen session={session} onNavigate={onNavigate} />} />
        <Route path="/members/new" element={<MemberCreateScreen session={session} onNavigate={onNavigate} />} />
        <Route path="/members/:memberId" element={<MemberProfileByParam session={session} onNavigate={onNavigate} />} />
        <Route path="/groups" element={<GroupsScreen session={session} onNavigate={onNavigate} />} />
        <Route path="/groups/new" element={<GroupEditorScreen session={session} onNavigate={onNavigate} />} />
        <Route path="/groups/:groupId/edit" element={<GroupEditorByParam session={session} onNavigate={onNavigate} />} />
        <Route path="/groups/:groupId/kiosk-settings" element={<GroupKioskSettingsByParam session={session} onNavigate={onNavigate} />} />
        <Route
          path="/groups/:groupId/classes/:classId"
          element={<GroupClassDetailByParam session={session} onNavigate={onNavigate} />}
        />
        <Route path="/groups/:groupId" element={<GroupDetailByParam session={session} onNavigate={onNavigate} />} />
        <Route path="/history" element={<HistoryScreen session={session} />} />
        <Route path="/staff" element={<StaffManagementScreen session={session} onNavigate={onNavigate} />} />
      </Routes>
    </WorkspaceLayout>
  );
}

export default function App() {
  const [session, setSession] = useState(readSession);
  const [loadingSession, setLoadingSession] = useState(true);
  const sessionIdentity = session?.workspace?.identity;

  useEffect(() => {
    if (session) {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      window.sessionStorage.removeItem(SESSION_KEY);
    }
  }, [session]);

  useEffect(() => {
    if (!sessionIdentity) return;
    api.csrf().catch(() => {});
  }, [sessionIdentity]);

  useEffect(() => {
    let cancelled = false;
    async function hydrateFromServer() {
      try {
        const result = await api.loadWorkspace(null);
        if (cancelled) return;
        setSession({ workspace: result.data });
      } catch {
        if (cancelled) return;
        setSession(null);
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    }
    hydrateFromServer();
    return () => {
      cancelled = true;
    };
  }, []);

  function markKioskLocked(groupId, lockPayload) {
    setSession((current) => {
      if (!current?.workspace || !groupId) return current;
      const nextStatus = {
        kiosk_locked: true,
        kiosk_group_id: groupId,
        kiosk_available: true,
        ...(lockPayload || {}),
      };
      if (
        current.workspace.kiosk_locked &&
        Number(current.workspace.kiosk_group_id) === Number(groupId) &&
        current.workspace.kiosk_available === nextStatus.kiosk_available
      ) {
        return current;
      }
      return {
        workspace: {
          ...current.workspace,
          ...nextStatus,
        },
      };
    });
  }

  function clearKioskLockLocally(lockPayload) {
    setSession((current) => {
      if (!current?.workspace) return current;
      const nextStatus = {
        kiosk_locked: false,
        kiosk_group_id: null,
        kiosk_available: false,
        ...(lockPayload || {}),
      };
      if (!current.workspace.kiosk_locked && !lockPayload) return current;
      return {
        workspace: {
          ...current.workspace,
          ...nextStatus,
        },
      };
    });
  }

  return (
    <BrowserRouter>
      <KioskLockGate loadingSession={loadingSession} session={session}>
        <Routes>
          <Route path="/" element={<PublicHomeScreen />} />
          <Route path="/features" element={<PublicFeaturesScreen />} />
          <Route path="/how-it-works" element={<PublicHowItWorksScreen />} />
          <Route path="/pricing" element={<PublicPricingScreen />} />
          <Route
            path="/login"
            element={
              <RedirectIfSignedIn session={session}>
                <OwnerLoginScreen
                  onSignedIn={(next) => {
                    setSession(next);
                  }}
                />
              </RedirectIfSignedIn>
            }
          />
          <Route
            path="/staff-login"
            element={
              <RedirectIfSignedIn session={session}>
                <StaffLoginScreen
                  onSignedIn={(next) => {
                    setSession(next);
                  }}
                />
              </RedirectIfSignedIn>
            }
          />
          <Route
            path="/register"
            element={
              <RedirectIfSignedIn session={session}>
                <RegisterScreen />
              </RedirectIfSignedIn>
            }
          />
          <Route path="/check-email" element={<CheckEmailScreen />} />
          <Route
            path="/verify-email/:uid/:token"
            element={
              <VerifyEmailScreen
                onSignedIn={(next) => {
                  setSession(next);
                }}
              />
            }
          />
          <Route path="/verify-backup-email/:uid/:token" element={<VerifyBackupEmailScreen />} />
          <Route path="/verify-primary-email/:uid/:token" element={<VerifyPrimaryEmailScreen />} />
          <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
          <Route path="/reset-password/:uid/:token" element={<ResetPasswordScreen />} />
          <Route
            path="/*"
            element={
              <RequireSession loadingSession={loadingSession} session={session}>
                <WorkspaceRoutes
                  session={session}
                  setSession={setSession}
                  onKioskEntered={markKioskLocked}
                  onKioskUnlockedLocally={clearKioskLockLocally}
                />
              </RequireSession>
            }
          />
        </Routes>
      </KioskLockGate>
    </BrowserRouter>
  );
}
