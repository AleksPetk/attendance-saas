"""Provider-neutral billing state errors."""


class BillingStateError(Exception):
    """Raised when a billing transition is not valid for current state."""

    def __init__(self, message, *, code="billing_state_error"):
        self.code = code
        super().__init__(message)


class StripeConfigurationError(BillingStateError):
    """Stripe keys or Price IDs are missing."""

    def __init__(self, message, *, code="stripe_not_configured"):
        super().__init__(message, code=code)


class StripeSignatureError(BillingStateError):
    """Webhook signature verification failed."""

    def __init__(self, message="Invalid Stripe webhook signature."):
        super().__init__(message, code="stripe_signature_invalid")


class StripeProviderError(BillingStateError):
    """A Stripe API call failed after configuration was valid."""

    def __init__(self, message, *, code="stripe_provider_error"):
        super().__init__(message, code=code)
