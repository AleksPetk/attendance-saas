from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from members.models import Member, validate_member_pin


class MemberSerializer(serializers.ModelSerializer):
    pin = serializers.CharField(write_only=True, required=False, allow_blank=True)
    clear_pin = serializers.BooleanField(write_only=True, required=False, default=False)
    clear_photo = serializers.BooleanField(write_only=True, required=False, default=False)
    has_pin = serializers.BooleanField(read_only=True)
    has_photo = serializers.BooleanField(read_only=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Member
        fields = (
            "id",
            "internal_code",
            "name",
            "email",
            "photo",
            "photo_url",
            "has_photo",
            "clear_photo",
            "date_of_birth",
            "phone",
            "check_in_identifier",
            "notes",
            "pin",
            "clear_pin",
            "has_pin",
            "status",
            "created_at",
            "updated_at",
            "archived_at",
        )
        read_only_fields = (
            "id",
            "internal_code",
            "status",
            "created_at",
            "updated_at",
            "archived_at",
        )
        extra_kwargs = {
            "photo": {"write_only": True, "required": False},
        }

    def get_photo_url(self, obj):
        if not obj.photo:
            return None
        request = self.context.get("request")
        url = obj.photo.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url

    def validate_name(self, value):
        name = (value or "").strip()
        if not name:
            raise serializers.ValidationError("Name is required.")
        return name

    def validate_pin(self, value):
        if not value:
            return value
        try:
            return validate_member_pin(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

    def create(self, validated_data):
        pin = validated_data.pop("pin", "")
        validated_data.pop("clear_pin", None)
        validated_data.pop("clear_photo", None)
        organization = self.context["organization"]
        return Member.objects.create_member(
            organization=organization,
            pin=pin,
            **validated_data,
        )

    def update(self, instance, validated_data):
        pin = validated_data.pop("pin", None)
        clear_pin = validated_data.pop("clear_pin", False)
        clear_photo = validated_data.pop("clear_photo", False)

        for field, value in validated_data.items():
            setattr(instance, field, value)

        if clear_photo and not validated_data.get("photo"):
            instance.photo.delete(save=False)
            instance.photo = ""
        if pin:
            instance.set_pin(pin)
        elif clear_pin:
            instance.clear_pin()
        instance.save()
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data.pop("photo", None)
        data.pop("pin", None)
        data.pop("pin_hash", None)
        return data


class MemberListQuerySerializer(serializers.Serializer):
    search = serializers.CharField(required=False, allow_blank=True)
    status = serializers.ChoiceField(
        required=False,
        choices=["active", "archived", "all"],
        default="active",
    )
