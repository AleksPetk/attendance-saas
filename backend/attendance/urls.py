from django.urls import path

from attendance.views import (
    GroupKioskIdentifyView,
    GroupKioskPerformView,
    GroupKioskStartView,
    WorkspaceHistoryListView,
)

urlpatterns = [
    path("groups/<int:group_pk>/kiosk/", GroupKioskStartView.as_view(), name="group-kiosk-start"),
    path("groups/<int:group_pk>/kiosk/identify/", GroupKioskIdentifyView.as_view(), name="group-kiosk-identify"),
    path("groups/<int:group_pk>/kiosk/perform/", GroupKioskPerformView.as_view(), name="group-kiosk-perform"),
    path("history/", WorkspaceHistoryListView.as_view(), name="workspace-history-list"),
]

