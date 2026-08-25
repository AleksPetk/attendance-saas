from django.urls import path

from organizations.views import (
    CurrentWorkspaceView,
    OwnerLoginView,
    OwnerRegistrationView,
    PlanLockSelectionView,
    StaffLoginView,
    StaffLogoutView,
    CsrfTokenView,
    ReauthView,
    WorkspaceStaffListCreateView,
    WorkspaceStaffDetailView,
    WorkspaceStaffGroupAccessView,
    WorkspaceStaffResetPasswordView,
    WorkspaceDashboardView,
)

urlpatterns = [
    path("workspace/", CurrentWorkspaceView.as_view(), name="current-workspace"),
    path("auth/register/", OwnerRegistrationView.as_view(), name="owner-register"),
    path("auth/login/", OwnerLoginView.as_view(), name="owner-login"),
    path("auth/staff-login/", StaffLoginView.as_view(), name="staff-login"),
    path("auth/logout/", StaffLogoutView.as_view(), name="logout"),
    path("auth/csrf/", CsrfTokenView.as_view(), name="csrf-token"),
    path("auth/reauth/", ReauthView.as_view(), name="reauth"),
    path(
        "plan-locks/selection/",
        PlanLockSelectionView.as_view(),
        name="plan-lock-selection",
    ),
    path("workspace-staff/", WorkspaceStaffListCreateView.as_view(), name="workspace-staff-list"),
    path("workspace-staff/<int:staff_id>/", WorkspaceStaffDetailView.as_view(), name="workspace-staff-detail"),
    path(
        "workspace-staff/<int:staff_id>/reset-password/",
        WorkspaceStaffResetPasswordView.as_view(),
        name="workspace-staff-reset-password",
    ),
    path(
        "workspace-staff/<int:staff_id>/group-access/",
        WorkspaceStaffGroupAccessView.as_view(),
        name="workspace-staff-group-access",
    ),
    path("dashboard/", WorkspaceDashboardView.as_view(), name="workspace-dashboard"),
]
