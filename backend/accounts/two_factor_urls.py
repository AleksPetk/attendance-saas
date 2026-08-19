from django.urls import path

from accounts import two_factor_views

app_name = "two_factor"

urlpatterns = [
    path("setup/", two_factor_views.setup_view, name="setup"),
    path("challenge/", two_factor_views.challenge_view, name="challenge"),
    path("recovery/", two_factor_views.recovery_view, name="recovery"),
    path("recovery-codes/", two_factor_views.recovery_codes_view, name="recovery_codes"),
    path(
        "recovery-codes/download/",
        two_factor_views.download_recovery_codes_view,
        name="download",
    ),
    path("regenerate/", two_factor_views.regenerate_view, name="regenerate"),
    path("replace/", two_factor_views.replace_view, name="replace"),
]
