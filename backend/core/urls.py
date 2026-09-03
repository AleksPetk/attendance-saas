from django.urls import path

from core.views import (
    EmailHealthCheckView,
    HealthCheckView,
    KioskHealthCheckView,
    PublicGeoView,
    StripeHealthCheckView,
)

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health-check"),
    path("health/kiosk/", KioskHealthCheckView.as_view(), name="health-kiosk"),
    path("health/email/", EmailHealthCheckView.as_view(), name="health-email"),
    path("health/stripe/", StripeHealthCheckView.as_view(), name="health-stripe"),
    path("geo/", PublicGeoView.as_view(), name="public-geo"),
]
