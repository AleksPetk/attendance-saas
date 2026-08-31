"""
HMAC email-verification tokens using Django's password-reset primitive.

Raw tokens are never stored. Changing the email or password invalidates
outstanding tokens. After successful email verification, the exact original
token remains recognizable until its normal expiry so repeated verification
requests can complete idempotently.
"""

from copy import copy

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

        candidates = [user]
        if getattr(user, "email_verified", False):
            # The token was issued while this account was pending. Preserve
            # recognition of that exact token after provisioning so retries or
            # concurrent callbacks do not create an error after success.
            pending_state = copy(user)
            pending_state.email_verified = False
            pending_state.email_verified_at = None
            candidates.append(pending_state)

        secrets = [self.secret, *self.secret_fallbacks]
        matched = any(
            constant_time_compare(
                self._make_token_with_timestamp(candidate_user, timestamp, secret),
                token,
            )
            for candidate_user in candidates
            for secret in secrets
        )
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


class BackupEmailVerificationTokenGenerator(EmailVerificationTokenGenerator):
    key_salt = "accounts.tokens.BackupEmailVerificationTokenGenerator"

    def _make_hash_value(self, user, timestamp):
        login_timestamp = (
            ""
            if user.last_login is None
            else user.last_login.replace(microsecond=0, tzinfo=None)
        )
        pending = getattr(user, "pending_backup_email", "") or ""
        return f"{user.pk}{user.password}{login_timestamp}{timestamp}{pending}"


class PrimaryEmailChangeTokenGenerator(EmailVerificationTokenGenerator):
    key_salt = "accounts.tokens.PrimaryEmailChangeTokenGenerator"

    def _make_hash_value(self, user, timestamp):
        login_timestamp = (
            ""
            if user.last_login is None
            else user.last_login.replace(microsecond=0, tzinfo=None)
        )
        pending = getattr(user, "pending_primary_email", "") or ""
        return f"{user.pk}{user.password}{login_timestamp}{timestamp}{pending}"


backup_email_verification_token_generator = BackupEmailVerificationTokenGenerator()
primary_email_change_token_generator = PrimaryEmailChangeTokenGenerator()
