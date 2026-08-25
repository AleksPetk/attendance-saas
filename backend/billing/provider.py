"""Select the billing provider. Tests use BILLING_PROVIDER=fake."""

from django.conf import settings

from billing.fake_provider import get_fake_provider
from billing.stripe_provider import StripeProvider


def get_billing_provider():
    name = str(getattr(settings, "BILLING_PROVIDER", "stripe") or "stripe").lower()
    if name == "fake":
        return get_fake_provider()
    return StripeProvider()
