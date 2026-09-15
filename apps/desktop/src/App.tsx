import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import { canAccessStaffManagement, canManageStaffAccounts } from "@checkstation/domain";
import { useApp } from "./lib/AppProvider";
import { DesktopShell } from "./shell/DesktopShell";
import { SignInPage } from "./pages/SignInPage";
import { HomePage } from "./pages/HomePage";
import { GroupsPage } from "./pages/GroupsPage";
import { GroupDetailPage } from "./pages/GroupDetailPage";
import { PeoplePage } from "./pages/PeoplePage";
import { MemberDetailPage } from "./pages/MemberDetailPage";
import { HistoryPage } from "./pages/HistoryPage";
import { AccountPage } from "./pages/AccountPage";
import { PlanPage } from "./pages/PlanPage";
import { StaffPage } from "./pages/StaffPage";
import { HelpPage } from "./pages/HelpPage";
import { SecurityPage } from "./pages/SecurityPage";
import { KioskPage } from "./pages/KioskPage";
import { AuthAccountFlowPage } from "./pages/AuthAccountFlowPage";
import { KioskSettingsPage } from "./pages/KioskSettingsPage";
import { KioskDesignPage } from "./pages/KioskDesignPage";
import { EmailLinkPage } from "./pages/EmailLinkPage";
import { KioskLockRecoveryPage } from "./pages/KioskLockRecoveryPage";
import { DesktopGuidedHelpProvider } from "./tutorials/DesktopGuidedHelp";
import { DesktopErrorBoundary } from "./components/DesktopErrorBoundary";

function StaffRoute() {
  const { authState } = useApp();
  if (!canAccessStaffManagement(authState.session, canManageStaffAccounts(authState.session))) {
    return <Navigate to="/" replace />;
  }
  return <StaffPage />;
}

function resolveLockedGroupId(session: { kiosk_group_id?: number | null } | null | undefined): number | null {
  const raw = session?.kiosk_group_id;
  const id = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function App() {
  const { ready, authState, t, locale } = useApp();
  useEffect(() => {
    if (!ready || authState.status === "unknown") return;
    // Signal after React has committed and route redirects have had a paint frame.
    let nextFrame = 0;
    const frame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => window.checkstationDesktop?.startupReady?.());
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(nextFrame); };
  }, [ready, authState.status]);

  const crashTitle = locale === "ja" ? "画面を表示できません" : "Something went wrong";
  const crashBody = locale === "ja"
    ? "予期しないエラーで画面が止まりました。再読み込みしてください。"
    : "An unexpected error stopped the screen. Reload to continue.";

  if (!ready || authState.status === "unknown") {
    return <div style={{ padding: 24 }}>{t("common.loading")}</div>;
  }

  if (authState.status === "anonymous" || authState.status === "needs_2fa") {
    return (
      <DesktopErrorBoundary fallbackTitle={crashTitle} fallbackBody={crashBody}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/forgot-password" element={<AuthAccountFlowPage />} />
          <Route path="/recover-account" element={<AuthAccountFlowPage />} />
          <Route path="/register" element={<AuthAccountFlowPage />} />
          <Route path="/email-link" element={<EmailLinkPage />} />
          <Route path="*" element={<Navigate to="/sign-in" replace />} />
        </Routes>
      </DesktopErrorBoundary>
    );
  }

  const locked = authState.status === "kiosk_locked";
  const lockedGroupId = locked ? resolveLockedGroupId(authState.session) : null;

  // Locked without a usable Group id — never blank; require exit-code unlock.
  if (locked && !lockedGroupId) {
    return (
      <DesktopErrorBoundary fallbackTitle={crashTitle} fallbackBody={crashBody}>
        <KioskLockRecoveryPage />
      </DesktopErrorBoundary>
    );
  }

  return (
    <DesktopErrorBoundary fallbackTitle={crashTitle} fallbackBody={crashBody}>
      <DesktopGuidedHelpProvider>
        <Routes>
          {/* Stable across lock/unlock — must not remount on applyKioskUnlock. */}
          <Route path="/kiosk/:groupId" element={<KioskPage />} />
          {lockedGroupId ? (
            <Route path="*" element={<Navigate to={`/kiosk/${lockedGroupId}`} replace />} />
          ) : (
            <>
              <Route path="/groups/:id/kiosk-design" element={<KioskDesignPage />} />
              <Route element={<DesktopShell />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/groups" element={<GroupsPage />} />
                <Route path="/groups/new" element={<GroupsPage initialCreate />} />
                <Route path="/groups/:id" element={<GroupDetailPage />} />
                <Route path="/groups/:id/kiosk-settings" element={<KioskSettingsPage />} />
                <Route path="/people" element={<PeoplePage />} />
                <Route path="/people/:id" element={<MemberDetailPage />} />
                <Route path="/people/new" element={<PeoplePage initialCreate />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/account" element={<AccountPage />} />
                <Route path="/security" element={<SecurityPage />} />
                <Route path="/plan" element={<PlanPage />} />
                <Route path="/staff" element={<StaffRoute />} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="/email-link" element={<EmailLinkPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </DesktopGuidedHelpProvider>
    </DesktopErrorBoundary>
  );
}
