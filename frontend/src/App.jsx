import { useEffect, useState } from "react";
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
import { MemberEditorScreen } from "./MembersScreen.jsx";
import GroupEditorScreen, { GroupsScreen } from "./GroupsScreen.jsx";
import GroupDetailScreen from "./GroupDetailScreen.jsx";
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
import ForgotPasswordScreen from "./ForgotPasswordScreen.jsx";
import ResetPasswordScreen from "./ResetPasswordScreen.jsx";
import DashboardScreen from "./DashboardScreen.jsx";
import StaffManagementScreen from "./StaffManagementScreen.jsx";
import AccountScreen from "./AccountScreen.jsx";
import { api } from "./api.js";
import { LoadingState } from "./components.jsx";

const SESSION_KEY = "attendance-saas-local-session";

function readSession() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function MemberEditorByParam({ session, onNavigate }) {
  const { memberId } = useParams();
  return (
    <MemberEditorScreen
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

function GroupDetailByParam({ session, onNavigate }) {
  const { groupId } = useParams();
  return <GroupDetailScreen session={session} groupId={groupId ? Number(groupId) : undefined} onNavigate={onNavigate} />;
}

function KioskByParam({ session, onNavigate }) {
  const { groupId } = useParams();
  return (
    <GroupKioskScreen
      session={session}
      groupId={groupId ? Number(groupId) : 0}
      onExit={() => onNavigate({ name: "group-detail", groupId: Number(groupId) })}
    />
  );
}

export default function App() {
  const [session, setSession] = useState(readSession);
  const [loadingSession, setLoadingSession] = useState(!readSession);

  useEffect(() => {
    if (session) {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      window.sessionStorage.removeItem(SESSION_KEY);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    // Ensure CSRF cookie exists for subsequent session-based POSTs (logout/reauth/etc).
    api.csrf().catch(() => {});
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    async function loadWorkspaceIfPossible() {
      if (session) {
        setLoadingSession(false);
        return;
      }
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
    loadWorkspaceIfPossible();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function RequireSession({ children }) {
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

  function RedirectIfSignedIn({ children }) {
    if (session) {
      return <Navigate to="/dashboard" replace />;
    }
    return children;
  }

  function WorkspaceRoutes() {
    const isOwner = session.workspace.account_kind === "owner";
    const nav = useNavigate();
    const location = useLocation();
    const sidebarRoute = (() => {
      if (location.pathname.startsWith("/dashboard")) return { name: "dashboard" };
      if (location.pathname.startsWith("/account")) return { name: "account" };
      if (location.pathname.startsWith("/staff")) return { name: "staff" };
      if (location.pathname.startsWith("/history")) return { name: "history" };
      if (location.pathname.startsWith("/groups")) return { name: "groups" };
      return { name: "members" };
    })();

    function onNavigate(route) {
      if (!route || !route.name) return;
      if (route.name === "members") nav("/members");
      if (route.name === "dashboard") nav("/dashboard");
      if (route.name === "account") nav("/account");
      if (route.name === "staff") nav("/staff");
      if (route.name === "member-editor") {
        if (route.memberId) nav(`/members/${route.memberId}`);
        else nav("/members/new");
      }
      if (route.name === "groups") nav("/groups");
      if (route.name === "group-editor") {
        if (route.groupId) nav(`/groups/${route.groupId}/edit`);
        else nav("/groups/new");
      }
      if (route.name === "group-detail") nav(`/groups/${route.groupId}`);
      if (route.name === "history") nav("/history");
      if (route.name === "kiosk") nav(`/kiosk/${route.groupId}`);
    }

    if (location.pathname.startsWith("/kiosk/")) {
      return (
        <Routes>
          <Route
            path="/kiosk/:groupId"
            element={
              isOwner ? (
                <KioskByParam session={session} onNavigate={onNavigate} />
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
          <Route path="/members/new" element={<MemberEditorScreen session={session} onNavigate={onNavigate} />} />
          <Route path="/members/:memberId" element={<MemberEditorByParam session={session} onNavigate={onNavigate} />} />
          <Route path="/groups" element={<GroupsScreen session={session} onNavigate={onNavigate} />} />
          <Route path="/groups/new" element={<GroupEditorScreen session={session} onNavigate={onNavigate} />} />
          <Route path="/groups/:groupId/edit" element={<GroupEditorByParam session={session} onNavigate={onNavigate} />} />
          <Route path="/groups/:groupId" element={<GroupDetailByParam session={session} onNavigate={onNavigate} />} />
          <Route path="/history" element={<HistoryScreen session={session} />} />
          <Route path="/staff" element={<StaffManagementScreen session={session} onNavigate={onNavigate} />} />
        </Routes>
      </WorkspaceLayout>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicHomeScreen />} />
        <Route path="/features" element={<PublicFeaturesScreen />} />
        <Route path="/how-it-works" element={<PublicHowItWorksScreen />} />
        <Route path="/pricing" element={<PublicPricingScreen />} />
        <Route
          path="/login"
          element={
            <RedirectIfSignedIn>
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
            <RedirectIfSignedIn>
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
            <RedirectIfSignedIn>
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
        <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
        <Route path="/reset-password/:uid/:token" element={<ResetPasswordScreen />} />

        {/*
          One splat parent keeps pathnameBase at `/`.
          Per-page parents like path="/dashboard" consumed the full URL, so the
          inner <Routes> in WorkspaceRoutes never matched and the main pane stayed empty.
        */}
        <Route
          path="/*"
          element={
            <RequireSession>
              <WorkspaceRoutes />
            </RequireSession>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
