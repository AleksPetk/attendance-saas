"""Create ContactRequest rows and send the operator mailbox message."""

import hashlib
import logging
import re
import secrets

from django.conf import settings
from django.core.cache import cache
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.utils.html import escape

from contact.catalog import (
    CLIENT_TYPES,
    EMAIL_MAX,
    HONEYPOT_FIELD,
    MESSAGE_MAX,
    MESSAGE_MIN,
    NAME_MAX,
    SUBJECT_MAX,
    SUBJECT_MIN,
    get_pair,
    is_privacy_request,
)
from contact.models import ClientType, ContactRequest, DeliveryStatus
from core.email_branding import render_branded_email
from core.mail import EmailConfigurationError, EmailSendError, send_transactional_email

logger = logging.getLogger("contact")

HEADER_UNSAFE = re.compile(r"[\r\n\x00]+")
RATE_LIMIT = 5
RATE_WINDOW_SECONDS = 60 * 60
DUPLICATE_WINDOW_SECONDS = 120

GENERIC_REJECT = "Unable to send your message."
RATE_REJECT = "Too many messages. Please try again later."


class ContactValidationError(Exception):
    def __init__(self, errors, status=400):
        super().__init__("invalid")
        self.errors = errors
        self.status = status


class ContactSpamRejected(Exception):
    """Honeypot or similar. Callers should return a generic failure."""


def _clean_text(value, *, max_length, allow_newlines=False):
    text = str(value or "")
    if not allow_newlines:
        text = HEADER_UNSAFE.sub(" ", text)
    else:
        text = text.replace("\x00", "")
        text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.strip()
    if len(text) > max_length:
        text = text[:max_length]
    return text


def _validate_email(value):
    email = _clean_text(value, max_length=EMAIL_MAX).lower()
    if not email:
        raise ContactValidationError({"email": "Enter a valid email address."})
    try:
        validate_email(email)
    except ValidationError:
        raise ContactValidationError({"email": "Enter a valid email address."}) from None
    if any(char in email for char in "\r\n\x00"):
        raise ContactValidationError({"email": "Enter a valid email address."})
    return email


def generate_public_ref():
    for _ in range(8):
        ref = "CS-" + secrets.token_hex(4).upper()
        if not ContactRequest.objects.filter(public_ref=ref).exists():
            return ref
    raise ContactValidationError({"detail": GENERIC_REJECT}, status=503)


def client_ip(request):
    from core.client_ip import get_client_ip

    return get_client_ip(request)


def _rate_key(ip):
    digest = hashlib.sha256(str(ip).encode("utf-8")).hexdigest()[:24]
    return f"contact:rl:{digest}"


def _duplicate_key(email, subject, message):
    raw = f"{email}\n{subject}\n{message}".encode("utf-8")
    return "contact:dup:" + hashlib.sha256(raw).hexdigest()


def check_rate_limit(ip):
    key = _rate_key(ip)
    count = cache.get(key, 0)
    if int(count) >= RATE_LIMIT:
        raise ContactValidationError({"detail": RATE_REJECT}, status=429)
    cache.set(key, int(count) + 1, RATE_WINDOW_SECONDS)


def find_recent_duplicate(email, subject, message):
    ref = cache.get(_duplicate_key(email, subject, message))
    if not ref:
        return None
    return ContactRequest.objects.filter(public_ref=ref).first()


def remember_duplicate(email, subject, message, public_ref):
    cache.set(
        _duplicate_key(email, subject, message),
        public_ref,
        DUPLICATE_WINDOW_SECONDS,
    )


def parse_submission(payload):
    if not isinstance(payload, dict):
        raise ContactValidationError({"detail": GENERIC_REJECT})
    honeypot = str(payload.get(HONEYPOT_FIELD) or "").strip()
    if honeypot:
        raise ContactSpamRejected()

    pair = get_pair(payload.get("category"), payload.get("subcategory"))
    if not pair:
        raise ContactValidationError(
            {
                "category": "Choose a valid category.",
                "subcategory": "Choose a valid subcategory.",
            }
        )
    category, sub = pair
    email = _validate_email(payload.get("email"))
    name = _clean_text(payload.get("name"), max_length=NAME_MAX)
    subject = _clean_text(payload.get("subject"), max_length=SUBJECT_MAX)
    message = _clean_text(
        payload.get("message"),
        max_length=MESSAGE_MAX,
        allow_newlines=True,
    )
    errors = {}
    if len(subject) < SUBJECT_MIN:
        errors["subject"] = f"Subject must be at least {SUBJECT_MIN} characters."
    if len(message) < MESSAGE_MIN:
        errors["message"] = f"Message must be at least {MESSAGE_MIN} characters."
    if errors:
        raise ContactValidationError(errors)

    client_type = str(payload.get("client_type") or ClientType.PUBLIC_WEB).strip()
    if client_type not in CLIENT_TYPES:
        client_type = ClientType.PUBLIC_WEB
    page_path = _clean_text(payload.get("page_path"), max_length=200)
    if page_path.startswith("http://") or page_path.startswith("https://"):
        page_path = ""
    locale = _clean_text(payload.get("locale"), max_length=16)
    return {
        "category": category,
        "sub": sub,
        "email": email,
        "name": name,
        "subject": subject,
        "message": message,
        "client_type": client_type,
        "page_path": page_path,
        "locale": locale,
        "is_privacy_request": is_privacy_request(category["id"], sub["id"]),
    }


def destination_email():
    return str(getattr(settings, "CONTACT_TO_EMAIL", "") or "").strip()


def build_contact_email(row):
    client_label = dict(ClientType.choices).get(row.client_type, row.client_type)
    submitted = row.created_at.isoformat().replace("+00:00", "Z") if row.created_at else ""
    lines = [
        f"Reference: {row.public_ref}",
        f"Category: {row.category_label}",
        f"Subcategory: {row.subcategory_label}",
        f"From: {row.email}",
    ]
    if row.name:
        lines.append(f"Name: {row.name}")
    lines.extend(
        [
            "",
            "Subject:",
            row.subject,
            "",
            "Message:",
            row.message,
            "",
            f"Submitted: {submitted}",
            f"Client: {client_label}",
        ]
    )
    if row.is_privacy_request:
        lines.append("Classification: privacy request")
    extra_text = "\n".join(lines)
    html_message = escape(row.message).replace("\n", "<br>")
    extra_html = (
        f"<p><strong>Reference:</strong> {escape(row.public_ref)}</p>"
        f"<p><strong>Category:</strong> {escape(row.category_label)}<br>"
        f"<strong>Subcategory:</strong> {escape(row.subcategory_label)}<br>"
        f"<strong>From:</strong> {escape(row.email)}"
        + (f"<br><strong>Name:</strong> {escape(row.name)}" if row.name else "")
        + "</p>"
        f"<p><strong>Subject:</strong><br>{escape(row.subject)}</p>"
        f"<p><strong>Message:</strong><br>{html_message}</p>"
        f"<p>Submitted: {escape(submitted)}<br>Client: {escape(client_label)}"
        + (
            "<br>Classification: privacy request"
            if row.is_privacy_request
            else ""
        )
        + "</p>"
    )
    html, text = render_branded_email(
        heading="CheckStation Contact",
        extra_html=extra_html,
        extra_text=extra_text,
    )
    return text, html


def send_contact_email(row):
    to_email = destination_email()
    if not to_email:
        raise EmailConfigurationError("CONTACT_TO_EMAIL is not configured.")
    text, html = build_contact_email(row)
    send_transactional_email(
        to_email=to_email,
        subject=f"[CheckStation Contact] {row.public_ref}: {row.subject}"[:180],
        html_body=html,
        text_body=text,
        reply_to=row.email,
    )


def submit_contact(payload, *, ip):
    parsed = parse_submission(payload)
    check_rate_limit(ip)
    existing = find_recent_duplicate(
        parsed["email"], parsed["subject"], parsed["message"]
    )
    if existing:
        return existing, True

    row = ContactRequest.objects.create(
        public_ref=generate_public_ref(),
        category_id=parsed["category"]["id"],
        subcategory_id=parsed["sub"]["id"],
        category_label=parsed["category"]["label"],
        subcategory_label=parsed["sub"]["label"],
        email=parsed["email"],
        name=parsed["name"],
        subject=parsed["subject"],
        message=parsed["message"],
        client_type=parsed["client_type"],
        page_path=parsed["page_path"],
        locale=parsed["locale"],
        is_privacy_request=parsed["is_privacy_request"],
        delivery_status=DeliveryStatus.PENDING,
    )
    remember_duplicate(parsed["email"], parsed["subject"], parsed["message"], row.public_ref)
    try:
        send_contact_email(row)
    except EmailConfigurationError:
        logger.error("Contact email is not configured; request %s stored.", row.public_ref)
        row.mark_failed("not_configured")
        return row, False
    except EmailSendError:
        logger.error("Contact email send failed; request %s stored.", row.public_ref)
        row.mark_failed("send_failed")
        return row, False
    row.mark_sent()
    return row, False
