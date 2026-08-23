from rest_framework import serializers

from attendance.attendance_report import REPORT_DATE_PRESETS, normalize_report_timezone_name
from attendance.models import ActionRecord, ActionSource, ActionType


class ActionRecordSerializer(serializers.ModelSerializer):
    action = serializers.CharField(source="action_type")
    source = serializers.CharField()

    person = serializers.SerializerMethodField()
    group_id = serializers.IntegerField(read_only=True)
    group_name = serializers.SerializerMethodField()
    class_name = serializers.SerializerMethodField()
    source_section_id = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = ActionRecord
        fields = (
            "id",
            "group_id",
            "group_name",
            "class_name",
            "source_section_id",
            "person",
            "action",
            "source",
            "performed_at",
        )

    def get_group_name(self, obj: ActionRecord):
        if obj.group_name_snapshot:
            return obj.group_name_snapshot
        if obj.group_id and obj.group is not None:
            return obj.group.name
        return ""

    def get_class_name(self, obj: ActionRecord):
        return (obj.class_name_snapshot or "").strip()

    def get_person(self, obj: ActionRecord):
        # Snapshot fields only: later edits must not rewrite history.
        return {
            "name": obj.participant_name_snapshot,
            "email": obj.participant_email_snapshot or "",
            "check_in_identifier": obj.participant_check_in_identifier_snapshot or "",
        }


class HistoryQuerySerializer(serializers.Serializer):
    group_id = serializers.IntegerField(required=False)
    action = serializers.ChoiceField(
        required=False,
        choices=[(v, v) for v in ActionType.values],
    )
    source = serializers.ChoiceField(
        required=False,
        choices=[(v, v) for v in ActionSource.values],
    )
    search = serializers.CharField(required=False, allow_blank=True)
    day = serializers.DateField(required=False)


class AttendanceReportQuerySerializer(serializers.Serializer):
    source_group_id = serializers.IntegerField(required=True, min_value=1)
    preset = serializers.ChoiceField(choices=[(v, v) for v in REPORT_DATE_PRESETS])
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    timezone = serializers.CharField(required=False, allow_blank=True, max_length=64)

    def validate_timezone(self, value):
        try:
            return normalize_report_timezone_name(value)
        except ValueError as exc:
            raise serializers.ValidationError("Invalid timezone.") from exc

    def validate(self, attrs):
        preset = attrs.get("preset")
        date_from = attrs.get("date_from")
        date_to = attrs.get("date_to")
        if preset == "custom":
            if date_from is None or date_to is None:
                raise serializers.ValidationError(
                    {"date_from": "Custom range requires date_from and date_to."}
                )
            if date_to < date_from:
                raise serializers.ValidationError(
                    {"date_to": "date_to must be on or after date_from."}
                )
        return attrs


class AttendanceReportExportQuerySerializer(AttendanceReportQuerySerializer):
    export_format = serializers.ChoiceField(
        choices=[("pdf", "pdf"), ("xlsx", "xlsx"), ("csv", "csv")],
    )


class KioskIdentifyRequestSerializer(serializers.Serializer):
    # Input-mode fields (validated based on kiosk settings).
    participant_code = serializers.CharField(required=False, allow_blank=True)
    name = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    pin = serializers.CharField(required=False, allow_blank=True)
    # Legacy alias — deprecated; maps to participant_code server-side.
    identifier = serializers.CharField(required=False, allow_blank=True)
    # Card-mode participant selection.
    participant_kind = serializers.ChoiceField(
        required=False,
        choices=[("member", "member"), ("group_only_participant", "group_only_participant")],
    )
    membership_id = serializers.IntegerField(required=False)
    group_only_participant_id = serializers.IntegerField(required=False)


class KioskPerformRequestSerializer(serializers.Serializer):
    participant_kind = serializers.ChoiceField(
        choices=[("member", "member"), ("group_only_participant", "group_only_participant")]
    )
    membership_id = serializers.IntegerField(required=False)
    group_only_participant_id = serializers.IntegerField(required=False)
    action = serializers.ChoiceField(
        choices=[(v, v) for v in ActionType.values],
    )
    pin = serializers.CharField(required=False, allow_blank=True)
