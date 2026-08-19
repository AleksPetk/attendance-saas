"""
HMAC email-verification tokens using Django's password-reset primitive.

Raw tokens are never stored. Successful verification changes the hash input
(`email_verified` / `email_verified_at`), so the same token cannot be reused.
Changing the email or password also invalidates outstanding tokens.
"""

from django.conf import settings
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.crypto import constant_time_compare
from django.utils.http import base36_to_int


class EmailVerificationTokenGenerator(PasswordResetTokenGenerator):
    key_salt = "accounts.tokens.EmailVerificationTokenGenerator"

    def _make_hash_value(self, user, timestamp):
        login_timestamp = (
            ""
            if user.last_login is None
            else user.last_login.replace(microsecond=0, tzinfo=None)
        )
        email = getattr(user, "email", "") or ""
        verified = "1" if getattr(user, "email_verified", False) else "0"
        verified_at = ""
        if getattr(user, "email_verified_at", None) is not None:
            verified_at = str(int(user.email_verified_at.timestamp()))
        return f"{user.pk}{user.password}{login_timestamp}{timestamp}{email}{verified}{verified_at}"

    def inspect(self, user, token):
        """
        Return "valid", "expired", or "invalid".

        Does not distinguish "already used" from other invalid tokens, so the
        endpoint cannot be used to probe verification state with a random uid.
        """
        if not user or not token:
            return "invalid"
        try:
            ts_b36, _rest = token.split("-")
            timestamp = base36_to_int(ts_b36)
        except (ValueError, AttributeError, TypeError):
            return "invalid"

        secrets = [self.secret, *self.secret_fallbacks]
        matched = False
        for secret in secrets:
            candidate = self._make_token_with_timestamp(user, timestamp, secret)
            if constant_time_compare(candidate, token):
                matched = True
                break
        if not matched:
            return "invalid"

        timeout = int(getattr(settings, "EMAIL_VERIFICATION_TIMEOUT", 60 * 60 * 24))
        age = self._num_seconds(self._now()) - timestamp
        if age > timeout:
            return "expired"
        return "valid"

    def check_token(self, user, token):
        return self.inspect(user, token) == "valid"


email_verification_token_generator = EmailVerificationTokenGenerator()
password_reset_token_generator = PasswordResetTokenGenerator()
