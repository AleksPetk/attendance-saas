"""
Application-managed Fernet encryption for reversible secrets at rest.

Mirrors the platform 2FA pattern: a dedicated Fernet key from the
environment, with a DEBUG-friendly SECRET_KEY derivation when unset.
Never log plaintext secrets or decrypted values.
"""

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core import checks

logger = logging.getLogger("core.crypto")


def _fernet_key_bytes():
    raw = (getattr(settings, "APP_SECRETS_ENCRYPTION_KEY", "") or "").strip()
    if raw:
        return raw.encode("utf-8")
    digest = hashlib.sha256(
        f"checkstation-app-secrets:{settings.SECRET_KEY}".encode("utf-8")
    ).digest()
    return base64.urlsafe_b64encode(digest)


def get_fernet():
    return Fernet(_fernet_key_bytes())


def encrypt_secret(plaintext):
    if plaintext is None:
        raise ValueError("Cannot encrypt an empty secret.")
    text = str(plaintext)
    if not text:
        raise ValueError("Cannot encrypt an empty secret.")
    token = get_fernet().encrypt(text.encode("utf-8"))
    return token.decode("ascii")


def decrypt_secret(payload):
    if not payload:
        raise ValueError("Cannot decrypt an empty payload.")
    try:
        return get_fernet().decrypt(str(payload).encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError):
        logger.error("Could not decrypt an application secret.")
        raise


def check_app_secrets_encryption_key(app_configs, **kwargs):
    raw = (getattr(settings, "APP_SECRETS_ENCRYPTION_KEY", "") or "").strip()
    if raw:
        try:
            Fernet(raw.encode("utf-8"))
        except Exception:
            return [
                checks.Error(
                    "APP_SECRETS_ENCRYPTION_KEY is not a valid Fernet key.",
                    id="core.E001",
                )
            ]
        return []
    if getattr(settings, "DEBUG", False):
        return [
            checks.Warning(
                "APP_SECRETS_ENCRYPTION_KEY is unset; app secrets are "
                "encrypted with a key derived from SECRET_KEY. Set a dedicated "
                "Fernet key before production.",
                id="core.W001",
            )
        ]
    return [
        checks.Warning(
            "APP_SECRETS_ENCRYPTION_KEY is unset; app secrets are "
            "encrypted with a key derived from SECRET_KEY. Set a dedicated "
            "Fernet key before production.",
            id="core.W001",
        )
    ]
