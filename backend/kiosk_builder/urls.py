from django.urls import path

from kiosk_builder.views import (
    GroupKioskDesignView,
    GroupKioskResetNowView,
    GroupKioskSettingsView,
    KioskPresetListView,
)

urlpatterns = [
    path(
        "groups/<int:group_pk>/kiosk-design/",
        GroupKioskDesignView.as_view(),
        name="group-kiosk-design",
    ),
    path(
        "groups/<int:group_pk>/kiosk-settings/",
        GroupKioskSettingsView.as_view(),
        name="group-kiosk-settings",
    ),
    path(
        "groups/<int:group_pk>/kiosk-settings/reset-now/",
        GroupKioskResetNowView.as_view(),
        name="group-kiosk-reset-now",
    ),
    path(
        "kiosk-presets/",
        KioskPresetListView.as_view(),
        name="kiosk-preset-list",
    ),
]
