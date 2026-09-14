"""
Workspace Saved Senders: reusable sender templates, never Group links.

Secrets stay encrypted with the existing APP_SECRETS_ENCRYPTION_KEY helpers.
Public payloads never include plaintext or ciphertext.
"""

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models.functions import Lower

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
    GroupEmailSender,
    SavedEmailSender,
)
from groups.models import Group


SAVED_SENDER_NAME_EXISTS = "saved_sender_name_exists"

SUPPORTED_PROVIDERS = {
    EmailSenderProviderKind.CUSTOM_SMTP,
    EmailSenderProviderKind.GMAIL,
    EmailSenderProviderKind.MICROSOFT,
    EmailSenderProviderKind.YAHOO,
}


class SavedSenderNameExists(Exception):
    def __init__(self, name):
        self.name = name
        super().__init__(name)


def saved_sender_public_payload(sender):
    """Non-secret template fields. Never include a password or ciphertext."""
    if sender.provider == EmailSenderProviderKind.GMAIL:
        mailbox = {
            "gmail_address": sender.from_email,
            "microsoft_email": "",
            "yahoo_email": "",
            "smtp_host": "",
            "smtp_port": None,
            "smtp_security": "",
            "smtp_username": sender.smtp_username,
        }
    elif sender.provider == EmailSenderProviderKind.MICROSOFT:
        mailbox = {
            "gmail_address": "",
            "microsoft_email": sender.from_email,
            "yahoo_email": "",
            "smtp_host": "",
            "smtp_port": None,
            "smtp_security": "",
            "smtp_username": sender.smtp_username,
        }
    elif sender.provider == EmailSenderProviderKind.YAHOO:
        mailbox = {
            "gmail_address": "",
            "microsoft_email": "",
            "yahoo_email": sender.from_email,
            "smtp_host": "",
            "smtp_port": None,
            "smtp_security": "",
            "smtp_username": sender.smtp_username,
        }
    else:
        mailbox = {
            "gmail_address": "",
            "microsoft_email": "",
            "yahoo_email": "",
            "smtp_host": sender.smtp_host,
            "smtp_port": sender.smtp_port,
            "smtp_security": sender.smtp_security,
            "smtp_username": sender.smtp_username,
        }
    return {
        "id": sender.pk,
        "name": sender.name,
        "provider": sender.provider,
        "from_email": sender.from_email,
        "from_name": sender.from_name,
        "password_configured": sender.password_configured,
        "updated_at": sender.updated_at,
        **mailbox,
    }


def list_saved_email_senders(organization):
    return (
        SavedEmailSender.objects.filter(organization=organization)
        .order_by(Lower("name"), "id")
    )


def get_workspace_saved_sender(organization, saved_sender_id):
    if not saved_sender_id:
        return None
    return SavedEmailSender.objects.filter(
        organization=organization,
        pk=saved_sender_id,
    ).first()


def copied_saved_sender_secret(*, organization, saved_sender_id, provider):
    """
    Return the template ciphertext to copy onto a Group draft/sender.

    Missing or cross-workspace ids are the same not-found error.
    """
    template = get_workspace_saved_sender(organization, saved_sender_id)
    if template is None:
        raise ValidationError({"saved_sender_id": "Saved sender was not found."})
    if template.provider != provider:
        raise ValidationError(
            {"saved_sender_id": "Saved sender provider does not match this draft."}
        )
    if not template.smtp_password_encrypted:
        raise ValidationError(
            {"smtp_password": "This saved sender has no credential configured."}
        )
    return template.smtp_password_encrypted


def delete_saved_email_sender(*, organization, saved_sender_id):
    template = get_workspace_saved_sender(organization, saved_sender_id)
    if template is None:
        return False
    template.delete()
    return True


def create_saved_email_sender(
    *,
    organization,
    name,
    replace=False,
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
    saved_sender_id=None,
    source_group_id=None,
):
    """
    Save a sender template from the current form fields.

    Credential source, in order:
    1. A replacement password supplied by the caller.
    2. Encrypted credential copied from another Saved Sender in this workspace.
    3. Encrypted credential copied from this workspace's Group sender.

    The template stores its own ciphertext. It does not reference a Group.
    """
    cleaned_name = (name or "").strip()
    if not cleaned_name:
        raise ValidationError({"name": "Enter a name for this saved sender."})
    if len(cleaned_name) > 80:
        raise ValidationError({"name": "Name must be 80 characters or fewer."})

    if provider not in SUPPORTED_PROVIDERS:
        raise ValidationError({"provider": "This email provider is not available."})

    password_provided = bool(smtp_password)
    if password_provided:
        plaintext = _normalized_plaintext_password(provider, smtp_password)
        fields = _validated_sender_fields(
            provider=provider,
            smtp_host=smtp_host,
            smtp_port=smtp_port,
            smtp_security=smtp_security,
            smtp_username=smtp_username,
            from_email=from_email,
            from_name=from_name,
            gmail_address=gmail_address,
            microsoft_email=microsoft_email,
            yahoo_email=yahoo_email,
            password=plaintext,
            require_password=True,
        )
        encrypted = None
        plaintext_to_store = plaintext
    else:
        encrypted = _copied_ciphertext(
            organization=organization,
            provider=provider,
            saved_sender_id=saved_sender_id,
            source_group_id=source_group_id,
        )
        fields = _validated_sender_fields(
            provider=provider,
            smtp_host=smtp_host,
            smtp_port=smtp_port,
            smtp_security=smtp_security,
            smtp_username=smtp_username,
            from_email=from_email,
            from_name=from_name,
            gmail_address=gmail_address,
            microsoft_email=microsoft_email,
            yahoo_email=yahoo_email,
            password="x",
            require_password=True,
        )
        plaintext_to_store = None

    existing = (
        SavedEmailSender.objects.filter(organization=organization, name__iexact=cleaned_name)
        .first()
    )
    if existing is not None and not replace:
        raise SavedSenderNameExists(existing.name)

    try:
        with transaction.atomic():
            sender = existing or SavedEmailSender(organization=organization)
            sender.name = cleaned_name
            _assign_fields(sender, provider=provider, fields=fields)
            if plaintext_to_store is not None:
                sender.set_smtp_password(plaintext_to_store)
            else:
                sender.copy_encrypted_password(encrypted)
            sender.save()
    except IntegrityError as exc:
        raise SavedSenderNameExists(cleaned_name) from exc
    return sender


def _copied_ciphertext(*, organization, provider, saved_sender_id, source_group_id):
    if saved_sender_id:
        return copied_saved_sender_secret(
            organization=organization,
            saved_sender_id=saved_sender_id,
            provider=provider,
        )
    if source_group_id:
        group = Group.objects.filter(
            organization=organization,
            pk=source_group_id,
        ).first()
        if group is None:
            raise ValidationError({"source_group_id": "Group was not found."})
        sender = GroupEmailSender.objects.filter(
            group=group,
            organization=organization,
        ).first()
        if (
            sender is None
            or sender.provider != provider
            or not sender.password_configured
        ):
            raise ValidationError(
                {
                    "smtp_password": (
                        "Enter a password, or save a Group sender with a configured "
                        "credential first."
                    )
                }
            )
        return sender.smtp_password_encrypted
    raise ValidationError(
        {"smtp_password": "Enter a password to save this sender configuration."}
    )


def _normalized_plaintext_password(provider, smtp_password):
    if provider == EmailSenderProviderKind.GMAIL:
        smtp_password = normalize_gmail_app_password(smtp_password)
        if not smtp_password:
            raise ValidationError({"smtp_password": "App Password is required."})
        return smtp_password
    if provider == EmailSenderProviderKind.YAHOO:
        smtp_password = normalize_yahoo_app_password(smtp_password)
        if not smtp_password:
            raise ValidationError({"smtp_password": "App Password is required."})
        return smtp_password
    smtp_password = (smtp_password or "").strip()
    if not smtp_password:
        raise ValidationError({"smtp_password": "Password is required."})
    return smtp_password


def _validated_sender_fields(
    *,
    provider,
    smtp_host,
    smtp_port,
    smtp_security,
    smtp_username,
    from_email,
    from_name,
    gmail_address,
    microsoft_email,
    yahoo_email,
    password,
    require_password,
):
    if provider == EmailSenderProviderKind.GMAIL:
        address = gmail_address if gmail_address is not None else from_email
        cleaned = validate_gmail_fields(
            gmail_address=address,
            password=password,
            require_password=require_password,
        )
    elif provider == EmailSenderProviderKind.MICROSOFT:
        address = microsoft_email if microsoft_email is not None else from_email
        cleaned = validate_microsoft_fields(
            microsoft_email=address,
            password=password,
            require_password=require_password,
        )
    elif provider == EmailSenderProviderKind.YAHOO:
        address = yahoo_email if yahoo_email is not None else from_email
        cleaned = validate_yahoo_fields(
            yahoo_email=address,
            password=password,
            require_password=require_password,
        )
    else:
        cleaned = validate_smtp_fields(
            host=smtp_host,
            port=smtp_port,
            security=smtp_security,
            username=smtp_username,
            password=password,
            from_email=from_email,
            require_password=require_password,
        )
    cleaned["from_name"] = (from_name or "").strip()
    return cleaned


def _assign_fields(sender, *, provider, fields):
    sender.provider = provider
    sender.from_email = fields["from_email"]
    sender.from_name = fields["from_name"]
    sender.provider_settings = {}
    if provider == EmailSenderProviderKind.CUSTOM_SMTP:
        sender.smtp_host = fields["smtp_host"]
        sender.smtp_port = fields["smtp_port"]
        sender.smtp_security = fields["smtp_security"]
        sender.smtp_username = fields["smtp_username"]
        return
    sender.smtp_host = ""
    sender.smtp_port = None
    sender.smtp_security = ""
    sender.smtp_username = fields["smtp_username"]
