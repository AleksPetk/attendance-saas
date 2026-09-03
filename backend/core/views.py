from django.db import connection
from rest_framework.response import Response
from rest_framework.views import APIView

from billing.exceptions import StripeConfigurationError, StripeProviderError
from billing.prices import stripe_secret_key
from billing.provider import get_billing_provider
from core.geo import public_geo_payload
from core.health_auth import enforce_provider_health_access
from core.mail import (
    EmailConfigurationError,
    EmailHealthUnknown,
    EmailSendError,
    get_email_provider,
)
from kiosk_builder.kiosk_health import check_kiosk_runtime_health


class PublicGeoView(APIView):
    """
    Trusted Cloudflare geo bootstrap for first-visit locale defaults.

    Does not expose IP addresses. Billing market here is advisory for anonymous
    visitors; authenticated workspace market comes from Organization.
    """

    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return Response(public_geo_payload(request))


def _public_health_payload(status_value):
    return {"status": status_value}


class HealthCheckView(APIView):
    """
    Minimal API liveness + PostgreSQL connectivity check.

    Public payload is only ``status``. HTTP 503 when the database is unreachable.
    """

    authentication_classes = []
    permission_classes = []

    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except Exception:
            return Response(_public_health_payload("degraded"), status=503)
        return Response(_public_health_payload("ok"))


class KioskHealthCheckView(APIView):
    """
    Read-only kiosk runtime health. No customer data, no session lock, no actions.
    """

    authentication_classes = []
    permission_classes = []

    def get(self, request):
        try:
            check_kiosk_runtime_health()
        except Exception:
            return Response(_public_health_payload("degraded"), status=503)
        return Response(_public_health_payload("ok"))


class EmailHealthCheckView(APIView):
    """
    Platform Resend reachability. Does not send mail. Unconfigured is not an error.

    Requires X-Status-Probe-Token (or DEBUG without a configured token).
    """

    authentication_classes = []
    permission_classes = []

    def get(self, request):
        denied = enforce_provider_health_access(request)
        if denied is not None:
            return denied
        try:
            result = get_email_provider().check_health()
        except EmailConfigurationError:
            return Response(_public_health_payload("unconfigured"))
        except EmailHealthUnknown:
            return Response(_public_health_payload("unknown"))
        except EmailSendError:
            return Response(_public_health_payload("error"), status=503)
        except Exception:
            return Response(_public_health_payload("error"), status=503)
        if result == "unknown":
            return Response(_public_health_payload("unknown"))
        return Response(_public_health_payload("ok"))


class StripeHealthCheckView(APIView):
    """
    Read-only Stripe connectivity via the billing provider. Unconfigured is not an error.

    Requires X-Status-Probe-Token (or DEBUG without a configured token).
    """

    authentication_classes = []
    permission_classes = []

    def get(self, request):
        denied = enforce_provider_health_access(request)
        if denied is not None:
            return denied
        if not stripe_secret_key():
            return Response(_public_health_payload("unconfigured"))
        try:
            get_billing_provider().check_health()
        except StripeConfigurationError:
            return Response(_public_health_payload("unconfigured"))
        except StripeProviderError:
            return Response(_public_health_payload("error"), status=503)
        except Exception:
            return Response(_public_health_payload("error"), status=503)
        return Response(_public_health_payload("ok"))
