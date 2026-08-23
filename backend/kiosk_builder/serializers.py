from rest_framework import serializers

from core.media_urls import absolute_file_url
from kiosk_builder.config_schema import validate_config
from kiosk_builder.models import KioskDesign


class KioskDesignSerializer(serializers.ModelSerializer):
    header_logo_url = serializers.SerializerMethodField()
    footer_logo_url = serializers.SerializerMethodField()
    main_background_image_url = serializers.SerializerMethodField()
    remove_header_logo = serializers.BooleanField(write_only=True, required=False, default=False)
    remove_footer_logo = serializers.BooleanField(write_only=True, required=False, default=False)
    remove_main_background_image = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = KioskDesign
        fields = (
            "id",
            "config",
            "header_logo",
            "header_logo_url",
            "footer_logo",
            "footer_logo_url",
            "main_background_image",
            "main_background_image_url",
            "remove_header_logo",
            "remove_footer_logo",
            "remove_main_background_image",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        extra_kwargs = {
            "header_logo": {"write_only": True, "required": False},
            "footer_logo": {"write_only": True, "required": False},
            "main_background_image": {"write_only": True, "required": False},
        }

    def get_header_logo_url(self, obj):
        return absolute_file_url(self.context.get("request"), obj.header_logo)

    def get_footer_logo_url(self, obj):
        return absolute_file_url(self.context.get("request"), obj.footer_logo)

    def get_main_background_image_url(self, obj):
        return absolute_file_url(self.context.get("request"), obj.main_background_image)

    def validate_config(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Config must be a JSON object.")
        normalized, errors = validate_config(value)
        if errors:
            raise serializers.ValidationError(errors)
        return normalized

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data.pop("header_logo", None)
        data.pop("footer_logo", None)
        data.pop("main_background_image", None)
        return data
