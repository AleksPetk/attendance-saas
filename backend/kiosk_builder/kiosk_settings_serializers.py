from rest_framework import serializers

from kiosk_builder.kiosk_settings_constants import (
    CONFIRMATION_MESSAGE_MAX_LENGTH,
    CONFIRMATION_RETURN_SECONDS_CHOICES,
    AttendanceResetMode,
    KioskConfirmationTemplate,
    KioskInputSecondField,
    KioskType,
)
from kiosk_builder.kiosk_settings_validation import (
    repair_kiosk_settings_for_group_capabilities,
    validate_exit_code,
)
from kiosk_builder.attendance_reset import validate_rolling_duration
from kiosk_builder.models import KioskSettings, ensure_group_kiosk_settings


class KioskSettingsSerializer(serializers.ModelSerializer):
    exit_code_configured = serializers.SerializerMethodField()
    readiness = serializers.SerializerMethodField()
    group_require_email = serializers.SerializerMethodField()
    group_require_pin = serializers.SerializerMethodField()
    exit_code = serializers.CharField(write_only=True, required=False, allow_blank=True)
    exit_code_confirm = serializers.CharField(write_only=True, required=False, allow_blank=True)
    group_actions = serializers.SerializerMethodField()
    confirmation_defaults = serializers.SerializerMethodField()

    class Meta:
        model = KioskSettings
        fields = (
            "mode",
            "card_show_name",
            "card_show_participant_code",
            "card_show_email",
            "use_pin",
            "input_field_count",
            "input_second_field",
            "confirmation_template",
            "confirmation_check_in_message",
            "confirmation_check_out_message",
            "confirmation_break_start_message",
            "confirmation_break_end_message",
            "confirmation_return_seconds",
            "attendance_reset_mode",
            "attendance_reset_daily_time",
            "attendance_reset_rolling_hours",
            "attendance_reset_rolling_minutes",
            "manual_reset_at",
            "exit_code_configured",
            "readiness",
            "group_require_email",
            "group_require_pin",
            "group_actions",
            "confirmation_defaults",
            "exit_code",
            "exit_code_confirm",
            "updated_at",
        )
        read_only_fields = (
            "exit_code_configured",
            "readiness",
            "group_require_email",
            "group_require_pin",
            "group_actions",
            "confirmation_defaults",
            "manual_reset_at",
            "updated_at",
        )

    def get_exit_code_configured(self, obj):
        return obj.has_exit_code

    def get_readiness(self, obj):
        from kiosk_builder.kiosk_settings_validation import kiosk_readiness_payload

        return kiosk_readiness_payload(obj)

    def get_group_require_email(self, obj):
        return bool(obj.group.require_email)

    def get_group_require_pin(self, obj):
        return bool(obj.group.require_pin)

    def get_group_actions(self, obj):
        group = obj.group
        return {
            "check_in_enabled": bool(group.check_in_enabled),
            "check_out_enabled": bool(group.check_out_enabled),
            "breaks_enabled": bool(group.breaks_enabled),
        }

    def get_confirmation_defaults(self, obj):
        from kiosk_builder.kiosk_settings_constants import DEFAULT_CONFIRMATION_MESSAGES

        return dict(DEFAULT_CONFIRMATION_MESSAGES)

    def validate_confirmation_template(self, value):
        if value not in KioskConfirmationTemplate.values:
            raise serializers.ValidationError("Select a valid confirmation template.")
        return value

    def validate_confirmation_return_seconds(self, value):
        if value not in CONFIRMATION_RETURN_SECONDS_CHOICES:
            raise serializers.ValidationError("Return delay must be 1, 3, or 5 seconds.")
        return value

    def validate_attendance_reset_mode(self, value):
        if value not in AttendanceResetMode.values:
            raise serializers.ValidationError("Select Daily or Rolling reset mode.")
        return value

    def validate_attendance_reset_rolling_minutes(self, value):
        minutes = int(value or 0)
        if minutes < 0 or minutes >= 60:
            raise serializers.ValidationError("Minutes must be between 0 and 59.")
        return minutes

    def _validate_message_field(self, value, field_name):
        text = str(value or "")
        if len(text) > CONFIRMATION_MESSAGE_MAX_LENGTH:
            raise serializers.ValidationError(
                f"Message must be at most {CONFIRMATION_MESSAGE_MAX_LENGTH} characters."
            )
        return text

    def validate_confirmation_check_in_message(self, value):
        return self._validate_message_field(value, "confirmation_check_in_message")

    def validate_confirmation_check_out_message(self, value):
        return self._validate_message_field(value, "confirmation_check_out_message")

    def validate_confirmation_break_start_message(self, value):
        return self._validate_message_field(value, "confirmation_break_start_message")

    def validate_confirmation_break_end_message(self, value):
        return self._validate_message_field(value, "confirmation_break_end_message")

    def validate(self, attrs):
        instance = self.instance
        group = instance.group if instance else self.context.get("group")
        merged = {}
        if instance:
            for field in (
                "mode",
                "card_show_name",
                "card_show_participant_code",
                "card_show_email",
                "use_pin",
                "input_field_count",
                "input_second_field",
                "confirmation_template",
                "confirmation_check_in_message",
                "confirmation_check_out_message",
                "confirmation_break_start_message",
                "confirmation_break_end_message",
                "confirmation_return_seconds",
                "attendance_reset_mode",
                "attendance_reset_daily_time",
                "attendance_reset_rolling_hours",
                "attendance_reset_rolling_minutes",
            ):
                merged[field] = getattr(instance, field)
        merged.update({k: v for k, v in attrs.items() if k not in ("exit_code", "exit_code_confirm")})

        if merged.get("attendance_reset_mode") == AttendanceResetMode.ROLLING:
            try:
                validate_rolling_duration(
                    hours=merged.get("attendance_reset_rolling_hours", 0),
                    minutes=merged.get("attendance_reset_rolling_minutes", 0),
                )
            except ValueError as exc:
                raise serializers.ValidationError(
                    {"attendance_reset_rolling_hours": str(exc)}
                ) from exc

        temp = KioskSettings(group=group, organization=group.organization, **merged)
        if instance:
            temp.exit_code_hash = instance.exit_code_hash
            temp.pk = instance.pk

        shape_issues = []
        if temp.mode == KioskType.INPUT and temp.input_field_count == 2:
            if temp.input_second_field not in KioskInputSecondField.values:
                shape_issues.append("Select a second identification field.")

        exit_code = (attrs.pop("exit_code", None) or "").strip()
        exit_confirm = (attrs.pop("exit_code_confirm", None) or "").strip()
        if exit_code or exit_confirm:
            if exit_code != exit_confirm:
                raise serializers.ValidationError(
                    {"exit_code_confirm": "Exit codes do not match."}
                )
            try:
                validate_exit_code(exit_code)
            except Exception as exc:
                raise serializers.ValidationError({"exit_code": str(exc)}) from exc
            self._pending_exit_code = exit_code

        if shape_issues:
            raise serializers.ValidationError({"non_field_errors": shape_issues})

        return attrs

    def update(self, instance, validated_data):
        pending_exit = getattr(self, "_pending_exit_code", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if pending_exit:
            instance.set_exit_code(pending_exit)
        instance.save()
        return instance


def kiosk_settings_response(settings, *, context=None):
    return KioskSettingsSerializer(settings, context=context or {}).data
