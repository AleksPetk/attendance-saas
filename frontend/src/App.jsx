import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TutorialProvider } from "./TutorialContext.jsx";
import RouteSuspense from "./RouteSuspense.jsx";
import {
  AccountScreen,
  CheckEmailScreen,
  DashboardScreen,
  ForgotPasswordScreen,
  GroupClassDetailScreen,
  GroupDetailScreen,
  GroupEditorScreen,
  GroupKioskScreen,
  GroupsScreen,
  HistoryScreen,
  KioskBuilderScreen,
  KioskSettingsScreen,
  MemberCreateScreen,
  MemberProfileScreen,
  MembersScreen,
  OwnerLoginScreen,
  OwnerOAuthResultScreen,
  PublicContactScreen,
  PublicFeaturesScreen,
  PublicHomeScreen,
  PublicHowItWorksScreen,
  PublicPricingScreen,
  RegisterScreen,
  ResetPasswordScreen,
  StaffLoginScreen,
  StaffManagementScreen,
  VerifyBackupEmailScreen,
  VerifyEmailScreen,
  VerifyPrimaryEmailScreen,
  WorkspaceLayout,
} from "./lazyScreens.jsx";
import { api, SESSION_EXPIRED_EVENT } from "./api.js";
import { LoadingState } from "./components.jsx";
import { PromoLocaleProvider } from "./promo/PromoLocaleContext.jsx";
import {
  isPromoMarketingPath,
  promoPathFor,
  resolvePromoLocaleWithGeo,
} from "./promo/locale.js";
import { fetchPublicGeo } from "./geoBootstrap.js";
import { canonicalHostRedirectUrl, resolvePromoHandoffUrl } from "./siteOrigins.js";
import {
  canLaunchKiosk,
  canManageGroupConfiguration,
  canManageOwnerAccount,
  canViewGlobalMembers,
} from "./workspaceSession.js";
import { confirmWorkspaceLeave } from "./kiosk/builder/workspaceLeaveGuard.js";
import AdInterstitial from "./advertising/AdInterstitial.jsx";
import { mockProvider } from "./advertising/mockProvider.js";
import { LanguageProvider } from "./i18n/LanguageProvider.jsx";
import {
  PLACEMENT_KIOSK_BUILDER_EXIT,
  PLACEMENT_KIOSK_EXIT,
  PLACEMENT_KIOSK_LAUNCH,
} from "./advertising/placements.js";
import { resolveInterstitialDecision } from "./advertising/state.js";

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
  const { t } = useTranslation("workspace");
  if (loadingSession) {
    return (
      <div className="page">
        <LoadingState label={t("loadingWorkspace")} />
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function isPublicMarketingPath(pathname) {
  return isPromoMarketingPath(pathname);
}

function RedirectToPromoLocale({ logicalPath }) {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      const locale = await resolvePromoLocaleWithGeo("/", () =>
        fetchPublicGeo(() => api.getPublicGeo()),
      );
      const to = promoPathFor(logicalPath, locale);
      const absolute = resolvePromoHandoffUrl(
        to,
        typeof window !== "undefined" ? window.location.origin : "",
      );
      if (cancelled) return;
      if (/^https?:\/\//i.test(absolute)) {
        window.location.replace(absolute);
        return;
      }
      setTarget(to);
    }
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [logicalPath]);

  if (!target) return null;
  return <Navigate to={target} replace />;
}

function PromoLocaleLayout({ locale }) {
  return (
    <PromoLocaleProvider locale={locale}>
      <Outlet />
    </PromoLocaleProvider>
  );
}

function promoMarketingChildRoutes(session) {
  return (
    <>
      <Route
        index
        element={(
          <RouteSuspense>
            <PublicHomeScreen />
          </RouteSuspense>
        )}
      />
      <Route
        path="features"
        element={(
          <RouteSuspense>
            <PublicFeaturesScreen />
          </RouteSuspense>
        )}
      />
      <Route
        path="how-it-works"
        element={(
          <RouteSuspense>
            <PublicHowItWorksScreen />
          </RouteSuspense>
        )}
      />
      <Route
        path="pricing"
        element={(
          <RouteSuspense>
            <PublicPricingScreen session={session} />
          </RouteSuspense>
        )}
      />
      <Route
        path="contact"
        element={(
          <RouteSuspense>
            <PublicContactScreen />
          </RouteSuspense>
        )}
      />
    </>
  );
}

function isPublicAuthPath(pathname) {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/staff-login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/check-email") ||
    pathname.startsWith("/verify-email") ||
    pathname.startsWith("/verify-backup-email") ||
    pathname.startsWith("/verify-primary-email") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/auth/google/result") ||
    pathname.startsWith("/auth/apple/result")
  );
}

/**
 * Bidirectional host canonicalization:
 * - Promo marketing on workspace.* → checkstation.app
 * - Auth / workspace app on apex → workspace.checkstation.app
 */
function CanonicalHostRedirect() {
  const location = useLocation();
  useEffect(() => {
    const target = canonicalHostRedirectUrl(
      location.pathname,
      location.search,
      location.hash,
      window.location.origin,
    );
    if (target) {
      window.location.replace(target);
    }
  }, [location.hash, location.pathname, location.search]);
  return null;
}

/**
 * When a credentialed API call reports missing session credentials, clear local
 * session state and send the user to the React login screen (never a native
 * browser Basic Auth prompt — that is prevented server-side).
 */
function SessionExpiryListener({ setSession }) {
  const nav = useNavigate();
  const location = useLocation();

  useEffect(() => {
    function onSessionExpired() {
      setSession(null);
      const path = location.pathname;
      if (isPublicAuthPath(path) || isPublicMarketingPath(path)) {
        return;
      }
      nav("/login", { replace: true });
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, [location.pathname, nav, setSession]);

  return null;
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
  const { t } = useTranslation("workspace");
  const location = useLocation();
  const path = location.pathname;
  const publicPath = isPublicMarketingPath(path) || isPublicAuthPath(path);

  // Marketing + auth pages must render immediately — do not wait on workspace hydrate.
  if (loadingSession && !publicPath) {
    return (
      <div className="page">
        <LoadingState label={t("loadingWorkspace")} />
      </div>
    );
  }

  const locked = Boolean(session?.workspace?.kiosk_locked);
  if (locked && !loadingSession) {
    const target = kioskTargetPath(session.workspace);
    // Keep kiosk devices off the workspace; public marketing pages stay viewable.
    if (!path.startsWith("/kiosk/") && !isPublicMarketingPath(path)) {
      return <Navigate to={target} replace />;
    }
    const lockedId = session.workspace.kiosk_group_id;
    const match = path.match(/^\/kiosk\/([^/]+)/);
    if (lockedId && match && match[1] !== "locked" && match[1] !== String(lockedId)) {
      return <Navigate to={`/kiosk/${lockedId}`} replace />;
    }
  }
  return children;
}

function WorkspaceRoutes({
  session,
  setSession,
  onKioskEntered,
  onKioskUnlockedLocally,
  requestInterstitial,
}) {
  const { t } = useTranslation("kiosk");
  const kioskLocked = Boolean(session.workspace.kiosk_locked);
  const canUseKiosk = canLaunchKiosk(session) || kioskLocked;
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

  function applyWorkspaceRoute(route) {
    if (route.name === "members") {
      nav(route.status === "archived" ? "/members?status=archived" : "/members", {
        replace: Boolean(route.replace),
      });
      return;
    }
    if (route.name === "dashboard") nav("/dashboard");
    if (route.name === "account") {
      nav(route.section ? `/account/${route.section}` : "/account/security");
    }
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

  function onNavigate(route) {
    if (!route || !route.name) return;
    if (!confirmWorkspaceLeave()) return;
    const leavingBuilder = location.pathname.includes("/kiosk-builder");
    const stayingInBuilder = route.name === "kiosk-builder";
    if (route.name === "kiosk") {
      requestInterstitial(PLACEMENT_KIOSK_LAUNCH, () => applyWorkspaceRoute(route));
      return;
    }
    if (leavingBuilder && !stayingInBuilder) {
      requestInterstitial(PLACEMENT_KIOSK_BUILDER_EXIT, () => applyWorkspaceRoute(route));
      return;
    }
    applyWorkspaceRoute(route);
  }

  function onKioskUnlocked({ groupAvailable, lockPayload } = {}) {
    const match = location.pathname.match(/^\/kiosk\/(\d+)/);
    const groupId = match ? Number(match[1]) : session.workspace.kiosk_group_id;
    beginKioskExitGuard();
    flushSync(() => {
      onKioskUnlockedLocally(lockPayload);
    });
    const goToWorkspace = () => {
      if (groupAvailable && groupId) {
        nav(`/groups/${groupId}`, { replace: true });
      } else {
        nav("/groups", { replace: true });
      }
    };
    requestInterstitial(PLACEMENT_KIOSK_EXIT, goToWorkspace);
  }

  if (location.pathname.startsWith("/kiosk/")) {
    return (
      <Routes>
        <Route
          path="/kiosk/:groupId"
          element={
            canUseKiosk ? (
              <RouteSuspense>
                <KioskByParam
                  session={session}
                  onUnlocked={onKioskUnlocked}
                  onKioskEntered={onKioskEntered}
                />
              </RouteSuspense>
            ) : (
              <div className="page" style={{ padding: "var(--space-8)" }}>
                <div className="empty-state">
                  <h2>{t("permissionDeniedTitle")}</h2>
                  <p>{t("permissionDeniedBody")}</p>
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
          element={
            canManageGroupConfiguration(session) ? (
              <RouteSuspense>
                <GroupKioskBuilderByParam session={session} onNavigate={onNavigate} />
              </RouteSuspense>
            ) : (
              <Navigate to="/groups" replace />
            )
          }
        />
      </Routes>
    );
  }

  return (
    <RouteSuspense>
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
        <Route path="/dashboard" element={<DashboardScreen session={session} />} />
        <Route path="/account" element={<Navigate to="/account/security" replace />} />
        <Route
          path="/account/:section"
          element={
            canManageOwnerAccount(session) ? (
              <AccountScreen
                session={session}
                setSession={setSession}
                onAccountDeleted={() => {
                  setSession(null);
                  nav("/login?deleted=1");
                }}
              />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="/members"
          element={
            canViewGlobalMembers(session) ? (
              <MembersScreen
                session={session}
                setSession={setSession}
                onNavigate={onNavigate}
              />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="/members/new"
          element={
            canViewGlobalMembers(session) ? (
              <MemberCreateScreen session={session} onNavigate={onNavigate} />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="/members/:memberId"
          element={
            canViewGlobalMembers(session) ? (
              <MemberProfileByParam session={session} onNavigate={onNavigate} />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="/groups"
          element={
            <GroupsScreen session={session} setSession={setSession} onNavigate={onNavigate} />
          }
        />
        <Route
          path="/groups/new"
          element={
            canManageGroupConfiguration(session) ? (
              <GroupEditorScreen session={session} onNavigate={onNavigate} />
            ) : (
              <Navigate to="/groups" replace />
            )
          }
        />
        <Route
          path="/groups/:groupId/edit"
          element={
            canManageGroupConfiguration(session) ? (
              <GroupEditorByParam session={session} onNavigate={onNavigate} />
            ) : (
              <Navigate to="/groups" replace />
            )
          }
        />
        <Route
          path="/groups/:groupId/kiosk-settings"
          element={
            canManageGroupConfiguration(session) ? (
              <GroupKioskSettingsByParam session={session} onNavigate={onNavigate} />
            ) : (
              <Navigate to="/groups" replace />
            )
          }
        />
        <Route
          path="/groups/:groupId/classes/:classId"
          element={<GroupClassDetailByParam session={session} onNavigate={onNavigate} />}
        />
        <Route path="/groups/:groupId" element={<GroupDetailByParam session={session} onNavigate={onNavigate} />} />
        <Route path="/history" element={<HistoryScreen session={session} />} />
        <Route
          path="/staff"
          element={<StaffManagementScreen session={session} setSession={setSession} />}
        />
      </Routes>
    </WorkspaceLayout>
    </RouteSuspense>
  );
}

export default function App() {
  const [session, setSession] = useState(readSession);
  const [loadingSession, setLoadingSession] = useState(true);
  const [adGate, setAdGate] = useState(null);
  const sessionIdentity = session?.workspace?.identity;

  function requestInterstitial(placement, onContinue) {
    try {
      const decision = resolveInterstitialDecision(session, placement, mockProvider);
      if (!decision.show || !decision.model) {
        onContinue();
        return;
      }
      setAdGate({ placement, model: decision.model, onContinue });
    } catch {
      onContinue();
    }
  }

  function finishAdGate() {
    const pending = adGate;
    setAdGate(null);
    try {
      pending?.onContinue?.();
    } catch {
      /* Advertising must never trap navigation. */
    }
  }

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
      <CanonicalHostRedirect />
      <SessionExpiryListener setSession={setSession} />
      <LanguageProvider
        session={session}
        updatePreferredLanguage={async (preferred_language) => {
          const result = await api.updatePreferredLanguage(preferred_language);
          setSession((current) => {
            if (!current?.workspace || current.workspace.account_kind !== "owner") {
              return current;
            }
            return {
              workspace: {
                ...current.workspace,
                preferred_language: result.data.preferred_language,
              },
            };
          });
          return result.data;
        }}
      >
        <KioskLockGate loadingSession={loadingSession} session={session}>
        <Routes>
          <Route path="/" element={<RedirectToPromoLocale logicalPath="/" />} />
          <Route path="/features" element={<RedirectToPromoLocale logicalPath="/features" />} />
          <Route
            path="/how-it-works"
            element={<RedirectToPromoLocale logicalPath="/how-it-works" />}
          />
          <Route path="/pricing" element={<RedirectToPromoLocale logicalPath="/pricing" />} />
          <Route path="/contact" element={<RedirectToPromoLocale logicalPath="/contact" />} />
          <Route path="/en" element={<PromoLocaleLayout locale="en" />}>
            {promoMarketingChildRoutes(session)}
          </Route>
          <Route path="/ja" element={<PromoLocaleLayout locale="ja" />}>
            {promoMarketingChildRoutes(session)}
          </Route>
          <Route
            path="/login"
            element={
              <RedirectIfSignedIn session={session}>
                <RouteSuspense>
                  <OwnerLoginScreen
                    onSignedIn={(next) => {
                      setSession(next);
                    }}
                  />
                </RouteSuspense>
              </RedirectIfSignedIn>
            }
          />
          <Route
            path="/staff-login"
            element={
              <RedirectIfSignedIn session={session}>
                <RouteSuspense>
                  <StaffLoginScreen
                    onSignedIn={(next) => {
                      setSession(next);
                    }}
                  />
                </RouteSuspense>
              </RedirectIfSignedIn>
            }
          />
          <Route
            path="/register"
            element={
              <RedirectIfSignedIn session={session}>
                <RouteSuspense>
                  <RegisterScreen />
                </RouteSuspense>
              </RedirectIfSignedIn>
            }
          />
          <Route
            path="/check-email"
            element={(
              <RouteSuspense>
                <CheckEmailScreen />
              </RouteSuspense>
            )}
          />
          <Route
            path="/verify-email/:uid/:token"
            element={(
              <RouteSuspense>
                <VerifyEmailScreen
                  onSignedIn={(next) => {
                    setSession(next);
                  }}
                />
              </RouteSuspense>
            )}
          />
          <Route
            path="/verify-backup-email/:uid/:token"
            element={(
              <RouteSuspense>
                <VerifyBackupEmailScreen />
              </RouteSuspense>
            )}
          />
          <Route
            path="/verify-primary-email/:uid/:token"
            element={(
              <RouteSuspense>
                <VerifyPrimaryEmailScreen />
              </RouteSuspense>
            )}
          />
          <Route
            path="/forgot-password"
            element={(
              <RouteSuspense>
                <ForgotPasswordScreen />
              </RouteSuspense>
            )}
          />
          <Route
            path="/reset-password/:uid/:token"
            element={(
              <RouteSuspense>
                <ResetPasswordScreen />
              </RouteSuspense>
            )}
          />
          <Route
            path="/auth/google/result"
            element={(
              <RouteSuspense>
                <OwnerOAuthResultScreen
                  provider="google"
                  onSignedIn={(next) => {
                    setSession(next);
                  }}
                />
              </RouteSuspense>
            )}
          />
          <Route
            path="/auth/apple/result"
            element={(
              <RouteSuspense>
                <OwnerOAuthResultScreen
                  provider="apple"
                  onSignedIn={(next) => {
                    setSession(next);
                  }}
                />
              </RouteSuspense>
            )}
          />
          <Route
            path="/*"
            element={
              <RequireSession loadingSession={loadingSession} session={session}>
                <TutorialProvider
                  session={session}
                  onTutorialStateChange={(tutorial) => {
                    setSession((current) => current ? {
                      ...current,
                      workspace: { ...current.workspace, tutorial },
                    } : current);
                  }}
                >
                  <WorkspaceRoutes
                    session={session}
                    setSession={setSession}
                    onKioskEntered={markKioskLocked}
                    onKioskUnlockedLocally={clearKioskLockLocally}
                    requestInterstitial={requestInterstitial}
                  />
                </TutorialProvider>
              </RequireSession>
            }
          />
        </Routes>
        {adGate ? (
          <AdInterstitial
            placement={adGate.placement}
            model={adGate.model}
            onContinue={finishAdGate}
          />
        ) : null}
      </KioskLockGate>
      </LanguageProvider>
    </BrowserRouter>
  );
}
