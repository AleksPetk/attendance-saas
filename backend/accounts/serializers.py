from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from accounts.language import normalize_language


class VerifyEmailSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    locale = serializers.CharField(required=False, allow_blank=True, write_only=True)

    def validate(self, attrs):
        attrs["locale"] = normalize_language(attrs.get("locale"))
        return attrs


class ResetPasswordSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True)
    password_confirm = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs.get("password") != attrs.get("password_confirm"):
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    new_password_confirm = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs.get("new_password") != attrs.get("new_password_confirm"):
            raise serializers.ValidationError(
                {"new_password_confirm": "Passwords do not match."}
            )
        user = self.context.get("user")
        try:
            validate_password(password=attrs["new_password"], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": exc.messages})
        return attrs


class AccountSerializer(serializers.Serializer):
    email = serializers.EmailField()
    email_verified = serializers.BooleanField()
    email_verified_at = serializers.DateTimeField(allow_null=True)
    pending_primary_email = serializers.EmailField(allow_null=True, required=False)
    backup_email_status = serializers.ChoiceField(
        choices=["none", "pending", "verified"],
        required=False,
    )
    backup_email = serializers.EmailField(allow_null=True, required=False)
    pending_backup_email = serializers.EmailField(allow_null=True, required=False)
    two_factor_status = serializers.CharField()
    two_factor_label = serializers.CharField()
    sign_in_methods = serializers.DictField()
    preferred_language = serializers.ChoiceField(choices=["en", "ja"])


class PreferredLanguageUpdateSerializer(serializers.Serializer):
    preferred_language = serializers.ChoiceField(choices=["en", "ja"])


class EmailWithPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    current_password = serializers.CharField(write_only=True)


class PasswordOnlySerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)


class DeleteAccountSerializer(serializers.Serializer):
    current_password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, default=""
    )
    confirmation = serializers.CharField()
    code = serializers.CharField(required=False, allow_blank=True, default="")
    recovery_code = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_confirmation(self, value):
        if (value or "").strip() != "DELETE":
            raise serializers.ValidationError(
                'Type DELETE to confirm permanent account deletion.'
            )
        return "DELETE"
