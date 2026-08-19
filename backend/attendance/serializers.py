from rest_framework import serializers

from attendance.models import ActionRecord, ActionSource, ActionType


class ActionRecordSerializer(serializers.ModelSerializer):
    action = serializers.CharField(source="action_type")
    source = serializers.CharField()

    person = serializers.SerializerMethodField()
    group_id = serializers.IntegerField(read_only=True)
    group_name = serializers.CharField(source="group.name", read_only=True)

    class Meta:
        model = ActionRecord
        fields = (
            "id",
            "group_id",
            "group_name",
            "person",
            "action",
            "source",
            "performed_at",
        )

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


class KioskIdentifyRequestSerializer(serializers.Serializer):
    # All fields are optional here; we validate required ones based on the Group's kiosk config.
    name = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    identifier = serializers.CharField(required=False, allow_blank=True)
    pin = serializers.CharField(required=False, allow_blank=True)
    # For ambiguity errors, we still never return secrets (no pin).


class KioskPerformRequestSerializer(serializers.Serializer):
    participant_kind = serializers.ChoiceField(choices=[("member", "member"), ("group_only_participant", "group_only_participant")])
    membership_id = serializers.IntegerField(required=False)
    group_only_participant_id = serializers.IntegerField(required=False)
    action = serializers.ChoiceField(
        choices=[(v, v) for v in ActionType.values],
    )
    pin = serializers.CharField(required=False, allow_blank=True)

