import { lazy } from "react";

function lazyScreen(factory) {
  return lazy(() =>
    factory().catch((error) => {
      const isChunkError =
        error?.message?.includes("Failed to fetch dynamically imported module")
        || error?.message?.includes("Importing a module script failed")
        || error?.name === "ChunkLoadError";
      if (!isChunkError) {
        throw error;
      }
      return factory();
    }),
  );
}

// Public marketing
export const PublicHomeScreen = lazyScreen(() => import("./PublicHomeScreen.jsx"));
export const PublicFeaturesScreen = lazyScreen(() => import("./PublicFeaturesScreen.jsx"));
export const PublicHowItWorksScreen = lazyScreen(() => import("./PublicHowItWorksScreen.jsx"));
export const PublicPricingScreen = lazyScreen(() => import("./PublicPricingScreen.jsx"));
export const PublicContactScreen = lazyScreen(() => import("./PublicContactScreen.jsx"));

// Auth
export const OwnerLoginScreen = lazyScreen(() => import("./OwnerLoginScreen.jsx"));
export const StaffLoginScreen = lazyScreen(() => import("./StaffLoginScreen.jsx"));
export const RegisterScreen = lazyScreen(() => import("./RegisterScreen.jsx"));
export const CheckEmailScreen = lazyScreen(() => import("./CheckEmailScreen.jsx"));
export const VerifyEmailScreen = lazyScreen(() => import("./VerifyEmailScreen.jsx"));
export const VerifyBackupEmailScreen = lazyScreen(() => import("./VerifyBackupEmailScreen.jsx"));
export const VerifyPrimaryEmailScreen = lazyScreen(() => import("./VerifyPrimaryEmailScreen.jsx"));
export const ForgotPasswordScreen = lazyScreen(() => import("./ForgotPasswordScreen.jsx"));
export const ResetPasswordScreen = lazyScreen(() => import("./ResetPasswordScreen.jsx"));
export const OwnerOAuthResultScreen = lazyScreen(() => import("./OwnerOAuthResultScreen.jsx"));

// Workspace
export const WorkspaceLayout = lazyScreen(() => import("./WorkspaceLayout.jsx"));
export const DashboardScreen = lazyScreen(() => import("./DashboardScreen.jsx"));
export const MembersScreen = lazyScreen(() => import("./MembersScreen.jsx"));
export const MemberCreateScreen = lazyScreen(() => import("./MemberCreateScreen.jsx"));
export const MemberProfileScreen = lazyScreen(() => import("./MemberProfileScreen.jsx"));
export const GroupsScreen = lazyScreen(() => import("./GroupsScreen.jsx"));
export const GroupEditorScreen = lazyScreen(() => import("./GroupEditorScreen.jsx"));
export const GroupDetailScreen = lazyScreen(() => import("./GroupDetailScreen.jsx"));
export const GroupClassDetailScreen = lazyScreen(() => import("./GroupClassDetailScreen.jsx"));
export const HistoryScreen = lazyScreen(() => import("./HistoryScreen.jsx"));
export const StaffManagementScreen = lazyScreen(() => import("./StaffManagementScreen.jsx"));
export const AccountScreen = lazyScreen(() => import("./AccountScreen.jsx"));

// Kiosk
export const GroupKioskScreen = lazyScreen(() => import("./GroupKioskScreen.jsx"));
export const KioskSettingsScreen = lazyScreen(() => import("./kiosk/KioskSettingsScreen.jsx"));
export const KioskBuilderScreen = lazyScreen(() => import("./kiosk/builder/KioskBuilderScreen.jsx"));
