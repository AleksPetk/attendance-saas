"""Hard guards so Test Clock tooling cannot run against Live or production."""

from __future__ import annotations

from django.conf import settings

from billing.exceptions import BillingStateError


class TestClockGuardError(BillingStateError):
    """Raised when Test Clock tooling refuses to run."""

    def __init__(self, message, *, code="test_clock_guard"):
        super().__init__(message, code=code)


def assert_test_clock_environment_allowed(*, explicit_ack: bool) -> str:
    """Refuse anything that looks like Live Stripe or production invocation.

    Returns the verified ``sk_test_`` secret key.
    """
    if not explicit_ack:
        raise TestClockGuardError(
            "Refusing Test Clock run without --i-understand-test-only.",
            code="test_clock_ack_required",
        )

    secret = str(getattr(settings, "STRIPE_SECRET_KEY", "") or "").strip()
    if not secret:
        raise TestClockGuardError(
            "STRIPE_SECRET_KEY is empty.",
            code="stripe_key_missing",
        )
    if secret.startswith("sk_live_"):
        raise TestClockGuardError(
            "Refusing Test Clock tooling against Stripe Live keys.",
            code="stripe_live_forbidden",
        )
    if not secret.startswith("sk_test_"):
        raise TestClockGuardError(
            "STRIPE_SECRET_KEY must be a sk_test_ key for Test Clock runs.",
            code="stripe_test_key_required",
        )

    provider = str(getattr(settings, "BILLING_PROVIDER", "") or "").strip().lower()
    if provider != "stripe":
        raise TestClockGuardError(
            f"BILLING_PROVIDER must be stripe (got {provider!r}).",
            code="billing_provider_mismatch",
        )

    # Extra belt: production must not leave DEBUG on, and must not set this flag.
    allow_flag = str(
        getattr(settings, "ALLOW_STRIPE_TEST_CLOCK", "") or ""
    ).strip().lower()
    debug = bool(getattr(settings, "DEBUG", False))
    if not debug and allow_flag not in {"1", "true", "yes", "on"}:
        raise TestClockGuardError(
            "Test Clock tooling requires DEBUG=True or ALLOW_STRIPE_TEST_CLOCK=1.",
            code="test_clock_debug_required",
        )

    return secret
