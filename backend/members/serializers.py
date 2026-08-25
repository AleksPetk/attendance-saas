from rest_framework import serializers

from members.models import MEMBER_ADDRESS_MAX_LENGTH, Member, MemberStatus
from organizations.entitlements import LIMIT_MEMBERS
from organizations.entitlements.api import deny_plan_capacity, raise_plan_denied
from organizations.entitlements.exceptions import PlanEntitlementDenied
from organizations.entitlements.plan_locks import (
    is_member_plan_unlocked,
    require_no_unresolved_member_selection,
)


class MemberSerializer(serializers.ModelSerializer):
    clear_photo = serializers.BooleanField(write_only=True, required=False, default=False)
    has_photo = serializers.BooleanField(read_only=True)
    photo_url = serializers.SerializerMethodField()
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    plan_unlocked = serializers.BooleanField(read_only=True)
    is_plan_locked = serializers.SerializerMethodField()

    class Meta:
        model = Member
        fields = (
            "id",
            "name",
            "email",
            "photo",
            "photo_url",
            "has_photo",
            "clear_photo",
            "date_of_birth",
            "phone",
            "address",
            "notes",
            "status",
            "plan_unlocked",
            "is_plan_locked",
            "created_at",
            "updated_at",
            "archived_at",
        )
        read_only_fields = (
            "id",
            "status",
            "plan_unlocked",
            "created_at",
            "updated_at",
            "archived_at",
        )
        extra_kwargs = {
            "photo": {"write_only": True, "required": False},
            "address": {
                "required": False,
                "allow_blank": True,
                "max_length": MEMBER_ADDRESS_MAX_LENGTH,
            },
        }

    def get_photo_url(self, obj):
        if not obj.photo:
            return None
        request = self.context.get("request")
        url = obj.photo.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url

    def get_is_plan_locked(self, obj):
        return not is_member_plan_unlocked(obj)

    def to_internal_value(self, data):
        if hasattr(data, "copy"):
            data = data.copy()
            if data.get("date_of_birth") == "":
                data["date_of_birth"] = None
        elif isinstance(data, dict) and data.get("date_of_birth") == "":
            data = {**data, "date_of_birth": None}
        return super().to_internal_value(data)

    def validate_name(self, value):
        name = (value or "").strip()
        if not name:
            raise serializers.ValidationError("Name is required.")
        return name

    def validate_address(self, value):
        return (value or "").strip()

    def create(self, validated_data):
        validated_data.pop("clear_photo", None)
        organization = self.context["organization"]
        try:
            require_no_unresolved_member_selection(organization)
        except PlanEntitlementDenied as exc:
            raise_plan_denied(exc)
        deny_plan_capacity(organization, LIMIT_MEMBERS)
        return Member.objects.create_member(
            organization=organization,
            plan_unlocked=True,
            **validated_data,
        )

    def update(self, instance, validated_data):
        if instance.status == MemberStatus.ARCHIVED:
            raise serializers.ValidationError(
                {
                    "status": (
                        "Archived Members cannot be edited. Restore the Member first."
                    )
                }
            )
        clear_photo = validated_data.pop("clear_photo", False)

        for field, value in validated_data.items():
            setattr(instance, field, value)

        if clear_photo and not validated_data.get("photo"):
            instance.photo.delete(save=False)
            instance.photo = ""
        instance.save()
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data.pop("photo", None)
        data["is_plan_locked"] = not is_member_plan_unlocked(instance)
        return data


class MemberListQuerySerializer(serializers.Serializer):
    search = serializers.CharField(required=False, allow_blank=True)
    status = serializers.ChoiceField(
        required=False,
        choices=["active", "archived", "all"],
        default="active",
    )
