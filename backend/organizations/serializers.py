from rest_framework import serializers

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError

from organizations.models import Organization, OrganizationStatus
from organizations.models import WorkspaceStaffAccount
from organizations.models import WorkspaceStaffRole, WorkspaceStaffStatus

User = get_user_model()


class CurrentWorkspaceSerializer(serializers.Serializer):
    account_kind = serializers.CharField()
    role = serializers.CharField(allow_null=True)
    identity = serializers.CharField()
    is_platform_operator = serializers.BooleanField()
    workspace_id = serializers.CharField(allow_null=True)
    kiosk_locked = serializers.BooleanField(required=False, default=False)
    kiosk_group_id = serializers.IntegerField(required=False, allow_null=True, default=None)
    kiosk_available = serializers.BooleanField(required=False, default=False)


class RegisterOwnerSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    password_confirm = serializers.CharField(write_only=True)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        email = (attrs.get("email") or "").strip().lower()
        password = attrs.get("password")
        password_confirm = attrs.get("password_confirm")

        if password != password_confirm:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})

        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError({"email": "An account with this email already exists."})

        # Enforce configured Django password validators.
        user_for_validation = User(email=email)
        try:
            validate_password(password=password, user=user_for_validation)
        except DjangoValidationError as e:
            # Django returns a list of messages; DRF expects a readable payload.
            raise serializers.ValidationError({"password": e.messages})

        attrs["email"] = email
        return attrs


class OwnerLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class StaffLoginSerializer(serializers.Serializer):
    workspace_id = serializers.CharField()
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class ReauthSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)


class WorkspaceStaffAccountListSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    email = serializers.EmailField(allow_blank=True, required=False)
    role = serializers.CharField()
    status = serializers.CharField()


class WorkspaceStaffAccountCreateSerializer(serializers.Serializer):
    username = serializers.CharField()
    email = serializers.EmailField(required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=WorkspaceStaffRole.values)
    password = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        org = self.context.get("organization")
        if not org:
            raise serializers.ValidationError({"detail": "Missing organization context."})

        username = (attrs.get("username") or "").strip().lower()
        if not username:
            raise serializers.ValidationError({"username": "Username is required."})

        if WorkspaceStaffAccount.objects.filter(organization=org, username__iexact=username).exists():
            raise serializers.ValidationError({"username": "Username is already in use in this workspace."})

        # Password strength: use Django's password validators.
        user_for_validation = User(email=attrs.get("email") or org.owner.email)
        try:
            validate_password(password=attrs.get("password"), user=user_for_validation)
        except DjangoValidationError as e:
            raise serializers.ValidationError({"password": e.messages})

        attrs["username"] = username
        if "email" in attrs and attrs["email"]:
            attrs["email"] = (attrs["email"] or "").strip().lower()
        return attrs


class WorkspaceStaffAccountUpdateSerializer(serializers.Serializer):
    username = serializers.CharField(required=False, allow_blank=False)
    email = serializers.EmailField(required=False, allow_blank=True)
    role = serializers.ChoiceField(required=False, choices=WorkspaceStaffRole.values)
    status = serializers.ChoiceField(required=False, choices=WorkspaceStaffStatus.values)

    def validate(self, attrs):
        org = self.context.get("organization")
        if not org:
            raise serializers.ValidationError({"detail": "Missing organization context."})

        if "username" in attrs:
            username = (attrs.get("username") or "").strip().lower()
            if not username:
                raise serializers.ValidationError({"username": "Username cannot be blank."})
            qs = WorkspaceStaffAccount.objects.filter(organization=org, username__iexact=username)
            staff_id = self.context.get("staff_id")
            if staff_id:
                qs = qs.exclude(pk=staff_id)
            if qs.exists():
                raise serializers.ValidationError({"username": "Username is already in use in this workspace."})
            attrs["username"] = username

        if "email" in attrs and attrs["email"] is not None:
            attrs["email"] = (attrs.get("email") or "").strip().lower()

        return attrs
