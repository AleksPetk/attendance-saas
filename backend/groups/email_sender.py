"""
Group email sender services: configuration, verification, and after-action send.

Does not use platform Resend. Attendance success must not depend on email
delivery success.

Configuration flow: draft credentials → successful test → confirm save.
Unverified drafts must not replace an active Ready sender.
"""

import hashlib
import json
import logging

from django.core.exceptions import ValidationError
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from groups.email_providers import (
    EmailSenderProviderError,
    get_email_sender_provider,
)
from groups.email_providers.custom_smtp import validate_smtp_fields
from groups.email_providers.gmail import (
    normalize_gmail_app_password,
    validate_gmail_fields,
)
from groups.email_providers.microsoft import validate_microsoft_fields
from groups.email_providers.yahoo import (
    normalize_yahoo_app_password,
    validate_yahoo_fields,
)
from groups.email_sender_models import (
    EmailSenderProviderKind,
    EmailSenderStatus,
    GroupEmailDelivery,
    GroupEmailDeliveryStatus,
    GroupEmailRecipientKind,
    GroupEmailSender,
)
from groups.forward_emails import unique_after_action_recipients
from groups.notification_email_render import render_after_action_notification
from groups.participation_emails import (
    participation_emails_for_membership,
    participation_emails_for_visitor,
    primary_participation_email,
)

logger = logging.getLogger("groups.email_sender")

SUPPORTED_PROVIDERS = {
    EmailSenderProviderKind.CUSTOM_SMTP,
    EmailSenderProviderKind.GMAIL,
    EmailSenderProviderKind.MICROSOFT,
    EmailSenderProviderKind.YAHOO,
}

GUIDED_MAILBOX_PROVIDERS = {
    EmailSenderProviderKind.GMAIL,
    EmailSenderProviderKind.MICROSOFT,
    EmailSenderProviderKind.YAHOO,
}

# Session-backed proof that a draft config was successfully tested.
SESSION_DRAFT_VERIFIED_KEY = "group_email_sender_draft_verified"
DRAFT_VERIFICATION_TTL_SECONDS = 60 * 30


def get_group_email_sender(group):
    return (
        GroupEmailSender.objects.filter(group=group, organization=group.organization)
        .first()
    )


def group_email_sender_is_ready(group):
    sender = get_group_email_sender(group)
    return bool(sender and sender.is_ready)


def email_sender_public_payload(sender):
    if sender is None:
        return {
            "configured": False,
            "provider": EmailSenderProviderKind.CUSTOM_SMTP,
            "status": EmailSenderStatus.NOT_CONFIGURED,
            "status_label": EmailSenderStatus.NOT_CONFIGURED.label,
            "password_configured": False,
            "smtp_host": "",
            "smtp_port": None,
            "smtp_security": "",
            "smtp_username": "",
            "gmail_address": "",
            "microsoft_email": "",
            "yahoo_email": "",
            "from_email": "",
            "from_name": "",
            "last_tested_at": None,
            "last_test_error": "",
        }

    status_label = (
        EmailSenderStatus(sender.status).label
        if sender.status in EmailSenderStatus.values
        else sender.status
    )
    configured = (
        sender.status != EmailSenderStatus.NOT_CONFIGURED
        or sender.password_configured
        or bool(sender.smtp_host)
        or bool(sender.from_email)
    )
    base = {
        "configured": configured,
        "provider": sender.provider,
        "status": sender.status,
        "status_label": status_label,
        "password_configured": sender.password_configured,
        "from_email": sender.from_email,
        "from_name": sender.from_name,
        "last_tested_at": sender.last_tested_at,
        "last_test_error": sender.last_test_error,
    }

    if sender.provider == EmailSenderProviderKind.GMAIL:
        return {
            **base,
            "gmail_address": sender.from_email,
            "microsoft_email": "",
            "yahoo_email": "",
            # Do not expose fake Custom SMTP transport values for Gmail.
            "smtp_host": "",
            "smtp_port": None,
            "smtp_security": "",
            "smtp_username": "",
        }

    if sender.provider == EmailSenderProviderKind.MICROSOFT:
        return {
            **base,
            "gmail_address": "",
            "microsoft_email": sender.from_email,
            "yahoo_email": "",
            # Do not expose fake Custom SMTP transport values for Microsoft.
            "smtp_host": "",
            "smtp_port": None,
            "smtp_security": "",
            "smtp_username": "",
        }

    if sender.provider == EmailSenderProviderKind.YAHOO:
        return {
            **base,
            "gmail_address": "",
            "microsoft_email": "",
            "yahoo_email": sender.from_email,
            # Do not expose fake Custom SMTP transport values for Yahoo.
            "smtp_host": "",
            "smtp_port": None,
            "smtp_security": "",
            "smtp_username": "",
        }

    return {
        **base,
        "gmail_address": "",
        "microsoft_email": "",
        "yahoo_email": "",
        "smtp_host": sender.smtp_host,
        "smtp_port": sender.smtp_port,
        "smtp_security": sender.smtp_security,
        "smtp_username": sender.smtp_username,
    }


def _normalize_password_for_fingerprint(provider, smtp_password):
    if provider == EmailSenderProviderKind.GMAIL:
        return normalize_gmail_app_password(smtp_password or "")
    if provider == EmailSenderProviderKind.YAHOO:
        return normalize_yahoo_app_password(smtp_password or "")
    return (smtp_password or "").strip()


def email_sender_config_fingerprint(
    *,
    provider,
    smtp_host="",
    smtp_port=None,
    smtp_security="",
    smtp_username="",
    from_email="",
    smtp_password="",
    using_stored_password=False,
):
    password_token = (
        "__stored__"
        if using_stored_password
        else _normalize_password_for_fingerprint(provider, smtp_password)
    )
    payload = {
        "provider": provider,
        "smtp_host": (smtp_host or "").strip(),
        "smtp_port": smtp_port,
        "smtp_security": (smtp_security or "").strip(),
        "smtp_username": (smtp_username or "").strip(),
        "from_email": (from_email or "").strip().lower(),
        "password": password_token,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def store_draft_verification(request, *, group_id, fingerprint):
    if request is None or not hasattr(request, "session"):
        return
    request.session[SESSION_DRAFT_VERIFIED_KEY] = {
        "group_id": int(group_id),
        "fingerprint": fingerprint,
        "verified_at": timezone.now().isoformat(),
    }
    request.session.modified = True


def clear_draft_verification(request, *, group_id=None):
    if request is None or not hasattr(request, "session"):
        return
    data = request.session.get(SESSION_DRAFT_VERIFIED_KEY)
    if not data:
        return
    if group_id is not None and data.get("group_id") != int(group_id):
        return
    request.session.pop(SESSION_DRAFT_VERIFIED_KEY, None)
    request.session.modified = True


def draft_verification_matches(request, *, group_id, fingerprint):
    if request is None or not hasattr(request, "session"):
        return False
    data = request.session.get(SESSION_DRAFT_VERIFIED_KEY) or {}
    if data.get("group_id") != int(group_id):
        return False
    if data.get("fingerprint") != fingerprint:
        return False
    verified_at = parse_datetime(data.get("verified_at") or "")
    if verified_at is None:
        return False
    if timezone.is_naive(verified_at):
        verified_at = timezone.make_aware(verified_at, timezone.get_current_timezone())
    age = (timezone.now() - verified_at).total_seconds()
    return 0 <= age <= DRAFT_VERIFICATION_TTL_SECONDS


def _connection_settings_changed(sender, cleaned, *, password_provided, provider):
    """
    Whether connection/auth settings changed (requires re-verification).

    From-name alone does not require SMTP re-verification.
    """
    if password_provided:
        return True
    if sender.provider != provider:
        return True
    if provider in GUIDED_MAILBOX_PROVIDERS:
        return (sender.from_email or "") != (cleaned["from_email"] or "")
    comparisons = (
        ("smtp_host", cleaned["smtp_host"]),
        ("smtp_port", cleaned["smtp_port"]),
        ("smtp_security", cleaned["smtp_security"]),
        ("smtp_username", cleaned["smtp_username"]),
        ("from_email", cleaned["from_email"]),
    )
    for field, value in comparisons:
        if getattr(sender, field) != value:
            return True
    return False


def _clear_provider_specific_config(sender, *, next_provider):
    """Clear obsolete transport fields/secrets when switching providers."""
    sender.clear_smtp_password()
    sender.provider_settings = {}
    sender.smtp_host = ""
    sender.smtp_port = None
    sender.smtp_security = ""
    sender.smtp_username = ""
    sender.from_email = ""


def _password_field_label(provider):
    if provider in (
        EmailSenderProviderKind.GMAIL,
        EmailSenderProviderKind.YAHOO,
    ):
        return "App Password"
    if provider == EmailSenderProviderKind.MICROSOFT:
        return "password / app password"
    return "SMTP password"


def _fingerprint_for_populated_sender(sender, *, password_provided, smtp_password):
    return email_sender_config_fingerprint(
        provider=sender.provider,
        smtp_host=sender.smtp_host,
        smtp_port=sender.smtp_port,
        smtp_security=sender.smtp_security,
        smtp_username=sender.smtp_username,
        from_email=sender.from_email,
        smtp_password=smtp_password if password_provided else "",
        using_stored_password=(not password_provided and sender.password_configured),
    )


def _finalize_verified_sender_save(
    sender,
    *,
    group,
    request,
    connection_changed,
    password_provided,
    smtp_password,
):
    """
    Persist sender only after a matching successful draft test for connection changes.
    From-name-only updates on an existing Ready sender do not require re-test.
    """
    requires_verification = (
        connection_changed or sender.status == EmailSenderStatus.NOT_CONFIGURED
    )
    if requires_verification:
        fingerprint = _fingerprint_for_populated_sender(
            sender,
            password_provided=password_provided,
            smtp_password=smtp_password or "",
        )
        if not draft_verification_matches(
            request, group_id=group.pk, fingerprint=fingerprint
        ):
            raise ValidationError(
                {
                    "detail": (
                        "Send a successful test email before saving this sender."
                    )
                }
            )
        sender.mark_ready()
    sender.save()
    clear_draft_verification(request, group_id=group.pk)
    return sender


def save_group_email_sender(
    *,
    group,
    provider=None,
    smtp_host=None,
    smtp_port=None,
    smtp_security=None,
    smtp_username=None,
    from_email=None,
    from_name=None,
    gmail_address=None,
    microsoft_email=None,
    yahoo_email=None,
    smtp_password=None,
    change_password=False,
    request=None,
):
    sender = get_group_email_sender(group)
    if sender is None:
        sender = GroupEmailSender(
            organization=group.organization,
            group=group,
            provider=EmailSenderProviderKind.CUSTOM_SMTP,
            status=EmailSenderStatus.NOT_CONFIGURED,
        )

    if provider is None:
        provider = sender.provider or EmailSenderProviderKind.CUSTOM_SMTP
    if provider not in SUPPORTED_PROVIDERS:
        raise ValidationError({"provider": "This email provider is not available."})

    provider_changed = bool(sender.pk) and sender.provider != provider
    if provider_changed:
        _clear_provider_specific_config(sender, next_provider=provider)

    password_provided = bool(change_password or smtp_password)
    if change_password and not smtp_password:
        raise ValidationError(
            {"smtp_password": f"Enter a new {_password_field_label(provider)}."}
        )

    if provider == EmailSenderProviderKind.GMAIL:
        if gmail_address is None and from_email is not None:
            gmail_address = from_email
        merged_address = (
            sender.from_email if gmail_address is None else gmail_address
        )
        merged_from_name = sender.from_name if from_name is None else from_name
        require_password = password_provided or not sender.password_configured
        cleaned = validate_gmail_fields(
            gmail_address=merged_address,
            password=(
                smtp_password
                if password_provided
                else ("x" if sender.password_configured else "")
            ),
            require_password=require_password,
        )
        cleaned["from_name"] = (merged_from_name or "").strip()
        if password_provided:
            smtp_password = normalize_gmail_app_password(smtp_password)
            if not smtp_password:
                raise ValidationError({"smtp_password": "App Password is required."})

        connection_changed = (
            sender.pk is None
            or _connection_settings_changed(
                sender,
                cleaned,
                password_provided=password_provided,
                provider=provider,
            )
        )

        sender.provider = EmailSenderProviderKind.GMAIL
        sender.smtp_host = ""
        sender.smtp_port = None
        sender.smtp_security = ""
        sender.smtp_username = cleaned["smtp_username"]
        sender.from_email = cleaned["from_email"]
        sender.from_name = cleaned["from_name"]
        sender.provider_settings = {}
        if password_provided:
            sender.set_smtp_password(smtp_password)

        return _finalize_verified_sender_save(
            sender,
            group=group,
            request=request,
            connection_changed=connection_changed,
            password_provided=password_provided,
            smtp_password=smtp_password,
        )

    if provider == EmailSenderProviderKind.MICROSOFT:
        if microsoft_email is None and from_email is not None:
            microsoft_email = from_email
        merged_address = (
            sender.from_email if microsoft_email is None else microsoft_email
        )
        merged_from_name = sender.from_name if from_name is None else from_name
        require_password = password_provided or not sender.password_configured
        cleaned = validate_microsoft_fields(
            microsoft_email=merged_address,
            password=(
                smtp_password
                if password_provided
                else ("x" if sender.password_configured else "")
            ),
            require_password=require_password,
        )
        cleaned["from_name"] = (merged_from_name or "").strip()
        if password_provided:
            smtp_password = (smtp_password or "").strip()
            if not smtp_password:
                raise ValidationError(
                    {"smtp_password": "Password / app password is required."}
                )

        connection_changed = (
            sender.pk is None
            or _connection_settings_changed(
                sender,
                cleaned,
                password_provided=password_provided,
                provider=provider,
            )
        )

        sender.provider = EmailSenderProviderKind.MICROSOFT
        sender.smtp_host = ""
        sender.smtp_port = None
        sender.smtp_security = ""
        sender.smtp_username = cleaned["smtp_username"]
        sender.from_email = cleaned["from_email"]
        sender.from_name = cleaned["from_name"]
        sender.provider_settings = {}
        if password_provided:
            sender.set_smtp_password(smtp_password)

        return _finalize_verified_sender_save(
            sender,
            group=group,
            request=request,
            connection_changed=connection_changed,
            password_provided=password_provided,
            smtp_password=smtp_password,
        )

    if provider == EmailSenderProviderKind.YAHOO:
        if yahoo_email is None and from_email is not None:
            yahoo_email = from_email
        merged_address = sender.from_email if yahoo_email is None else yahoo_email
        merged_from_name = sender.from_name if from_name is None else from_name
        require_password = password_provided or not sender.password_configured
        cleaned = validate_yahoo_fields(
            yahoo_email=merged_address,
            password=(
                smtp_password
                if password_provided
                else ("x" if sender.password_configured else "")
            ),
            require_password=require_password,
        )
        cleaned["from_name"] = (merged_from_name or "").strip()
        if password_provided:
            smtp_password = normalize_yahoo_app_password(smtp_password)
            if not smtp_password:
                raise ValidationError({"smtp_password": "App Password is required."})

        connection_changed = (
            sender.pk is None
            or _connection_settings_changed(
                sender,
                cleaned,
                password_provided=password_provided,
                provider=provider,
            )
        )

        sender.provider = EmailSenderProviderKind.YAHOO
        sender.smtp_host = ""
        sender.smtp_port = None
        sender.smtp_security = ""
        sender.smtp_username = cleaned["smtp_username"]
        sender.from_email = cleaned["from_email"]
        sender.from_name = cleaned["from_name"]
        sender.provider_settings = {}
        if password_provided:
            sender.set_smtp_password(smtp_password)

        return _finalize_verified_sender_save(
            sender,
            group=group,
            request=request,
            connection_changed=connection_changed,
            password_provided=password_provided,
            smtp_password=smtp_password,
        )

    # Custom SMTP
    merged_host = sender.smtp_host if smtp_host is None else smtp_host
    merged_port = sender.smtp_port if smtp_port is None else smtp_port
    merged_security = sender.smtp_security if smtp_security is None else smtp_security
    merged_username = sender.smtp_username if smtp_username is None else smtp_username
    merged_from_email = sender.from_email if from_email is None else from_email
    merged_from_name = sender.from_name if from_name is None else from_name

    require_password = password_provided or not sender.password_configured
    cleaned = validate_smtp_fields(
        host=merged_host,
        port=merged_port,
        security=merged_security,
        username=merged_username,
        password=(
            smtp_password
            if password_provided
            else ("x" if sender.password_configured else "")
        ),
        from_email=merged_from_email,
        require_password=require_password,
    )
    cleaned["from_name"] = (merged_from_name or "").strip()

    connection_changed = (
        sender.pk is None
        or _connection_settings_changed(
            sender,
            cleaned,
            password_provided=password_provided,
            provider=provider,
        )
    )

    sender.provider = EmailSenderProviderKind.CUSTOM_SMTP
    sender.smtp_host = cleaned["smtp_host"]
    sender.smtp_port = cleaned["smtp_port"]
    sender.smtp_security = cleaned["smtp_security"]
    sender.smtp_username = cleaned["smtp_username"]
    sender.from_email = cleaned["from_email"]
    sender.from_name = cleaned["from_name"]
    sender.provider_settings = {}
    if password_provided:
        sender.set_smtp_password(smtp_password)

    return _finalize_verified_sender_save(
        sender,
        group=group,
        request=request,
        connection_changed=connection_changed,
        password_provided=password_provided,
        smtp_password=smtp_password,
    )


def build_draft_email_sender(
    *,
    group,
    provider=None,
    smtp_host=None,
    smtp_port=None,
    smtp_security=None,
    smtp_username=None,
    from_email=None,
    from_name=None,
    gmail_address=None,
    microsoft_email=None,
    yahoo_email=None,
    smtp_password=None,
    change_password=False,
):
    """
    Build an in-memory sender for draft testing without mutating the saved row.
    Returns (draft_sender, fingerprint, plaintext_password_used).
    """
    existing = get_group_email_sender(group)
    draft = GroupEmailSender(
        organization=group.organization,
        group=group,
        provider=EmailSenderProviderKind.CUSTOM_SMTP,
        status=EmailSenderStatus.NOT_CONFIGURED,
    )
    # Seed non-secret defaults from the existing sender only when provider matches
    # and we are not switching; never copy onto a destructive switch draft.
    if provider is None:
        provider = (
            existing.provider
            if existing is not None
            else EmailSenderProviderKind.CUSTOM_SMTP
        )
    if provider not in SUPPORTED_PROVIDERS:
        raise ValidationError({"provider": "This email provider is not available."})

    same_provider = existing is not None and existing.provider == provider
    if same_provider:
        draft.smtp_host = existing.smtp_host
        draft.smtp_port = existing.smtp_port
        draft.smtp_security = existing.smtp_security
        draft.smtp_username = existing.smtp_username
        draft.from_email = existing.from_email
        draft.from_name = existing.from_name
        draft.smtp_password_encrypted = existing.smtp_password_encrypted

    password_provided = bool(change_password or smtp_password)
    if change_password and not smtp_password:
        raise ValidationError(
            {"smtp_password": f"Enter a new {_password_field_label(provider)}."}
        )

    # Reuse save_group_email_sender population by applying onto the draft object
    # through the same validation paths without calling save().
    if provider == EmailSenderProviderKind.GMAIL:
        if gmail_address is None and from_email is not None:
            gmail_address = from_email
        merged_address = draft.from_email if gmail_address is None else gmail_address
        merged_from_name = draft.from_name if from_name is None else from_name
        require_password = password_provided or not draft.password_configured
        cleaned = validate_gmail_fields(
            gmail_address=merged_address,
            password=(
                smtp_password
                if password_provided
                else ("x" if draft.password_configured else "")
            ),
            require_password=require_password,
        )
        cleaned["from_name"] = (merged_from_name or "").strip()
        if password_provided:
            smtp_password = normalize_gmail_app_password(smtp_password)
            if not smtp_password:
                raise ValidationError({"smtp_password": "App Password is required."})
            draft.set_smtp_password(smtp_password)
        draft.provider = EmailSenderProviderKind.GMAIL
        draft.smtp_host = ""
        draft.smtp_port = None
        draft.smtp_security = ""
        draft.smtp_username = cleaned["smtp_username"]
        draft.from_email = cleaned["from_email"]
        draft.from_name = cleaned["from_name"]
        draft.provider_settings = {}
    elif provider == EmailSenderProviderKind.MICROSOFT:
        if microsoft_email is None and from_email is not None:
            microsoft_email = from_email
        merged_address = draft.from_email if microsoft_email is None else microsoft_email
        merged_from_name = draft.from_name if from_name is None else from_name
        require_password = password_provided or not draft.password_configured
        cleaned = validate_microsoft_fields(
            microsoft_email=merged_address,
            password=(
                smtp_password
                if password_provided
                else ("x" if draft.password_configured else "")
            ),
            require_password=require_password,
        )
        cleaned["from_name"] = (merged_from_name or "").strip()
        if password_provided:
            smtp_password = (smtp_password or "").strip()
            if not smtp_password:
                raise ValidationError(
                    {"smtp_password": "Password / app password is required."}
                )
            draft.set_smtp_password(smtp_password)
        draft.provider = EmailSenderProviderKind.MICROSOFT
        draft.smtp_host = ""
        draft.smtp_port = None
        draft.smtp_security = ""
        draft.smtp_username = cleaned["smtp_username"]
        draft.from_email = cleaned["from_email"]
        draft.from_name = cleaned["from_name"]
        draft.provider_settings = {}
    elif provider == EmailSenderProviderKind.YAHOO:
        if yahoo_email is None and from_email is not None:
            yahoo_email = from_email
        merged_address = draft.from_email if yahoo_email is None else yahoo_email
        merged_from_name = draft.from_name if from_name is None else from_name
        require_password = password_provided or not draft.password_configured
        cleaned = validate_yahoo_fields(
            yahoo_email=merged_address,
            password=(
                smtp_password
                if password_provided
                else ("x" if draft.password_configured else "")
            ),
            require_password=require_password,
        )
        cleaned["from_name"] = (merged_from_name or "").strip()
        if password_provided:
            smtp_password = normalize_yahoo_app_password(smtp_password)
            if not smtp_password:
                raise ValidationError({"smtp_password": "App Password is required."})
            draft.set_smtp_password(smtp_password)
        draft.provider = EmailSenderProviderKind.YAHOO
        draft.smtp_host = ""
        draft.smtp_port = None
        draft.smtp_security = ""
        draft.smtp_username = cleaned["smtp_username"]
        draft.from_email = cleaned["from_email"]
        draft.from_name = cleaned["from_name"]
        draft.provider_settings = {}
    else:
        merged_host = draft.smtp_host if smtp_host is None else smtp_host
        merged_port = draft.smtp_port if smtp_port is None else smtp_port
        merged_security = draft.smtp_security if smtp_security is None else smtp_security
        merged_username = draft.smtp_username if smtp_username is None else smtp_username
        merged_from_email = draft.from_email if from_email is None else from_email
        merged_from_name = draft.from_name if from_name is None else from_name
        require_password = password_provided or not draft.password_configured
        cleaned = validate_smtp_fields(
            host=merged_host,
            port=merged_port,
            security=merged_security,
            username=merged_username,
            password=(
                smtp_password
                if password_provided
                else ("x" if draft.password_configured else "")
            ),
            from_email=merged_from_email,
            require_password=require_password,
        )
        cleaned["from_name"] = (merged_from_name or "").strip()
        if password_provided:
            draft.set_smtp_password(smtp_password)
        draft.provider = EmailSenderProviderKind.CUSTOM_SMTP
        draft.smtp_host = cleaned["smtp_host"]
        draft.smtp_port = cleaned["smtp_port"]
        draft.smtp_security = cleaned["smtp_security"]
        draft.smtp_username = cleaned["smtp_username"]
        draft.from_email = cleaned["from_email"]
        draft.from_name = cleaned["from_name"]
        draft.provider_settings = {}

    if not draft.password_configured:
        raise ValidationError(
            {
                "smtp_password": (
                    f"Enter the {_password_field_label(provider)} to send a test email."
                )
            }
        )

    fingerprint = _fingerprint_for_populated_sender(
        draft,
        password_provided=password_provided,
        smtp_password=smtp_password or "",
    )
    return draft, fingerprint


def send_group_email_sender_test(
    *,
    group,
    to_email,
    request=None,
    draft=None,
):
    """
    Send a test email.

    When ``draft`` is provided, test those credentials without replacing the
    saved sender. Success stores a short-lived session verification for confirm-save.
    When ``draft`` is omitted, re-test the persisted sender (may mark Ready/Error).
    """
    to_email = (to_email or "").strip().lower()
    if not to_email:
        raise ValidationError({"to_email": "Enter a test recipient email."})

    if draft is not None:
        draft_sender, fingerprint = build_draft_email_sender(group=group, **draft)
        provider = get_email_sender_provider(draft_sender.provider)
        try:
            provider.send_test(draft_sender, to_email=to_email)
        except EmailSenderProviderError as exc:
            # Do not mutate the active/persisted sender on a failed draft attempt.
            record_email_delivery(
                organization=group.organization,
                group=group,
                action_record=None,
                recipient=to_email,
                event_type="test",
                status=GroupEmailDeliveryStatus.FAILED,
                error_summary=exc.public_message,
                recipient_kind=GroupEmailRecipientKind.TEST,
            )
            raise ValidationError({"detail": exc.public_message}) from None

        store_draft_verification(
            request, group_id=group.pk, fingerprint=fingerprint
        )
        record_email_delivery(
            organization=group.organization,
            group=group,
            action_record=None,
            recipient=to_email,
            event_type="test",
            status=GroupEmailDeliveryStatus.SENT,
            error_summary="",
            recipient_kind=GroupEmailRecipientKind.TEST,
        )
        return get_group_email_sender(group)

    sender = get_group_email_sender(group)
    if sender is None or not sender.password_configured:
        raise ValidationError(
            {
                "detail": (
                    "Configure the email sender and send a test email before saving."
                )
            }
        )

    provider = get_email_sender_provider(sender.provider)
    try:
        provider.send_test(sender, to_email=to_email)
    except EmailSenderProviderError as exc:
        sender.mark_error(exc.public_message)
        sender.save(
            update_fields=[
                "status",
                "last_tested_at",
                "last_test_error",
                "updated_at",
            ]
        )
        record_email_delivery(
            organization=group.organization,
            group=group,
            action_record=None,
            recipient=to_email,
            event_type="test",
            status=GroupEmailDeliveryStatus.FAILED,
            error_summary=exc.public_message,
            recipient_kind=GroupEmailRecipientKind.TEST,
        )
        raise ValidationError({"detail": exc.public_message}) from None

    sender.mark_ready()
    sender.save(
        update_fields=[
            "status",
            "last_tested_at",
            "last_test_error",
            "updated_at",
        ]
    )
    record_email_delivery(
        organization=group.organization,
        group=group,
        action_record=None,
        recipient=to_email,
        event_type="test",
        status=GroupEmailDeliveryStatus.SENT,
        error_summary="",
        recipient_kind=GroupEmailRecipientKind.TEST,
    )
    return sender


def record_email_delivery(
    *,
    organization,
    group,
    action_record,
    recipient,
    event_type,
    status,
    error_summary="",
    recipient_kind=GroupEmailRecipientKind.PARTICIPANT,
):
    return GroupEmailDelivery.objects.create(
        organization=organization,
        group=group,
        action_record=action_record,
        recipient=(recipient or "").strip().lower(),
        recipient_kind=recipient_kind or GroupEmailRecipientKind.PARTICIPANT,
        event_type=event_type,
        status=status,
        error_summary=(error_summary or "")[:255],
    )


def participation_email_for_after_action(*, membership=None, group_only_participant=None):
    """Primary participation email (first of list). Prefer participation_emails_for_after_action."""
    emails = participation_emails_for_after_action(
        membership=membership,
        group_only_participant=group_only_participant,
    )
    return primary_participation_email(emails)


def participation_emails_for_after_action(*, membership=None, group_only_participant=None):
    """Canonical after-action participant recipients (no Member profile fallback)."""
    if membership is not None:
        return participation_emails_for_membership(membership)
    if group_only_participant is not None:
        return participation_emails_for_visitor(group_only_participant)
    return []


def _subject_for_kind(kind, group_name):
    labels = {
        "check_in": "Check-in",
        "check_out": "Check-out",
        "break": "Break",
    }
    label = labels.get(kind, "Attendance")
    return f"{group_name}: {label}"


def _template_for_kind(group, kind):
    if kind == "check_in":
        return group.check_in_email_template or "{name} checked in at {time}."
    if kind == "check_out":
        return group.check_out_email_template or "{name} checked out at {time}."
    if kind == "break":
        return group.break_email_template or "{name} started a break at {time}."
    return ""


def send_after_action_email(
    *,
    group,
    kind,
    action_record,
    participant_name,
    membership=None,
    group_only_participant=None,
    timezone_name=None,
):
    """
    Attempt after-action email to the participant and optional forward copies.

    Never raises to callers for SMTP failures. Each recipient is a separate
    delivery so forwarding addresses stay private from the participant.
    Forward-only sends are not allowed when the participant has no email.
    """
    recipient_emails = participation_emails_for_after_action(
        membership=membership,
        group_only_participant=group_only_participant,
    )
    recipient = primary_participation_email(recipient_emails)
    if not recipient_emails:
        logger.info(
            "Skipping after-action email: no participation email group_id=%s kind=%s",
            group.id,
            kind,
        )
        record_email_delivery(
            organization=group.organization,
            group=group,
            action_record=action_record,
            recipient="",
            event_type=kind,
            status=GroupEmailDeliveryStatus.FAILED,
            error_summary="No participation email on file",
            recipient_kind=GroupEmailRecipientKind.PARTICIPANT,
        )
        return False

    sender = get_group_email_sender(group)
    if sender is None or not sender.is_ready:
        logger.info(
            "Skipping after-action email: sender not ready group_id=%s",
            group.id,
        )
        record_email_delivery(
            organization=group.organization,
            group=group,
            action_record=action_record,
            recipient=recipient,
            event_type=kind,
            status=GroupEmailDeliveryStatus.FAILED,
            error_summary="Email sender is not ready",
            recipient_kind=GroupEmailRecipientKind.PARTICIPANT,
        )
        return False

    rendered = render_after_action_notification(
        group=group,
        action_record=action_record,
        participant_name=participant_name,
        kind=kind,
        customer_template=_template_for_kind(group, kind),
        brand_name=(sender.from_name or "").strip() or group.name,
        timezone_name=timezone_name,
    )
    body = rendered["text_body"]
    html_body = rendered["html_body"]
    subject = _subject_for_kind(kind, group.name)

    deliveries = unique_after_action_recipients(
        participant_emails=recipient_emails,
        forward_emails=getattr(group, "forward_emails", None) or [],
    )
    provider = get_email_sender_provider(sender.provider)
    participant_ok = False

    batch_messages = [
        {
            "to_email": to_email,
            "subject": subject,
            "text_body": body,
            "html_body": html_body,
        }
        for to_email, _recipient_kind in deliveries
    ]
    try:
        send_results = provider.send_messages_batch(sender, messages=batch_messages)
    except EmailSenderProviderError as exc:
        logger.error(
            "After-action email batch failed group_id=%s kind=%s: %s",
            group.id,
            kind,
            exc.public_message,
        )
        send_results = [
            {"to_email": to_email, "ok": False, "error": exc}
            for to_email, _recipient_kind in deliveries
        ]
    except Exception:
        logger.exception(
            "Unexpected after-action email batch failure group_id=%s kind=%s",
            group.id,
            kind,
        )
        send_results = [
            {"to_email": to_email, "ok": False, "error": None}
            for to_email, _recipient_kind in deliveries
        ]

    for (to_email, recipient_kind), result in zip(deliveries, send_results):
        if not result.get("ok"):
            exc = result.get("error")
            if isinstance(exc, EmailSenderProviderError):
                error_summary = exc.public_message
                logger.error(
                    "After-action email failed group_id=%s kind=%s recipient_kind=%s: %s",
                    group.id,
                    kind,
                    recipient_kind,
                    exc.public_message,
                )
            else:
                error_summary = "Could not send the email"
                logger.exception(
                    "Unexpected after-action email failure group_id=%s kind=%s recipient_kind=%s",
                    group.id,
                    kind,
                    recipient_kind,
                )
            record_email_delivery(
                organization=group.organization,
                group=group,
                action_record=action_record,
                recipient=to_email,
                event_type=kind,
                status=GroupEmailDeliveryStatus.FAILED,
                error_summary=error_summary,
                recipient_kind=recipient_kind,
            )
            continue

        record_email_delivery(
            organization=group.organization,
            group=group,
            action_record=action_record,
            recipient=to_email,
            event_type=kind,
            status=GroupEmailDeliveryStatus.SENT,
            error_summary="",
            recipient_kind=recipient_kind,
        )
        if recipient_kind == GroupEmailRecipientKind.PARTICIPANT:
            participant_ok = True

    return participant_ok
