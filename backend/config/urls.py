from django.contrib import admin
from django.urls import include, path

from core.media_views import ProtectedMediaView

urlpatterns = [
    path("admin/two-factor/", include("accounts.two_factor_urls")),
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path("api/", include("accounts.urls")),
    path("api/", include("organizations.urls")),
    path("api/", include("billing.urls")),
    path("api/", include("members.urls")),
    path("api/", include("groups.urls")),
    path("api/", include("attendance.urls")),
    path("api/", include("kiosk_builder.urls")),
    path("api/", include("content.urls")),
    path("api/", include("contact.urls")),
    path(
        "media/<path:relative_path>",
        ProtectedMediaView.as_view(),
        name="protected-media",
    ),
]
