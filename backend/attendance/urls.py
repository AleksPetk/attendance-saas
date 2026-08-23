from django.urls import path

from attendance.views import (
    GroupKioskClassPeopleView,
    GroupKioskClassVerifyPinView,
    GroupKioskExitView,
    GroupKioskIdentifyView,
    GroupKioskPerformView,
    GroupKioskStartView,
    WorkspaceAttendanceReportExportView,
    WorkspaceAttendanceReportView,
    WorkspaceHistoryListView,
    WorkspaceHistoryReportGroupsView,
)

urlpatterns = [
    path("kiosk/exit/", GroupKioskExitView.as_view(), name="group-kiosk-exit"),
    path("groups/<int:group_pk>/kiosk/", GroupKioskStartView.as_view(), name="group-kiosk-start"),
    path(
        "groups/<int:group_pk>/kiosk/classes/<int:section_pk>/people/",
        GroupKioskClassPeopleView.as_view(),
        name="group-kiosk-class-people",
    ),
    path(
        "groups/<int:group_pk>/kiosk/classes/<int:section_pk>/verify-pin/",
        GroupKioskClassVerifyPinView.as_view(),
        name="group-kiosk-class-verify-pin",
    ),
    path(
        "groups/<int:group_pk>/kiosk/identify/",
        GroupKioskIdentifyView.as_view(),
        name="group-kiosk-identify",
    ),
    path(
        "groups/<int:group_pk>/kiosk/perform/",
        GroupKioskPerformView.as_view(),
        name="group-kiosk-perform",
    ),
    path("history/", WorkspaceHistoryListView.as_view(), name="workspace-history-list"),
    path(
        "history/report-groups/",
        WorkspaceHistoryReportGroupsView.as_view(),
        name="workspace-history-report-groups",
    ),
    path(
        "history/attendance-report/",
        WorkspaceAttendanceReportView.as_view(),
        name="workspace-attendance-report",
    ),
    path(
        "history/attendance-report/export/",
        WorkspaceAttendanceReportExportView.as_view(),
        name="workspace-attendance-report-export",
    ),
]
