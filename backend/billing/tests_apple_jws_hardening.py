"""Security-focused Apple JWS chain / OID / skip-flag hardening tests."""

from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone as dt_timezone

import jwt
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtensionOID, NameOID, ObjectIdentifier
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings

from billing.apple_jws import (
    APPLE_RECEIPT_SIGNING_OID,
    APPLE_WWDR_INTERMEDIATE_OID,
    validate_apple_iap_production_settings,
    verify_apple_jws,
    _verify_chain,
)
from billing.apple_products import PRODUCT_PLUS_MONTHLY
from billing.exceptions import BillingStateError


def _oid_ext(oid_dotted: str) -> x509.UnrecognizedExtension:
    return x509.UnrecognizedExtension(ObjectIdentifier(oid_dotted), b"\x05\x00")


def _name(cn: str) -> x509.Name:
    return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)])


def _build_chain(
    *,
    leaf_oid: str | None = APPLE_RECEIPT_SIGNING_OID,
    intermediate_oid: str | None = APPLE_WWDR_INTERMEDIATE_OID,
    leaf_is_ca: bool = False,
    intermediate_is_ca: bool = True,
    leaf_digital_signature: bool = True,
    intermediate_key_cert_sign: bool = True,
    leaf_expired: bool = False,
    intermediate_not_after_days: int = 60,
    root_not_after_days: int = 365,
):
    """Build a 3-cert Apple-like chain with controllable policy extensions."""
    now = datetime.now(dt_timezone.utc)
    root_key = ec.generate_private_key(ec.SECP256R1())
    int_key = ec.generate_private_key(ec.SECP256R1())
    leaf_key = ec.generate_private_key(ec.SECP256R1())

    root_name = _name("Test Apple Root")
    int_name = _name("Test WWDR Intermediate")
    leaf_name = _name("Test Receipt Signing Leaf")

    root_builder = (
        x509.CertificateBuilder()
        .subject_name(root_name)
        .issuer_name(root_name)
        .public_key(root_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=60))
        .not_valid_after(now + timedelta(days=root_not_after_days))
        .add_extension(x509.BasicConstraints(ca=True, path_length=1), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=False,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=True,
                crl_sign=True,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
    )
    root = root_builder.sign(root_key, hashes.SHA256())

    int_builder = (
        x509.CertificateBuilder()
        .subject_name(int_name)
        .issuer_name(root_name)
        .public_key(int_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=60))
        .not_valid_after(now + timedelta(days=intermediate_not_after_days))
        .add_extension(
            x509.BasicConstraints(
                ca=intermediate_is_ca,
                path_length=0 if intermediate_is_ca else None,
            ),
            critical=True,
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature=False,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=intermediate_key_cert_sign,
                crl_sign=True,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
    )
    if intermediate_oid:
        int_builder = int_builder.add_extension(_oid_ext(intermediate_oid), critical=False)
    intermediate = int_builder.sign(root_key, hashes.SHA256())

    if leaf_expired:
        leaf_before = now - timedelta(days=40)
        leaf_after = now - timedelta(days=1)
    else:
        leaf_before = now - timedelta(days=60)
        leaf_after = now + timedelta(days=30)

    leaf_builder = (
        x509.CertificateBuilder()
        .subject_name(leaf_name)
        .issuer_name(int_name)
        .public_key(leaf_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(leaf_before)
        .not_valid_after(leaf_after)
        .add_extension(
            x509.BasicConstraints(ca=leaf_is_ca, path_length=None),
            critical=True,
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature=leaf_digital_signature,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=leaf_is_ca,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
    )
    if leaf_oid:
        leaf_builder = leaf_builder.add_extension(_oid_ext(leaf_oid), critical=False)
    leaf = leaf_builder.sign(int_key, hashes.SHA256())

    root_pem = root.public_bytes(serialization.Encoding.PEM).decode("ascii")
    return root, intermediate, leaf, leaf_key, root_pem


def _x5c(certs: list[x509.Certificate]) -> list[str]:
    return [
        base64.b64encode(c.public_bytes(serialization.Encoding.DER)).decode("ascii")
        for c in certs
    ]


def _signed_jws(
    payload: dict,
    *,
    leaf_key,
    certs: list[x509.Certificate],
) -> str:
    return jwt.encode(
        payload,
        leaf_key,
        algorithm="ES256",
        headers={"x5c": _x5c(certs)},
    )


def _txn_payload(**overrides) -> dict:
    now = datetime.now(dt_timezone.utc)
    payload = {
        "transactionId": "2000000999",
        "originalTransactionId": "1000000999",
        "bundleId": "app.checkstation.client",
        "productId": PRODUCT_PLUS_MONTHLY,
        "purchaseDate": int(now.timestamp() * 1000),
        "originalPurchaseDate": int(now.timestamp() * 1000),
        "expiresDate": int((now + timedelta(days=30)).timestamp() * 1000),
        "signedDate": int(now.timestamp() * 1000),
        "environment": "Sandbox",
        "type": "Auto-Renewable Subscription",
        "currency": "USD",
    }
    payload.update(overrides)
    return payload


@override_settings(DEBUG=True, APPLE_IAP_SKIP_JWS_CHAIN_VERIFY=False)
class AppleJwsHardeningTests(SimpleTestCase):
    def test_valid_apple_like_chain_accepted(self):
        root, intermediate, leaf, leaf_key, root_pem = _build_chain()
        token = _signed_jws(
            _txn_payload(),
            leaf_key=leaf_key,
            certs=[leaf, intermediate, root],
        )
        with override_settings(APPLE_IAP_ROOT_CA_PEM=root_pem):
            verified = verify_apple_jws(token)
        self.assertEqual(verified.payload["productId"], PRODUCT_PLUS_MONTHLY)

    def test_wrong_leaf_purpose_oid_rejected(self):
        root, intermediate, leaf, leaf_key, root_pem = _build_chain(
            leaf_oid="1.2.840.113635.100.6.1.2",  # unrelated Apple-ish OID
        )
        token = _signed_jws(
            _txn_payload(),
            leaf_key=leaf_key,
            certs=[leaf, intermediate, root],
        )
        with override_settings(APPLE_IAP_ROOT_CA_PEM=root_pem):
            with self.assertRaises(BillingStateError) as ctx:
                verify_apple_jws(token)
        self.assertEqual(ctx.exception.code, "apple_jws_invalid")

    def test_missing_leaf_oid_rejected(self):
        root, intermediate, leaf, leaf_key, root_pem = _build_chain(leaf_oid=None)
        token = _signed_jws(
            _txn_payload(),
            leaf_key=leaf_key,
            certs=[leaf, intermediate, root],
        )
        with override_settings(APPLE_IAP_ROOT_CA_PEM=root_pem):
            with self.assertRaises(BillingStateError):
                verify_apple_jws(token)

    def test_missing_intermediate_oid_rejected(self):
        root, intermediate, leaf, leaf_key, root_pem = _build_chain(
            intermediate_oid=None
        )
        token = _signed_jws(
            _txn_payload(),
            leaf_key=leaf_key,
            certs=[leaf, intermediate, root],
        )
        with override_settings(APPLE_IAP_ROOT_CA_PEM=root_pem):
            with self.assertRaises(BillingStateError):
                verify_apple_jws(token)

    def test_leaf_ca_misuse_rejected(self):
        root, intermediate, leaf, leaf_key, root_pem = _build_chain(leaf_is_ca=True)
        token = _signed_jws(
            _txn_payload(),
            leaf_key=leaf_key,
            certs=[leaf, intermediate, root],
        )
        with override_settings(APPLE_IAP_ROOT_CA_PEM=root_pem):
            with self.assertRaises(BillingStateError):
                verify_apple_jws(token)

    def test_intermediate_not_ca_rejected(self):
        root, intermediate, leaf, leaf_key, root_pem = _build_chain(
            intermediate_is_ca=False,
            intermediate_key_cert_sign=False,
        )
        # Intermediate without CA cannot sign leaf under cryptography verification.
        # Build a non-CA intermediate that still signed the leaf (path check may fail
        # earlier); assert our constraint check rejects when path still links.
        with override_settings(APPLE_IAP_ROOT_CA_PEM=root_pem):
            with self.assertRaises(BillingStateError):
                _verify_chain([leaf, intermediate, root])

    def test_wrong_trusted_root_rejected(self):
        root, intermediate, leaf, leaf_key, root_pem = _build_chain()
        other_root, _, _, _, other_pem = _build_chain()
        token = _signed_jws(
            _txn_payload(),
            leaf_key=leaf_key,
            certs=[leaf, intermediate, root],
        )
        with override_settings(APPLE_IAP_ROOT_CA_PEM=other_pem):
            with self.assertRaises(BillingStateError) as ctx:
                verify_apple_jws(token)
        self.assertEqual(ctx.exception.code, "apple_jws_invalid")
        _ = other_root  # unused; chain identity differs via PEM

    def test_self_signed_random_chain_rejected(self):
        now = datetime.now(dt_timezone.utc)
        key = ec.generate_private_key(ec.SECP256R1())
        name = _name("Self Signed")
        cert = (
            x509.CertificateBuilder()
            .subject_name(name)
            .issuer_name(name)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=1))
            .not_valid_after(now + timedelta(days=30))
            .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
            .sign(key, hashes.SHA256())
        )
        pem = cert.public_bytes(serialization.Encoding.PEM).decode("ascii")
        token = _signed_jws(
            _txn_payload(),
            leaf_key=key,
            certs=[cert, cert, cert],
        )
        with override_settings(APPLE_IAP_ROOT_CA_PEM=pem):
            with self.assertRaises(BillingStateError):
                verify_apple_jws(token)

    def test_expired_leaf_rejected(self):
        root, intermediate, leaf, leaf_key, root_pem = _build_chain(leaf_expired=True)
        token = _signed_jws(
            _txn_payload(),
            leaf_key=leaf_key,
            certs=[leaf, intermediate, root],
        )
        with override_settings(APPLE_IAP_ROOT_CA_PEM=root_pem):
            with self.assertRaises(BillingStateError):
                verify_apple_jws(token)

    def test_tampered_payload_rejected(self):
        root, intermediate, leaf, leaf_key, root_pem = _build_chain()
        token = _signed_jws(
            _txn_payload(),
            leaf_key=leaf_key,
            certs=[leaf, intermediate, root],
        )
        parts = token.split(".")
        # Flip a character in the payload segment.
        body = list(parts[1])
        body[2] = "A" if body[2] != "A" else "B"
        tampered = f"{parts[0]}.{''.join(body)}.{parts[2]}"
        with override_settings(APPLE_IAP_ROOT_CA_PEM=root_pem):
            with self.assertRaises(BillingStateError):
                verify_apple_jws(tampered)

    def test_tampered_signature_rejected(self):
        root, intermediate, leaf, leaf_key, root_pem = _build_chain()
        token = _signed_jws(
            _txn_payload(),
            leaf_key=leaf_key,
            certs=[leaf, intermediate, root],
        )
        parts = token.split(".")
        sig = list(parts[2])
        sig[0] = "A" if sig[0] != "A" else "B"
        tampered = f"{parts[0]}.{parts[1]}.{''.join(sig)}"
        with override_settings(APPLE_IAP_ROOT_CA_PEM=root_pem):
            with self.assertRaises(BillingStateError):
                verify_apple_jws(tampered)

    def test_wrong_chain_length_rejected(self):
        root, intermediate, leaf, leaf_key, root_pem = _build_chain()
        token = jwt.encode(
            _txn_payload(),
            leaf_key,
            algorithm="ES256",
            headers={"x5c": _x5c([leaf, intermediate])},
        )
        with override_settings(APPLE_IAP_ROOT_CA_PEM=root_pem):
            with self.assertRaises(BillingStateError):
                verify_apple_jws(token)

    def test_future_signed_date_rejected(self):
        root, intermediate, leaf, leaf_key, root_pem = _build_chain()
        future = datetime.now(dt_timezone.utc) + timedelta(hours=2)
        token = _signed_jws(
            _txn_payload(signedDate=int(future.timestamp() * 1000)),
            leaf_key=leaf_key,
            certs=[leaf, intermediate, root],
        )
        with override_settings(APPLE_IAP_ROOT_CA_PEM=root_pem):
            with self.assertRaises(BillingStateError):
                verify_apple_jws(token)

    def test_historical_signed_date_accepted(self):
        """Old signedDate must not reject; certs are evaluated at that time."""
        root, intermediate, leaf, leaf_key, root_pem = _build_chain()
        past = datetime.now(dt_timezone.utc) - timedelta(days=7)
        token = _signed_jws(
            _txn_payload(signedDate=int(past.timestamp() * 1000)),
            leaf_key=leaf_key,
            certs=[leaf, intermediate, root],
        )
        with override_settings(APPLE_IAP_ROOT_CA_PEM=root_pem):
            verified = verify_apple_jws(token)
        self.assertEqual(verified.payload["bundleId"], "app.checkstation.client")

    def test_skip_allowed_under_debug(self):
        with override_settings(DEBUG=True, APPLE_IAP_SKIP_JWS_CHAIN_VERIFY=True):
            # Malformed signature / no x5c still decodes when skip is on.
            header = base64.urlsafe_b64encode(
                b'{"alg":"ES256","typ":"JWT"}'
            ).rstrip(b"=").decode("ascii")
            body = base64.urlsafe_b64encode(
                b'{"transactionId":"1","productId":"x"}'
            ).rstrip(b"=").decode("ascii")
            verified = verify_apple_jws(f"{header}.{body}.fakesig")
        self.assertEqual(verified.payload["transactionId"], "1")

    def test_skip_forbidden_when_debug_false(self):
        header = base64.urlsafe_b64encode(
            b'{"alg":"ES256","typ":"JWT"}'
        ).rstrip(b"=").decode("ascii")
        body = base64.urlsafe_b64encode(b'{"transactionId":"1"}').rstrip(b"=").decode(
            "ascii"
        )
        with override_settings(DEBUG=False, APPLE_IAP_SKIP_JWS_CHAIN_VERIFY=True):
            with self.assertRaises(ImproperlyConfigured):
                verify_apple_jws(f"{header}.{body}.fakesig")

    def test_production_settings_ok_when_skip_false_and_root_set(self):
        _, _, _, _, root_pem = _build_chain()
        with override_settings(
            APPLE_IAP_SKIP_JWS_CHAIN_VERIFY=False,
            APPLE_IAP_ROOT_CA_PEM=root_pem,
        ):
            validate_apple_iap_production_settings()  # no raise

    def test_production_settings_fail_when_skip_true(self):
        _, _, _, _, root_pem = _build_chain()
        with override_settings(
            APPLE_IAP_SKIP_JWS_CHAIN_VERIFY=True,
            APPLE_IAP_ROOT_CA_PEM=root_pem,
        ):
            with self.assertRaises(ImproperlyConfigured):
                validate_apple_iap_production_settings()

    def test_production_settings_fail_when_root_missing(self):
        with override_settings(
            APPLE_IAP_SKIP_JWS_CHAIN_VERIFY=False,
            APPLE_IAP_ROOT_CA_PEM="",
        ):
            with self.assertRaises(ImproperlyConfigured):
                validate_apple_iap_production_settings()

    def test_encoding_regression_source_uses_serialization_encoding(self):
        import billing.apple_jws as apple_jws

        source = open(apple_jws.__file__, encoding="utf-8").read()
        self.assertIn("serialization.Encoding.DER", source)
        self.assertNotIn("x509.Encoding.DER", source)

    def test_verify_chain_with_valid_oids(self):
        root, intermediate, leaf, _leaf_key, root_pem = _build_chain()
        with override_settings(APPLE_IAP_ROOT_CA_PEM=root_pem):
            _verify_chain([leaf, intermediate, root])
        # Confirm leaf carries the receipt-signing OID extension.
        leaf.extensions.get_extension_for_oid(
            ObjectIdentifier(APPLE_RECEIPT_SIGNING_OID)
        )
        intermediate.extensions.get_extension_for_oid(
            ObjectIdentifier(APPLE_WWDR_INTERMEDIATE_OID)
        )
        # KeyUsage present on leaf for digital signatures.
        ku = leaf.extensions.get_extension_for_oid(ExtensionOID.KEY_USAGE).value
        self.assertTrue(ku.digital_signature)
