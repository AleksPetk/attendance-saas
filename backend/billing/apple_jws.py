"""Verify Apple StoreKit 2 / App Store Server Notifications V2 JWS payloads.

Production verification uses the ``x5c`` certificate chain terminated at
Apple Root CA - G3 (``APPLE_IAP_ROOT_CA_PEM``), with Apple-documented
receipt-signing / WWDR OIDs matching the App Store Server Library.

Tests / local development may set ``APPLE_IAP_SKIP_JWS_CHAIN_VERIFY=true``
only when ``DEBUG=True``. Production refuses that flag at startup.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from cryptography import x509
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtensionOID, ObjectIdentifier
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from billing.exceptions import BillingStateError

# Apple Inc. Certificate Practice Statement / App Store Server Library:
# leaf = Mac App Store Receipt Signing; intermediate = WWDR.
APPLE_RECEIPT_SIGNING_OID = "1.2.840.113635.100.6.11.1"
APPLE_WWDR_INTERMEDIATE_OID = "1.2.840.113635.100.6.2.1"

# Reject signedDate / receiptCreationDate far in the future (clock skew only).
_SIGNED_DATE_FUTURE_SKEW = timedelta(minutes=5)

# Expected Apple x5c length: leaf, WWDR intermediate, Apple root.
_EXPECTED_X5C_LENGTH = 3


@dataclass(frozen=True)
class VerifiedAppleJws:
    """Decoded and (when configured) signature-verified Apple JWS payload."""

    payload: dict
    header: dict
    raw: str


def validate_apple_iap_production_settings() -> None:
    """Fail closed for unsafe Apple IAP production configuration.

    Called from ``config.settings_production``. Raises ``ImproperlyConfigured``
    so the process does not start with chain verification disabled or without
    a trusted Apple root.
    """
    if bool(getattr(settings, "APPLE_IAP_SKIP_JWS_CHAIN_VERIFY", False)):
        raise ImproperlyConfigured(
            "APPLE_IAP_SKIP_JWS_CHAIN_VERIFY must be false when using "
            "config.settings_production. Certificate chain verification "
            "cannot be skipped in production."
        )
    pem = (getattr(settings, "APPLE_IAP_ROOT_CA_PEM", "") or "").strip()
    if not pem:
        raise ImproperlyConfigured(
            "APPLE_IAP_ROOT_CA_PEM must be set when using "
            "config.settings_production."
        )
    # Validate PEM parses without logging certificate material.
    try:
        _load_apple_root_ca()
    except BillingStateError as exc:
        raise ImproperlyConfigured(
            "APPLE_IAP_ROOT_CA_PEM is invalid when using "
            "config.settings_production."
        ) from exc


def _b64url_decode(segment: str) -> bytes:
    pad = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + pad)


def decode_apple_jws_unverified(token: str) -> VerifiedAppleJws:
    """Decode JWS parts without verifying the signature (unsafe alone)."""
    parts = str(token or "").strip().split(".")
    if len(parts) != 3:
        raise BillingStateError(
            "Apple signed payload is malformed.",
            code="apple_jws_invalid",
        )
    try:
        header = json.loads(_b64url_decode(parts[0]))
        payload = json.loads(_b64url_decode(parts[1]))
    except (ValueError, json.JSONDecodeError) as exc:
        raise BillingStateError(
            "Apple signed payload could not be decoded.",
            code="apple_jws_invalid",
        ) from exc
    if not isinstance(header, dict) or not isinstance(payload, dict):
        raise BillingStateError(
            "Apple signed payload has an unexpected shape.",
            code="apple_jws_invalid",
        )
    return VerifiedAppleJws(payload=payload, header=header, raw=token)


def _certs_from_x5c(header: dict) -> list[x509.Certificate]:
    chain = header.get("x5c")
    if not isinstance(chain, list) or not chain:
        raise BillingStateError(
            "Apple signed payload is missing a certificate chain.",
            code="apple_jws_invalid",
        )
    if len(chain) != _EXPECTED_X5C_LENGTH:
        raise BillingStateError(
            "Apple certificate chain has an unexpected length.",
            code="apple_jws_invalid",
        )
    certs: list[x509.Certificate] = []
    for item in chain:
        try:
            der = base64.b64decode(item)
            certs.append(x509.load_der_x509_certificate(der))
        except Exception as exc:
            raise BillingStateError(
                "Apple certificate chain could not be parsed.",
                code="apple_jws_invalid",
            ) from exc
    return certs


def _load_apple_root_ca() -> x509.Certificate:
    pem = (getattr(settings, "APPLE_IAP_ROOT_CA_PEM", "") or "").strip()
    if not pem:
        raise BillingStateError(
            "Apple Root CA PEM is not configured.",
            code="apple_root_ca_missing",
        )
    if "BEGIN CERTIFICATE" not in pem:
        pem = f"-----BEGIN CERTIFICATE-----\n{pem}\n-----END CERTIFICATE-----\n"
    try:
        return x509.load_pem_x509_certificate(pem.encode("utf-8"))
    except Exception as exc:
        raise BillingStateError(
            "Apple Root CA PEM is invalid.",
            code="apple_root_ca_invalid",
        ) from exc


def _cert_has_extension_oid(cert: x509.Certificate, oid_dotted: str) -> bool:
    target = ObjectIdentifier(oid_dotted)
    try:
        cert.extensions.get_extension_for_oid(target)
        return True
    except x509.ExtensionNotFound:
        return False


def _require_extension_oid(cert: x509.Certificate, oid_dotted: str, *, label: str) -> None:
    if not _cert_has_extension_oid(cert, oid_dotted):
        raise BillingStateError(
            f"Apple {label} certificate is missing the required policy extension.",
            code="apple_jws_invalid",
        )


def _basic_constraints(cert: x509.Certificate) -> x509.BasicConstraints | None:
    try:
        return cert.extensions.get_extension_for_oid(
            ExtensionOID.BASIC_CONSTRAINTS
        ).value
    except x509.ExtensionNotFound:
        return None


def _require_leaf_constraints(leaf: x509.Certificate) -> None:
    _require_extension_oid(leaf, APPLE_RECEIPT_SIGNING_OID, label="leaf")
    constraints = _basic_constraints(leaf)
    if constraints is not None and constraints.ca:
        raise BillingStateError(
            "Apple leaf certificate must not be a CA.",
            code="apple_jws_invalid",
        )
    try:
        cert_key_usage = leaf.extensions.get_extension_for_oid(
            ExtensionOID.KEY_USAGE
        ).value
    except x509.ExtensionNotFound:
        cert_key_usage = None
    if cert_key_usage is not None and not cert_key_usage.digital_signature:
        raise BillingStateError(
            "Apple leaf certificate key usage is not valid for signing.",
            code="apple_jws_invalid",
        )


def _require_intermediate_constraints(intermediate: x509.Certificate) -> None:
    _require_extension_oid(
        intermediate, APPLE_WWDR_INTERMEDIATE_OID, label="intermediate"
    )
    constraints = _basic_constraints(intermediate)
    if constraints is None or not constraints.ca:
        raise BillingStateError(
            "Apple intermediate certificate must be a CA.",
            code="apple_jws_invalid",
        )
    try:
        key_usage = intermediate.extensions.get_extension_for_oid(
            ExtensionOID.KEY_USAGE
        ).value
    except x509.ExtensionNotFound:
        key_usage = None
    if key_usage is not None and not key_usage.key_cert_sign:
        raise BillingStateError(
            "Apple intermediate certificate key usage is not valid for CA signing.",
            code="apple_jws_invalid",
        )


def _assert_cert_valid_at(cert: x509.Certificate, moment: datetime) -> None:
    if cert.not_valid_before_utc > moment or cert.not_valid_after_utc < moment:
        raise BillingStateError(
            "Apple signing certificate is outside its validity window.",
            code="apple_jws_invalid",
        )


def _der_bytes(cert: x509.Certificate) -> bytes:
    return cert.public_bytes(serialization.Encoding.DER)


def _effective_verification_time(payload: dict) -> datetime:
    """Use Apple signedDate/receiptCreationDate for cert validity when present.

    Matches App Store Server Library behavior: when online OCSP is off, cert
    validity is evaluated at the payload signing time so historical receipts
    remain verifiable. Reject only impossible future timestamps beyond skew.
    """
    now = datetime.now(timezone.utc)
    raw = payload.get("signedDate")
    if raw is None:
        raw = payload.get("receiptCreationDate")
    if raw is None:
        return now
    try:
        signed_at = datetime.fromtimestamp(int(raw) / 1000.0, tz=timezone.utc)
    except (TypeError, ValueError, OSError, OverflowError) as exc:
        raise BillingStateError(
            "Apple signed payload has an invalid signedDate.",
            code="apple_jws_invalid",
        ) from exc
    if signed_at > now + _SIGNED_DATE_FUTURE_SKEW:
        raise BillingStateError(
            "Apple signed payload signedDate is unreasonably far in the future.",
            code="apple_jws_invalid",
        )
    return signed_at


def _verify_chain(
    certs: list[x509.Certificate],
    *,
    now: datetime | None = None,
) -> None:
    if len(certs) != _EXPECTED_X5C_LENGTH:
        raise BillingStateError(
            "Apple certificate chain has an unexpected length.",
            code="apple_jws_invalid",
        )
    moment = now or datetime.now(timezone.utc)
    trusted_root = _load_apple_root_ca()
    leaf, intermediate, chain_root = certs[0], certs[1], certs[2]

    _require_leaf_constraints(leaf)
    _require_intermediate_constraints(intermediate)

    for cert in certs:
        _assert_cert_valid_at(cert, moment)

    if _der_bytes(chain_root) != _der_bytes(trusted_root):
        raise BillingStateError(
            "Apple certificate chain does not terminate at Apple Root CA.",
            code="apple_jws_invalid",
        )

    try:
        leaf.verify_directly_issued_by(intermediate)
        intermediate.verify_directly_issued_by(chain_root)
    except Exception as exc:
        raise BillingStateError(
            "Apple certificate chain validation failed.",
            code="apple_jws_invalid",
        ) from exc


def _chain_skip_allowed() -> bool:
    """Return True only when skip is explicitly enabled under DEBUG."""
    if not bool(getattr(settings, "APPLE_IAP_SKIP_JWS_CHAIN_VERIFY", False)):
        return False
    if not bool(getattr(settings, "DEBUG", False)):
        # Fail closed: never silently accept unverified JWS outside DEBUG.
        raise ImproperlyConfigured(
            "APPLE_IAP_SKIP_JWS_CHAIN_VERIFY cannot be enabled when DEBUG=False."
        )
    return True


def verify_apple_jws(token: str) -> VerifiedAppleJws:
    """Verify ES256 Apple JWS when chain verification is enabled."""
    decoded = decode_apple_jws_unverified(token)
    if _chain_skip_allowed():
        return decoded

    alg = str(decoded.header.get("alg") or "").strip()
    if alg != "ES256":
        raise BillingStateError(
            "Apple signed payload algorithm must be ES256.",
            code="apple_jws_invalid",
        )

    effective_time = _effective_verification_time(decoded.payload)
    certs = _certs_from_x5c(decoded.header)
    _verify_chain(certs, now=effective_time)
    leaf = certs[0]
    public_key = leaf.public_key()
    if not isinstance(public_key, ec.EllipticCurvePublicKey):
        raise BillingStateError(
            "Apple signing key is not an EC key.",
            code="apple_jws_invalid",
        )

    decode_options: dict = {
        "verify_aud": False,
        "require": [],
        "verify_exp": "exp" in decoded.payload,
        "verify_iat": False,
    }
    try:
        jwt.decode(
            token,
            key=public_key,
            algorithms=["ES256"],
            options=decode_options,
            leeway=timedelta(seconds=60),
        )
    except jwt.PyJWTError as exc:
        raise BillingStateError(
            "Apple signed payload signature is invalid.",
            code="apple_jws_invalid",
        ) from exc
    return decoded


def decode_nested_signed_transaction(notification_data: dict) -> dict:
    signed = notification_data.get("signedTransactionInfo") or ""
    if not signed:
        raise BillingStateError(
            "Apple notification is missing signedTransactionInfo.",
            code="apple_notification_invalid",
        )
    return verify_apple_jws(signed).payload


def decode_nested_signed_renewal(notification_data: dict) -> dict | None:
    signed = notification_data.get("signedRenewalInfo") or ""
    if not signed:
        return None
    return verify_apple_jws(signed).payload
