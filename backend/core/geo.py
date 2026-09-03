"""Trusted request geography for billing market and first-visit locale.

Production nginx validates Cloudflare edge IPs and forwards a normalized
country via X-CheckStation-Country. This module never trusts raw CF-IPCountry
from the client and never exposes IP addresses.
"""

from __future__ import annotations

from dataclasses import dataclass

from billing.markets import MARKET_GLOBAL, MARKET_JP

# Header set only by trusted nginx after Cloudflare CIDR validation.
TRUSTED_COUNTRY_HEADER = "HTTP_X_CHECKSTATION_COUNTRY"

# Cloudflare special / unknown codes — treat as missing.
_UNTRUSTED_COUNTRY_CODES = frozenset({"", "XX", "T1", "A1", "A2", "O1"})


@dataclass(frozen=True)
class RequestGeo:
    """Non-sensitive geo resolution for the current request."""

    country_code: str
    billing_market: str
    default_locale: str


def _normalize_country_code(raw: str) -> str:
    code = str(raw or "").strip().upper()
    if len(code) != 2 or not code.isalpha():
        return ""
    if code in _UNTRUSTED_COUNTRY_CODES:
        return ""
    return code


def trusted_country_code(request) -> str:
    """Return ISO country from the trusted nginx header, or ''."""
    if request is None:
        return ""
    meta = getattr(request, "META", None) or {}
    return _normalize_country_code(meta.get(TRUSTED_COUNTRY_HEADER, ""))


def billing_market_for_country(country_code: str) -> str:
    if _normalize_country_code(country_code) == "JP":
        return MARKET_JP
    return MARKET_GLOBAL


def default_locale_for_country(country_code: str) -> str:
    if _normalize_country_code(country_code) == "JP":
        return "ja"
    return "en"


def resolve_request_geo(request=None) -> RequestGeo:
    """
    Resolve country → billing market + first-visit locale default.

    Missing / unknown / spoofed (absent trusted header) → global + en.
    Language preference of the client is never consulted.
    """
    country = trusted_country_code(request)
    return RequestGeo(
        country_code=country,
        billing_market=billing_market_for_country(country),
        default_locale=default_locale_for_country(country),
    )


def public_geo_payload(request=None) -> dict:
    """JSON-safe geo fields (no IPs)."""
    geo = resolve_request_geo(request)
    return {
        "country_code": geo.country_code,
        "billing_market": geo.billing_market,
        "default_locale": geo.default_locale,
    }
