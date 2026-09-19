"""Verify Apple StoreKit 2 / App Store Server Notifications V2 JWS payloads.

Production verification uses the ``x5c`` certificate chain terminated at
Apple Root CA - G3 (``APPLE_IAP_ROOT_CA_PEM``). Tests may set
``APPLE_IAP_SKIP_JWS_CHAIN_VERIFY=true`` to decode without chain checks.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import datetime, timezone

import jwt
from cryptography import x509
from cryptography.hazmat.primitives.asymmetric import ec
from django.conf import settings

from billing.exceptions import BillingStateError


@dataclass(frozen=True)
class VerifiedAppleJws:
    """Decoded and (when configured) signature-verified Apple JWS payload."""

    payload: dict
    header: dict
    raw: str


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


def _verify_chain(certs: list[x509.Certificate], *, now: datetime | None = None) -> None:
    if not certs:
        raise BillingStateError(
            "Apple certificate chain is empty.",
            code="apple_jws_invalid",
        )
    moment = now or datetime.now(timezone.utc)
    root = _load_apple_root_ca()
    for index, cert in enumerate(certs):
        if cert.not_valid_before_utc > moment or cert.not_valid_after_utc < moment:
            raise BillingStateError(
                "Apple signing certificate is outside its validity window.",
                code="apple_jws_invalid",
            )
        if index + 1 < len(certs):
            try:
                cert.verify_directly_issued_by(certs[index + 1])
            except Exception as exc:
                raise BillingStateError(
                    "Apple certificate chain validation failed.",
                    code="apple_jws_invalid",
                ) from exc
    terminal = certs[-1]
    try:
        if terminal.public_bytes(x509.Encoding.DER) == root.public_bytes(
            x509.Encoding.DER
        ):
            return
        terminal.verify_directly_issued_by(root)
    except Exception as exc:
        raise BillingStateError(
            "Apple certificate chain does not terminate at Apple Root CA.",
            code="apple_jws_invalid",
        ) from exc


def verify_apple_jws(token: str) -> VerifiedAppleJws:
    """Verify ES256 Apple JWS when chain verification is enabled."""
    decoded = decode_apple_jws_unverified(token)
    if bool(getattr(settings, "APPLE_IAP_SKIP_JWS_CHAIN_VERIFY", False)):
        return decoded

    certs = _certs_from_x5c(decoded.header)
    _verify_chain(certs)
    leaf = certs[0]
    public_key = leaf.public_key()
    if not isinstance(public_key, ec.EllipticCurvePublicKey):
        raise BillingStateError(
            "Apple signing key is not an EC key.",
            code="apple_jws_invalid",
        )
    try:
        jwt.decode(
            token,
            key=public_key,
            algorithms=["ES256"],
            options={"verify_aud": False, "require": []},
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
