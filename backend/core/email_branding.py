"""Shared CheckStation branding for transactional email."""

import ipaddress
from urllib.parse import urlparse

from django.conf import settings
from django.template.loader import render_to_string

from core.mail import EmailConfigurationError, frontend_url

CANONICAL_PRODUCT_NAME = "CheckStation"
BRAND_LOGO_PATH = ("email", "checkstation-icon.png")
BRAND_LOGO_WIDTH = 36
BRAND_LOGO_HEIGHT = 36
BRAND_STAMP_WIDTH = 24
BRAND_STAMP_HEIGHT = 24

_LOCAL_HOSTS = {
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]",
}


def canonical_product_name(value=None):
    """Normalize spaced/case variants to CheckStation; keep custom names."""
    text = (value if value is not None else getattr(settings, "PRODUCT_NAME", "") or "")
    text = str(text).strip()
    if not text:
        return CANONICAL_PRODUCT_NAME
    if "".join(text.split()).casefold() == "checkstation":
        return CANONICAL_PRODUCT_NAME
    return text


def product_name():
    return canonical_product_name()


def _host_is_public(hostname):
    host = (hostname or "").strip().lower().rstrip(".")
    if host.startswith("[") and host.endswith("]"):
        host = host[1:-1]
    if not host or host in _LOCAL_HOSTS:
        return False
    if host.endswith(".local") or host.endswith(".internal") or host.endswith(".localhost"):
        return False
    try:
        return ipaddress.ip_address(host).is_global
    except ValueError:
        return True


def public_https_asset_url(value):
    """Return value if it is an absolute public HTTPS URL; otherwise empty."""
    text = str(value or "").strip()
    if not text:
        return ""
    parsed = urlparse(text)
    if parsed.scheme != "https":
        return ""
    if parsed.query or parsed.fragment:
        return ""
    if not parsed.netloc or not parsed.path or parsed.path == "/":
        return ""
    hostname = parsed.hostname or ""
    if not _host_is_public(hostname):
        return ""
    return text


def _frontend_logo_candidate():
    try:
        return frontend_url(*BRAND_LOGO_PATH)
    except EmailConfigurationError:
        return ""


def brand_logo_url():
    """
    Public HTTPS URL for the transactional-email CheckStation icon, or empty.

    Transactional mail uses a hosted <img src> only when a reachable public
    HTTPS URL is configured. The file is never added as a MIME/Resend
    attachment. Localhost and http:// URLs are rejected so Gmail is not asked
    to fetch them. An empty result means the template should render a text
    wordmark instead of a broken image.
    """
    candidates = (
        getattr(settings, "EMAIL_BRAND_LOGO_URL", "") or "",
        _frontend_logo_candidate(),
    )
    for raw in candidates:
        url = public_https_asset_url(raw)
        if url:
            return url
    return ""


def home_url():
    return frontend_url()


def render_branded_email(
    *,
    heading,
    intro="",
    action_label="",
    action_url="",
    security_note="",
    expiry_hours=None,
    extra_html="",
    extra_text="",
    footer_note="",
):
    """Render the shared HTML + plain-text transactional layout."""
    name = product_name()
    logo_url = brand_logo_url()
    context = {
        "product_name": name,
        "brand_logo_url": logo_url,
        "brand_logo_width": BRAND_LOGO_WIDTH,
        "brand_logo_height": BRAND_LOGO_HEIGHT,
        "brand_stamp_width": BRAND_STAMP_WIDTH,
        "brand_stamp_height": BRAND_STAMP_HEIGHT,
        "home_url": home_url(),
        "subject": heading,
        "heading": heading,
        "intro": intro,
        "action_label": action_label,
        "action_url": action_url,
        "security_note": security_note,
        "expiry_hours": expiry_hours,
        "show_expiry": expiry_hours is not None,
        "extra_html": extra_html,
        "extra_text": extra_text,
        "footer_note": footer_note,
    }
    html_body = render_to_string("email/branded_message.html", context)
    text_body = render_to_string("email/branded_message.txt", context)
    return html_body, text_body
