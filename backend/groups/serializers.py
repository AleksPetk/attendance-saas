from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import serializers

from groups.models import (
    EmailSenderMode,
    Group,
    GroupMembership,
    GroupMembershipStatus,
    GroupOnlyParticipant,
    KioskIdentifierField,
    KioskMode,
    KioskTheme,
)
from groups.requirements import (
    MissingRequiredFields,
    RequirementConflict,
    find_requirement_conflicts,
    member_profile_values,
    membership_effective_values,
    missing_required_fields,
    participant_values,
)
from groups.templates import validate_notification_template
from members.models import Member, MemberStatus, validate_member_pin


def absolute_file_url(request, field_file):
    if not field_file:
        return None
    url = field_file.url
    if request is not None:
        return request.build_absolute_uri(url)
    return url


class RequirementLevelField(serializers.ChoiceField):
    def __init__(self, **kwargs):
        kwargs.setdefault("choices", ["required", "optional"])
        super().__init__(**kwargs)


class GroupActionsSerializer(serializers.Serializer):
    check_in_enabled = serializers.BooleanField(required=False)
    check_out_enabled = serializers.BooleanField(required=False)
    breaks_enabled = serializers.BooleanField(required=False)
    max_breaks = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1,
    )


class GroupRequirementsSerializer(serializers.Serializer):
    name = RequirementLevelField(required=False)
    email = RequirementLevelField(required=False)
    photo = RequirementLevelField(required=False)
    check_in_identifier = RequirementLevelField(required=False)
    pin = RequirementLevelField(required=False)

    def validate_name(self, value):
        if value == "optional":
            raise serializers.ValidationError("Name is always required.")
        return "required"


class NotificationSettingSerializer(serializers.Serializer):
    send_email = serializers.BooleanField(required=False)
    email_template = serializers.CharField(
        required=False,
        allow_blank=True,
    )

    def validate_email_template(self, value):
        try:
            return validate_notification_template(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc


class GroupNotificationsSerializer(serializers.Serializer):
    check_in = NotificationSettingSerializer(required=False)
    check_out = NotificationSettingSerializer(required=False)
    after_break = NotificationSettingSerializer(required=False)

    def to_internal_value(self, data):
        incoming = data.copy() if hasattr(data, "copy") else dict(data)
        if "break" in incoming and "after_break" not in incoming:
            incoming["after_break"] = incoming.get("break")
        return super().to_internal_value(incoming)


class GroupAdvancedSerializer(serializers.Serializer):
    automatic_check_in_enabled = serializers.BooleanField(required=False)
    automatic_check_in_time = serializers.TimeField(required=False, allow_null=True)
    email_sender_mode = serializers.ChoiceField(
        choices=EmailSenderMode.choices,
        required=False,
    )


class GroupKioskSerializer(serializers.Serializer):
    kiosk_enabled = serializers.BooleanField(required=False)
    kiosk_mode = serializers.ChoiceField(choices=KioskMode.choices, required=False)
    kiosk_theme = serializers.ChoiceField(choices=KioskTheme.choices, required=False)
    kiosk_title = serializers.CharField(required=False, allow_blank=True, max_length=150)
    kiosk_welcome_text = serializers.CharField(required=False, allow_blank=True)
    kiosk_success_message = serializers.CharField(required=False, allow_blank=True)
    kiosk_confirmation_message = serializers.CharField(required=False, allow_blank=True)
    kiosk_return_delay_seconds = serializers.IntegerField(required=False, min_value=1, max_value=3600)

    kiosk_list_show_name = serializers.BooleanField(required=False)
    kiosk_list_show_photo = serializers.BooleanField(required=False)
    kiosk_list_show_identifier = serializers.BooleanField(required=False)
    kiosk_list_show_email = serializers.BooleanField(required=False)

    kiosk_input_field_1 = serializers.ChoiceField(
        choices=KioskIdentifierField.choices, required=False
    )
    kiosk_input_field_2 = serializers.ChoiceField(
        choices=[c for c in KioskIdentifierField.choices] + [("", "")], required=False
    )


class GroupSerializer(serializers.ModelSerializer):
    actions = GroupActionsSerializer(required=False, write_only=True)
    requirements = GroupRequirementsSerializer(required=False, write_only=True)
    notifications = GroupNotificationsSerializer(required=False, write_only=True)
    advanced = GroupAdvancedSerializer(required=False, write_only=True)
    kiosk = GroupKioskSerializer(required=False, write_only=True)
    member_count = serializers.IntegerField(read_only=True)
    group_only_participant_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Group
        fields = (
            "id",
            "name",
            "status",
            "actions",
            "requirements",
            "notifications",
            "advanced",
            "kiosk",
            "member_count",
            "group_only_participant_count",
            "created_at",
            "updated_at",
            "archived_at",
        )
        read_only_fields = (
            "id",
            "status",
            "created_at",
            "updated_at",
            "archived_at",
        )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["actions"] = {
            "check_in_enabled": instance.check_in_enabled,
            "check_out_enabled": instance.check_out_enabled,
            "breaks_enabled": instance.breaks_enabled,
            "max_breaks": instance.max_breaks,
        }
        data["requirements"] = {
            "name": "required",
            "email": "required" if instance.require_email else "optional",
            "photo": "required" if instance.require_photo else "optional",
            "check_in_identifier": (
                "required" if instance.require_check_in_identifier else "optional"
            ),
            "pin": "required" if instance.require_pin else "optional",
        }
        data["notifications"] = {
            "check_in": {
                "send_email": instance.send_email_after_check_in,
                "email_template": instance.check_in_email_template,
            },
            "check_out": {
                "send_email": instance.send_email_after_check_out,
                "email_template": instance.check_out_email_template,
            },
            "break": {
                "send_email": instance.send_email_after_break,
                "email_template": instance.break_email_template,
            },
        }
        time_value = instance.automatic_check_in_time
        data["advanced"] = {
            "automatic_check_in_enabled": instance.automatic_check_in_enabled,
            "automatic_check_in_time": (
                time_value.strftime("%H:%M") if time_value else None
            ),
            "email_sender_mode": instance.email_sender_mode,
        }

        data["kiosk"] = {
            "kiosk_enabled": instance.kiosk_enabled,
            "kiosk_mode": instance.kiosk_mode,
            "kiosk_theme": instance.kiosk_theme,
            "kiosk_title": instance.kiosk_title,
            "kiosk_welcome_text": instance.kiosk_welcome_text,
            "kiosk_success_message": instance.kiosk_success_message,
            "kiosk_confirmation_message": instance.kiosk_confirmation_message,
            "kiosk_return_delay_seconds": instance.kiosk_return_delay_seconds,
            "kiosk_list_show_name": instance.kiosk_list_show_name,
            "kiosk_list_show_photo": instance.kiosk_list_show_photo,
            "kiosk_list_show_identifier": instance.kiosk_list_show_identifier,
            "kiosk_list_show_email": instance.kiosk_list_show_email,
            "kiosk_input_field_1": instance.kiosk_input_field_1,
            "kiosk_input_field_2": instance.kiosk_input_field_2,
        }
        member_count = getattr(instance, "member_count", None)
        participant_count = getattr(instance, "group_only_participant_count", None)
        if member_count is None:
            member_count = instance.memberships.filter(
                status=GroupMembershipStatus.ACTIVE
            ).count()
        if participant_count is None:
            participant_count = instance.group_only_participants.filter(
                status="active"
            ).count()
        data["member_count"] = member_count
        data["group_only_participant_count"] = participant_count
        return data

    def create(self, validated_data):
        mapped = self._mapped_fields(validated_data)
        organization = self.context["organization"]
        try:
            with transaction.atomic():
                return Group.objects.create_group(
                    organization=organization,
                    **mapped,
                )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                getattr(exc, "message_dict", exc.messages)
            ) from exc
        except IntegrityError as exc:
            raise serializers.ValidationError(
                {"name": "A Group with this name already exists in this workspace."}
            ) from exc

    def update(self, instance, validated_data):
        mapped = self._mapped_fields(validated_data, instance=instance)
        for field, value in mapped.items():
            setattr(instance, field, value)
        conflicts = find_requirement_conflicts(instance)
        if conflicts:
            raise RequirementConflict(conflicts)
        try:
            with transaction.atomic():
                instance.save()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                getattr(exc, "message_dict", exc.messages)
            ) from exc
        except IntegrityError as exc:
            raise serializers.ValidationError(
                {"name": "A Group with this name already exists in this workspace."}
            ) from exc
        return instance

    def _mapped_fields(self, validated_data, instance=None):
        mapped = {}
        if "name" in validated_data:
            mapped["name"] = validated_data["name"]

        actions = validated_data.get("actions") or {}
        action_map = {
            "check_in_enabled": "check_in_enabled",
            "check_out_enabled": "check_out_enabled",
            "breaks_enabled": "breaks_enabled",
            "max_breaks": "max_breaks",
        }
        for source, dest in action_map.items():
            if source in actions:
                mapped[dest] = actions[source]

        requirements = validated_data.get("requirements") or {}
        requirement_map = {
            "email": "require_email",
            "photo": "require_photo",
            "check_in_identifier": "require_check_in_identifier",
            "pin": "require_pin",
        }
        for source, dest in requirement_map.items():
            if source in requirements:
                mapped[dest] = requirements[source] == "required"

        notifications = validated_data.get("notifications") or {}
        notification_map = {
            "check_in": ("send_email_after_check_in", "check_in_email_template"),
            "check_out": ("send_email_after_check_out", "check_out_email_template"),
            "after_break": ("send_email_after_break", "break_email_template"),
        }
        for key, (flag_field, template_field) in notification_map.items():
            setting = notifications.get(key) or {}
            if "send_email" in setting:
                mapped[flag_field] = setting["send_email"]
            if "email_template" in setting:
                mapped[template_field] = setting["email_template"]

        advanced = validated_data.get("advanced") or {}
        if "automatic_check_in_enabled" in advanced:
            mapped["automatic_check_in_enabled"] = advanced["automatic_check_in_enabled"]
        if "automatic_check_in_time" in advanced:
            mapped["automatic_check_in_time"] = advanced["automatic_check_in_time"]
        if "email_sender_mode" in advanced:
            mapped["email_sender_mode"] = advanced["email_sender_mode"]

        kiosk = validated_data.get("kiosk") or {}
        kiosk_map = {
            "kiosk_enabled": "kiosk_enabled",
            "kiosk_mode": "kiosk_mode",
            "kiosk_theme": "kiosk_theme",
            "kiosk_title": "kiosk_title",
            "kiosk_welcome_text": "kiosk_welcome_text",
            "kiosk_success_message": "kiosk_success_message",
            "kiosk_confirmation_message": "kiosk_confirmation_message",
            "kiosk_return_delay_seconds": "kiosk_return_delay_seconds",
            "kiosk_list_show_name": "kiosk_list_show_name",
            "kiosk_list_show_photo": "kiosk_list_show_photo",
            "kiosk_list_show_identifier": "kiosk_list_show_identifier",
            "kiosk_list_show_email": "kiosk_list_show_email",
            "kiosk_input_field_1": "kiosk_input_field_1",
            "kiosk_input_field_2": "kiosk_input_field_2",
        }
        for src, dest in kiosk_map.items():
            if src in kiosk:
                mapped[dest] = kiosk[src]

        if instance is None:
            return mapped
        return mapped


class GroupListQuerySerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        required=False,
        choices=["active", "archived", "all"],
        default="active",
    )


class GroupMembershipSerializer(serializers.ModelSerializer):
    member_id = serializers.IntegerField(write_only=True, required=False)
    override_pin = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )
    clear_override_pin = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
    )
    clear_override_photo = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
    )
    member = serializers.SerializerMethodField()
    overrides = serializers.SerializerMethodField()
    effective = serializers.SerializerMethodField()

    class Meta:
        model = GroupMembership
        fields = (
            "id",
            "member_id",
            "member",
            "override_name",
            "override_email",
            "override_photo",
            "override_check_in_identifier",
            "override_pin",
            "clear_override_pin",
            "clear_override_photo",
            "overrides",
            "effective",
            "status",
            "created_at",
            "updated_at",
            "deactivated_at",
        )
        read_only_fields = (
            "id",
            "status",
            "created_at",
            "updated_at",
            "deactivated_at",
        )
        extra_kwargs = {
            "override_photo": {"write_only": True, "required": False},
            "override_name": {"required": False, "allow_blank": True},
            "override_email": {"required": False, "allow_blank": True},
            "override_check_in_identifier": {"required": False, "allow_blank": True},
        }

    def validate_override_pin(self, value):
        if not value:
            return value
        try:
            return validate_member_pin(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

    def get_member(self, obj):
        member = obj.member
        request = self.context.get("request")
        return {
            "id": member.id,
            "name": member.name,
            "internal_code": member.internal_code,
            "email": member.email,
            "check_in_identifier": member.check_in_identifier,
            "has_photo": member.has_photo,
            "has_pin": member.has_pin,
            "photo_url": absolute_file_url(request, member.photo),
            "status": member.status,
        }

    def get_overrides(self, obj):
        request = self.context.get("request")
        return {
            "name": obj.override_name,
            "email": obj.override_email,
            "check_in_identifier": obj.override_check_in_identifier,
            "has_photo": obj.has_override_photo,
            "photo_url": absolute_file_url(request, obj.override_photo),
            "has_pin": obj.has_override_pin,
        }

    def get_effective(self, obj):
        request = self.context.get("request")
        photo_url = absolute_file_url(request, obj.override_photo) or absolute_file_url(
            request, obj.member.photo
        )
        return {
            "name": obj.effective_name,
            "email": obj.effective_email,
            "check_in_identifier": obj.effective_check_in_identifier,
            "has_photo": obj.has_effective_photo,
            "photo_url": photo_url,
            "has_pin": obj.has_effective_pin,
        }

    def create(self, validated_data):
        group = self.context["group"]
        organization = self.context["organization"]
        member = self._resolve_member(validated_data.pop("member_id", None))
        pin = validated_data.pop("override_pin", "")
        validated_data.pop("clear_override_pin", None)
        validated_data.pop("clear_override_photo", None)

        existing = GroupMembership.objects.filter(group=group, member=member).first()
        if existing and existing.status == GroupMembershipStatus.ACTIVE:
            raise serializers.ValidationError(
                {"member_id": "This Member is already in this Group."}
            )

        membership = existing or GroupMembership(group=group, member=member)
        membership.organization = organization
        membership.status = GroupMembershipStatus.ACTIVE
        self._apply_overrides(membership, validated_data, pin=pin)
        self._validate_against_group(group, membership, pin_provided=bool(pin))
        membership.save()
        return membership

    def update(self, instance, validated_data):
        validated_data.pop("member_id", None)
        pin = validated_data.pop("override_pin", None)
        clear_pin = validated_data.pop("clear_override_pin", False)
        clear_photo = validated_data.pop("clear_override_photo", False)
        if clear_photo and not validated_data.get("override_photo"):
            instance.override_photo.delete(save=False)
            instance.override_photo = ""
        self._apply_overrides(instance, validated_data, pin=pin, clear_pin=clear_pin)
        self._validate_against_group(
            instance.group,
            instance,
            pin_provided=bool(pin),
        )
        instance.save()
        return instance

    def _resolve_member(self, member_id):
        organization = self.context["organization"]
        if not member_id:
            raise serializers.ValidationError({"member_id": "Member is required."})
        member = Member.objects.filter(
            pk=member_id,
            organization=organization,
        ).first()
        if member is None:
            raise serializers.ValidationError(
                {"member_id": "Member not found in this workspace."}
            )
        if member.status != MemberStatus.ACTIVE:
            raise serializers.ValidationError(
                {"member_id": "Archived Members cannot be added to Groups."}
            )
        return member

    def _apply_overrides(self, membership, validated_data, *, pin=None, clear_pin=False):
        for field in (
            "override_name",
            "override_email",
            "override_photo",
            "override_check_in_identifier",
        ):
            if field in validated_data:
                setattr(membership, field, validated_data[field])
        if pin:
            membership.set_override_pin(pin)
        elif clear_pin:
            membership.clear_override_pin()

    def _validate_against_group(self, group, membership, *, pin_provided):
        pending = {
            "override_name": membership.override_name,
            "override_email": membership.override_email,
            "override_check_in_identifier": membership.override_check_in_identifier,
            "has_override_photo": membership.has_override_photo,
            "has_override_pin": membership.has_override_pin or pin_provided,
        }
        missing = missing_required_fields(
            group,
            membership_effective_values(membership, pending=pending),
        )
        if missing:
            raise MissingRequiredFields(missing)


class GroupOnlyParticipantSerializer(serializers.ModelSerializer):
    pin = serializers.CharField(write_only=True, required=False, allow_blank=True)
    clear_pin = serializers.BooleanField(write_only=True, required=False, default=False)
    clear_photo = serializers.BooleanField(write_only=True, required=False, default=False)
    has_pin = serializers.BooleanField(read_only=True)
    has_photo = serializers.BooleanField(read_only=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = GroupOnlyParticipant
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
            "status",
            "created_at",
            "updated_at",
            "archived_at",
        )
        extra_kwargs = {
            "photo": {"write_only": True, "required": False},
        }

    def validate_pin(self, value):
        if not value:
            return value
        try:
            return validate_member_pin(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

    def get_photo_url(self, obj):
        return absolute_file_url(self.context.get("request"), obj.photo)

    def create(self, validated_data):
        group = self.context["group"]
        pin = validated_data.pop("pin", "")
        validated_data.pop("clear_pin", None)
        validated_data.pop("clear_photo", None)
        participant = GroupOnlyParticipant(group=group, organization=group.organization)
        for field, value in validated_data.items():
            setattr(participant, field, value)
        if pin:
            participant.set_pin(pin)
        self._validate_against_group(group, participant, pin_provided=bool(pin))
        participant.save()
        return participant

    def update(self, instance, validated_data):
        pin = validated_data.pop("pin", None)
        clear_pin = validated_data.pop("clear_pin", False)
        clear_photo = validated_data.pop("clear_photo", False)
        if clear_photo and not validated_data.get("photo"):
            instance.photo.delete(save=False)
            instance.photo = ""
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if pin:
            instance.set_pin(pin)
        elif clear_pin:
            instance.clear_pin()
        self._validate_against_group(
            instance.group,
            instance,
            pin_provided=bool(pin),
        )
        instance.save()
        return instance

    def _validate_against_group(self, group, participant, *, pin_provided):
        pending = {
            "name": participant.name,
            "email": participant.email,
            "check_in_identifier": participant.check_in_identifier,
            "has_photo": participant.has_photo,
            "has_pin": participant.has_pin or pin_provided,
        }
        missing = missing_required_fields(
            group,
            participant_values(participant, pending=pending),
        )
        if missing:
            raise MissingRequiredFields(missing)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data.pop("photo", None)
        return data


class AvailableMemberSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    internal_code = serializers.CharField()
    email = serializers.CharField()
    check_in_identifier = serializers.CharField()
    has_photo = serializers.BooleanField()
    has_pin = serializers.BooleanField()
    photo_url = serializers.CharField(allow_null=True)
    missing_required_fields = serializers.ListField(child=serializers.CharField())
    field_messages = serializers.DictField(child=serializers.CharField())


def available_member_payload(member, group, request):
    values = member_profile_values(member)
    missing = missing_required_fields(group, values)
    from groups.requirements import REQUIRED_FIELD_MESSAGES

    return {
        "id": member.id,
        "name": member.name,
        "internal_code": member.internal_code,
        "email": member.email,
        "check_in_identifier": member.check_in_identifier,
        "has_photo": member.has_photo,
        "has_pin": member.has_pin,
        "photo_url": absolute_file_url(request, member.photo),
        "missing_required_fields": missing,
        "field_messages": {
            field: REQUIRED_FIELD_MESSAGES[field]
            for field in missing
            if field in REQUIRED_FIELD_MESSAGES
        },
    }
