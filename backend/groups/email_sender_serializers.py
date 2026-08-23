"""Serializers for Group email sender configuration."""

from rest_framework import serializers

from groups.email_sender_models import EmailSenderProviderKind, SmtpSecurity


class GroupEmailSenderSerializer(serializers.Serializer):
    provider = serializers.ChoiceField(
        choices=EmailSenderProviderKind.choices,
        required=False,
    )
    smtp_host = serializers.CharField(required=False, allow_blank=True, max_length=255)
    smtp_port = serializers.IntegerField(
        required=False, allow_null=True, min_value=1, max_value=65535
    )
    smtp_security = serializers.ChoiceField(
        choices=SmtpSecurity.choices,
        required=False,
        allow_blank=True,
    )
    smtp_username = serializers.CharField(required=False, allow_blank=True, max_length=255)
    smtp_password = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
        max_length=255,
        style={"input_type": "password"},
    )
    change_password = serializers.BooleanField(required=False, default=False)
    gmail_address = serializers.EmailField(required=False, allow_blank=True)
    microsoft_email = serializers.EmailField(required=False, allow_blank=True)
    yahoo_email = serializers.EmailField(required=False, allow_blank=True)
    from_email = serializers.EmailField(required=False, allow_blank=True)
    from_name = serializers.CharField(required=False, allow_blank=True, max_length=150)


class GroupEmailSenderTestSerializer(serializers.Serializer):
    """
    Test recipient plus optional draft sender fields.

    When draft fields are present, credentials are tested without replacing the
    saved sender. When omitted, the persisted sender is re-tested.
    """

    to_email = serializers.EmailField()
    provider = serializers.ChoiceField(
        choices=EmailSenderProviderKind.choices,
        required=False,
    )
    smtp_host = serializers.CharField(required=False, allow_blank=True, max_length=255)
    smtp_port = serializers.IntegerField(
        required=False, allow_null=True, min_value=1, max_value=65535
    )
    smtp_security = serializers.ChoiceField(
        choices=SmtpSecurity.choices,
        required=False,
        allow_blank=True,
    )
    smtp_username = serializers.CharField(required=False, allow_blank=True, max_length=255)
    smtp_password = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
        max_length=255,
        style={"input_type": "password"},
    )
    change_password = serializers.BooleanField(required=False, default=False)
    gmail_address = serializers.EmailField(required=False, allow_blank=True)
    microsoft_email = serializers.EmailField(required=False, allow_blank=True)
    yahoo_email = serializers.EmailField(required=False, allow_blank=True)
    from_email = serializers.EmailField(required=False, allow_blank=True)
    from_name = serializers.CharField(required=False, allow_blank=True, max_length=150)

    def draft_payload(self):
        data = self.validated_data
        draft_keys = (
            "provider",
            "smtp_host",
            "smtp_port",
            "smtp_security",
            "smtp_username",
            "smtp_password",
            "change_password",
            "gmail_address",
            "microsoft_email",
            "yahoo_email",
            "from_email",
            "from_name",
        )
        draft = {key: data[key] for key in draft_keys if key in data}
        # A draft attempt is explicit when provider or any secret/config field is sent.
        if not draft:
            return None
        if "change_password" not in draft and "smtp_password" in draft:
            draft["change_password"] = True
        return draft
