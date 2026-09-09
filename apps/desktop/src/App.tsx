import { Navigate, Route, Routes } from "react-router-dom";
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

export function App() {
  const { ready, authState, t } = useApp();
  if (!ready || authState.status === "unknown") {
    return <div style={{ padding: 24 }}>{t("common.loading")}</div>;
  }

  if (authState.status === "kiosk_locked" && authState.session?.kiosk_group_id) {
    return (
      <Routes>
        <Route path="/kiosk/:groupId" element={<KioskPage />} />
        <Route path="*" element={<Navigate to={`/kiosk/${authState.session.kiosk_group_id}`} replace />} />
      </Routes>
    );
  }

  if (authState.status === "anonymous" || authState.status === "needs_2fa") {
    return (
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/forgot-password" element={<AuthAccountFlowPage />} />
        <Route path="/recover-account" element={<AuthAccountFlowPage />} />
        <Route path="/register" element={<AuthAccountFlowPage />} />
        <Route path="/email-link" element={<EmailLinkPage />} />
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/kiosk/:groupId" element={<KioskPage />} />
      <Route element={<DesktopShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/groups/new" element={<GroupsPage initialCreate />} />
        <Route path="/groups/:id" element={<GroupDetailPage />} />
        <Route path="/groups/:id/kiosk-settings" element={<KioskSettingsPage />} />
        <Route path="/groups/:id/kiosk-design" element={<KioskDesignPage />} />
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/people/:id" element={<MemberDetailPage />} />
        <Route path="/people/new" element={<PeoplePage initialCreate />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/email-link" element={<EmailLinkPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
