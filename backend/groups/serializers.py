from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import serializers

from core.media_urls import absolute_file_url
from groups.email_sender import (
    email_sender_public_payload,
    get_group_email_sender,
    group_email_sender_is_ready,
)
from groups.models import (
    Group,
    GroupMembership,
    GroupMembershipStatus,
    GroupOnlyParticipant,
    GroupSection,
    GroupSectionStatus,
    GroupType,
    KioskIdentifierField,
    KioskMode,
    KioskTheme,
    MAX_BREAKS_CHOICES,
    member_list_kiosk_mode_allowed,
)
from groups.readiness import group_setup_status_payload, structured_group_section_summary
from groups.templates import validate_notification_template
from kiosk_builder.models import ensure_group_kiosk_design, ensure_group_kiosk_settings
from members.models import Member, MemberStatus, validate_member_pin


class GroupParticipationSerializer(serializers.Serializer):
    email_required = serializers.BooleanField(required=False, source="require_email")
    pin_required = serializers.BooleanField(required=False, source="require_pin")


class GroupReadinessSerializer(serializers.Serializer):
    setup_complete = serializers.BooleanField()
    operational_ready = serializers.BooleanField()
    missing_email_count = serializers.IntegerField()
    missing_pin_count = serializers.IntegerField()


class GroupActionsSerializer(serializers.Serializer):
    check_in_enabled = serializers.BooleanField(required=False)
    check_out_enabled = serializers.BooleanField(required=False)
    breaks_enabled = serializers.BooleanField(required=False)
    max_breaks = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1,
        max_value=3,
    )


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


class GroupKioskSerializer(serializers.Serializer):
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
    participation = GroupParticipationSerializer(required=False, write_only=True)
    notifications = GroupNotificationsSerializer(required=False, write_only=True)
    kiosk = GroupKioskSerializer(required=False, write_only=True)
    group_type = serializers.ChoiceField(
        choices=GroupType.choices,
        required=False,
        default=GroupType.STANDARD,
    )
    require_class_pin = serializers.BooleanField(required=False, default=False)
    member_count = serializers.IntegerField(read_only=True)
    group_only_participant_count = serializers.IntegerField(read_only=True)
    section_count = serializers.IntegerField(read_only=True)
    participant_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Group
        fields = (
            "id",
            "name",
            "status",
            "group_type",
            "require_class_pin",
            "actions",
            "participation",
            "notifications",
            "kiosk",
            "member_count",
            "group_only_participant_count",
            "section_count",
            "participant_count",
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

    def validate_group_type(self, value):
        if self.instance and self.instance.group_type != value:
            raise serializers.ValidationError(
                "Group type cannot be changed after creation."
            )
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["actions"] = {
            "check_in_enabled": instance.check_in_enabled,
            "check_out_enabled": instance.check_out_enabled,
            "breaks_enabled": instance.breaks_enabled,
            "max_breaks": instance.max_breaks,
        }
        data["participation"] = {
            "email_required": instance.require_email,
            "pin_required": instance.require_pin,
        }
        data["readiness"] = group_setup_status_payload(instance)
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
        sender = get_group_email_sender(instance)
        data["advanced"] = {
            "email_sender": email_sender_public_payload(sender),
            "email_sender_ready": bool(sender and sender.is_ready),
        }
        data["email_sender_ready"] = bool(sender and sender.is_ready)
        data["require_email_enabled_for_after_action"] = bool(
            getattr(instance, "_require_email_enabled_for_after_action", False)
        )

        data["kiosk"] = {
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
        data["kiosk_available"] = True
        data["require_class_pin"] = bool(
            instance.group_type == GroupType.STRUCTURED and instance.require_class_pin
        )

        member_count = getattr(instance, "member_count", None)
        participant_count = getattr(instance, "group_only_participant_count", None)
        if member_count is None or participant_count is None:
            memberships = instance.memberships.operational()
            visitors = instance.group_only_participants.operational()
            if member_count is None:
                member_count = memberships.count()
            if participant_count is None:
                participant_count = visitors.count()
        data["member_count"] = member_count
        data["group_only_participant_count"] = participant_count

        if instance.group_type == GroupType.STRUCTURED:
            summary = structured_group_section_summary(instance)
            data["section_count"] = summary["active_section_count"]
            data["participant_count"] = summary["participant_count"]
            data["structured"] = {
                "require_class_pin": bool(instance.require_class_pin),
                "active_section_count": summary["active_section_count"],
                "participant_count": summary["participant_count"],
            }
        else:
            data["section_count"] = 0
            data["participant_count"] = member_count + participant_count
            data["structured"] = None
        return data

    def validate(self, attrs):
        attrs = super().validate(attrs)
        actions = attrs.get("actions") or {}
        kiosk = attrs.get("kiosk") or {}
        instance = self.instance
        check_in = actions.get(
            "check_in_enabled",
            instance.check_in_enabled if instance else True,
        )
        check_out = actions.get(
            "check_out_enabled",
            instance.check_out_enabled if instance else False,
        )
        breaks_enabled = actions.get(
            "breaks_enabled",
            instance.breaks_enabled if instance else False,
        )
        requested_mode = kiosk.get("kiosk_mode")
        if requested_mode == KioskMode.MEMBER_LIST and not member_list_kiosk_mode_allowed(
            check_in_enabled=check_in,
            check_out_enabled=check_out,
            breaks_enabled=breaks_enabled,
        ):
            raise serializers.ValidationError(
                {
                    "kiosk_mode": (
                        "Member list mode is only available for Groups with exactly "
                        "one manual action: either check-in only or check-out only."
                    )
                }
            )

        notifications = attrs.get("notifications") or {}
        enabling_after_action = False
        for key, flag_attr, action_on in (
            ("check_in", "send_email_after_check_in", check_in),
            ("check_out", "send_email_after_check_out", check_out),
            ("after_break", "send_email_after_break", breaks_enabled),
        ):
            if not action_on:
                continue
            setting = notifications.get(key) or {}
            if setting.get("send_email") is not True:
                continue
            already_on = bool(instance and getattr(instance, flag_attr, False))
            if not already_on:
                enabling_after_action = True
                break
        if enabling_after_action:
            if instance is None or not group_email_sender_is_ready(instance):
                raise serializers.ValidationError(
                    {
                        "notifications": (
                            "Configure and verify an email sender in Advanced "
                            "before enabling after-action emails."
                        )
                    }
                )
        return attrs

    def create(self, validated_data):
        mapped = self._mapped_fields(validated_data)
        organization = self.context["organization"]
        auto_require = mapped.pop("_require_email_enabled_for_after_action", False)
        try:
            with transaction.atomic():
                group = Group.objects.create_group(
                    organization=organization,
                    **mapped,
                )
                ensure_group_kiosk_design(group)
                ensure_group_kiosk_settings(group)
                group._require_email_enabled_for_after_action = auto_require
                return group
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
        auto_require = mapped.pop("_require_email_enabled_for_after_action", False)
        for field, value in mapped.items():
            setattr(instance, field, value)
        try:
            with transaction.atomic():
                instance.save()
                from kiosk_builder.kiosk_settings_validation import repair_kiosk_settings_for_group

                repair_kiosk_settings_for_group(instance)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                getattr(exc, "message_dict", exc.messages)
            ) from exc
        except IntegrityError as exc:
            raise serializers.ValidationError(
                {"name": "A Group with this name already exists in this workspace."}
            ) from exc
        instance._require_email_enabled_for_after_action = auto_require
        return instance

    def _mapped_fields(self, validated_data, instance=None):
        mapped = {}
        if "name" in validated_data:
            mapped["name"] = validated_data["name"]
        if instance is None and "group_type" in validated_data:
            mapped["group_type"] = validated_data["group_type"]
        if "require_class_pin" in validated_data:
            mapped["require_class_pin"] = validated_data["require_class_pin"]

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
        if mapped.get("breaks_enabled") and "max_breaks" not in mapped:
            if instance is None or instance.max_breaks not in MAX_BREAKS_CHOICES:
                mapped["max_breaks"] = 1

        participation = validated_data.get("participation") or {}
        if "require_email" in participation:
            mapped["require_email"] = participation["require_email"]
        if "require_pin" in participation:
            mapped["require_pin"] = participation["require_pin"]

        notifications = validated_data.get("notifications") or {}
        check_in_enabled = mapped.get(
            "check_in_enabled",
            instance.check_in_enabled if instance is not None else True,
        )
        check_out_enabled = mapped.get(
            "check_out_enabled",
            instance.check_out_enabled if instance is not None else False,
        )
        breaks_enabled = mapped.get(
            "breaks_enabled",
            instance.breaks_enabled if instance is not None else False,
        )
        notification_map = {
            "check_in": ("send_email_after_check_in", "check_in_email_template"),
            "check_out": ("send_email_after_check_out", "check_out_email_template"),
            "after_break": ("send_email_after_break", "break_email_template"),
        }
        enabled_notification_keys = {
            "check_in": check_in_enabled,
            "check_out": check_out_enabled,
            "after_break": breaks_enabled,
        }
        for key, (flag_field, template_field) in notification_map.items():
            if not enabled_notification_keys[key]:
                continue
            setting = notifications.get(key) or {}
            if "send_email" in setting:
                mapped[flag_field] = setting["send_email"]
            if "email_template" in setting:
                mapped[template_field] = setting["email_template"]

        # Enabling any after-action email forces require_email ON.
        # Turning all after-actions OFF does not auto-disable require_email.
        final_send_flags = [
            mapped.get(
                "send_email_after_check_in",
                instance.send_email_after_check_in if instance is not None else False,
            ),
            mapped.get(
                "send_email_after_check_out",
                instance.send_email_after_check_out if instance is not None else False,
            ),
            mapped.get(
                "send_email_after_break",
                instance.send_email_after_break if instance is not None else False,
            ),
        ]
        auto_require = False
        if any(final_send_flags):
            prior_require = mapped.get(
                "require_email",
                instance.require_email if instance is not None else False,
            )
            if not prior_require:
                auto_require = True
            mapped["require_email"] = True
        mapped["_require_email_enabled_for_after_action"] = auto_require

        kiosk = validated_data.get("kiosk") or {}
        kiosk_map = {
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
    search = serializers.CharField(required=False, allow_blank=True)


class GroupMembershipSerializer(serializers.ModelSerializer):
    member_id = serializers.IntegerField(write_only=True, required=False)
    section_id = serializers.IntegerField(required=False, allow_null=True)
    participation_pin = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )
    clear_participation_pin = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
    )
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
    participation = serializers.SerializerMethodField()
    setup = serializers.SerializerMethodField()

    class Meta:
        model = GroupMembership
        fields = (
            "id",
            "group_participant_code",
            "member_id",
            "section_id",
            "member",
            "override_name",
            "override_email",
            "participation_email",
            "participation_pin",
            "clear_participation_pin",
            "override_photo",
            "override_check_in_identifier",
            "override_pin",
            "clear_override_pin",
            "clear_override_photo",
            "overrides",
            "effective",
            "participation",
            "setup",
            "status",
            "created_at",
            "updated_at",
            "deactivated_at",
        )
        read_only_fields = (
            "id",
            "group_participant_code",
            "status",
            "created_at",
            "updated_at",
            "deactivated_at",
        )
        extra_kwargs = {
            "override_photo": {"write_only": True, "required": False},
            "override_name": {"required": False, "allow_blank": True},
            "override_email": {"required": False, "allow_blank": True},
            "participation_email": {"required": False, "allow_blank": True},
            "override_check_in_identifier": {"required": False, "allow_blank": True},
        }

    def validate_participation_pin(self, value):
        if not value:
            return value
        try:
            return validate_member_pin(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

    def validate_override_pin(self, value):
        if not value:
            return value
        try:
            return validate_member_pin(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data.pop("participation_pin", None)
        data["section_id"] = instance.section_id
        return data

    def get_member(self, obj):
        member = obj.member
        request = self.context.get("request")
        return {
            "id": member.id,
            "name": member.name,
            "email": member.email,
            "check_in_identifier": member.check_in_identifier,
            "has_photo": member.has_photo,
            "has_pin": member.has_pin,
            "photo_url": absolute_file_url(request, member.photo),
            "status": member.status,
        }

    def get_participation(self, obj):
        group = obj.group
        email = (obj.participation_email or "").strip()
        pin = (obj.participation_pin or "").strip()
        missing = []
        if group.require_email and not email:
            missing.append("email")
        if group.require_pin and not obj.has_participation_pin:
            missing.append("pin")
        return {
            "email": email,
            "pin": pin or None,
            "has_pin": obj.has_participation_pin,
            "missing_required_fields": missing,
            "complete": not missing,
        }

    def get_setup(self, obj):
        return self.get_participation(obj)

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
        section = self._resolve_section(validated_data.pop("section_id", None))
        if group.group_type == GroupType.STRUCTURED and section is None:
            raise serializers.ValidationError(
                {"section_id": "Class is required for Structured Group participants."}
            )
        if group.group_type == GroupType.STANDARD and section is not None:
            raise serializers.ValidationError(
                {"section_id": "Standard Groups cannot assign Classes."}
            )
        member = self._resolve_member(validated_data.pop("member_id", None))
        pin = validated_data.pop("participation_pin", "") or validated_data.pop(
            "override_pin", ""
        )
        validated_data.pop("clear_participation_pin", None)
        validated_data.pop("clear_override_pin", None)
        validated_data.pop("clear_override_photo", None)

        existing = GroupMembership.objects.filter(group=group, member=member).first()
        if existing and existing.status == GroupMembershipStatus.ACTIVE:
            raise serializers.ValidationError(
                {"member_id": "This Member is already in this Group."}
            )

        membership = existing or GroupMembership(group=group, member=member)
        membership.organization = organization
        membership.section = section
        membership.status = GroupMembershipStatus.ACTIVE
        if not validated_data.get("participation_email") and group.require_email:
            member_email = (member.email or "").strip()
            if member_email:
                validated_data["participation_email"] = member_email
        self._apply_fields(membership, validated_data, pin=pin)
        membership.save()
        return membership

    def update(self, instance, validated_data):
        if instance.member.status != MemberStatus.ACTIVE:
            raise serializers.ValidationError(
                {
                    "member_id": (
                        "Archived Members cannot be edited in a Group until restored."
                    )
                }
            )
        validated_data.pop("member_id", None)
        if "section_id" in validated_data:
            section = self._resolve_section(validated_data.pop("section_id"))
            if instance.group.group_type == GroupType.STRUCTURED:
                if section is None:
                    raise serializers.ValidationError(
                        {"section_id": "Class is required for Structured Group participants."}
                    )
                instance.section = section
            elif section is not None:
                raise serializers.ValidationError(
                    {"section_id": "Standard Groups cannot assign Classes."}
                )
        pin = validated_data.pop("participation_pin", None)
        if pin is None:
            pin = validated_data.pop("override_pin", None)
        clear_pin = validated_data.pop("clear_participation_pin", False) or validated_data.pop(
            "clear_override_pin", False
        )
        clear_photo = validated_data.pop("clear_override_photo", False)
        if clear_photo and not validated_data.get("override_photo"):
            instance.override_photo.delete(save=False)
            instance.override_photo = ""
        self._apply_fields(instance, validated_data, pin=pin, clear_pin=clear_pin)
        instance.save()
        return instance

    def _resolve_section(self, section_id):
        group = self.context["group"]
        context_section = self.context.get("section")
        if context_section is not None:
            return context_section
        if section_id in (None, ""):
            return None
        section = GroupSection.objects.filter(
            pk=section_id,
            group=group,
            organization=self.context["organization"],
            status=GroupSectionStatus.ACTIVE,
        ).first()
        if section is None:
            raise serializers.ValidationError(
                {"section_id": "Class not found in this Group."}
            )
        return section

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

    def _apply_fields(self, membership, validated_data, *, pin=None, clear_pin=False):
        for field in (
            "override_name",
            "override_email",
            "participation_email",
            "override_photo",
            "override_check_in_identifier",
        ):
            if field in validated_data:
                setattr(membership, field, validated_data[field])
        if pin:
            membership.set_participation_pin(pin)
        elif clear_pin:
            membership.clear_participation_pin()


class GroupOnlyParticipantSerializer(serializers.ModelSerializer):
    pin = serializers.CharField(write_only=True, required=False, allow_blank=True)
    participation_pin = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )
    section_id = serializers.IntegerField(required=False, allow_null=True)
    clear_pin = serializers.BooleanField(write_only=True, required=False, default=False)
    clear_participation_pin = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
    )
    clear_photo = serializers.BooleanField(write_only=True, required=False, default=False)
    has_pin = serializers.BooleanField(read_only=True)
    has_photo = serializers.BooleanField(read_only=True)
    photo_url = serializers.SerializerMethodField()
    participation = serializers.SerializerMethodField()
    setup = serializers.SerializerMethodField()

    class Meta:
        model = GroupOnlyParticipant
        fields = (
            "id",
            "group_participant_code",
            "section_id",
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
            "participation_pin",
            "clear_pin",
            "clear_participation_pin",
            "has_pin",
            "participation",
            "setup",
            "status",
            "created_at",
            "updated_at",
            "archived_at",
        )
        read_only_fields = (
            "id",
            "group_participant_code",
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

    def validate_participation_pin(self, value):
        return self.validate_pin(value)

    def get_photo_url(self, obj):
        return absolute_file_url(self.context.get("request"), obj.photo)

    def get_participation(self, obj):
        group = obj.group
        email = (obj.email or "").strip()
        pin = (obj.participation_pin or "").strip()
        missing = []
        if group.require_email and not email:
            missing.append("email")
        if group.require_pin and not obj.has_pin:
            missing.append("pin")
        return {
            "email": email,
            "pin": pin or None,
            "has_pin": obj.has_pin,
            "missing_required_fields": missing,
            "complete": not missing,
        }

    def get_setup(self, obj):
        return self.get_participation(obj)

    def create(self, validated_data):
        group = self.context["group"]
        section = self._resolve_section(validated_data.pop("section_id", None))
        if group.group_type == GroupType.STRUCTURED and section is None:
            raise serializers.ValidationError(
                {"section_id": "Class is required for Structured Group participants."}
            )
        if group.group_type == GroupType.STANDARD and section is not None:
            raise serializers.ValidationError(
                {"section_id": "Standard Groups cannot assign Classes."}
            )
        pin = validated_data.pop("participation_pin", "") or validated_data.pop("pin", "")
        validated_data.pop("clear_participation_pin", None)
        validated_data.pop("clear_pin", None)
        validated_data.pop("clear_photo", None)
        participant = GroupOnlyParticipant(
            group=group,
            organization=group.organization,
            section=section,
        )
        for field, value in validated_data.items():
            setattr(participant, field, value)
        if pin:
            participant.set_participation_pin(pin)
        participant.save()
        return participant

    def update(self, instance, validated_data):
        if "section_id" in validated_data:
            section = self._resolve_section(validated_data.pop("section_id"))
            if instance.group.group_type == GroupType.STRUCTURED:
                if section is None:
                    raise serializers.ValidationError(
                        {"section_id": "Class is required for Structured Group participants."}
                    )
                instance.section = section
            elif section is not None:
                raise serializers.ValidationError(
                    {"section_id": "Standard Groups cannot assign Classes."}
                )
        pin = validated_data.pop("participation_pin", None)
        if pin is None:
            pin = validated_data.pop("pin", None)
        clear_pin = validated_data.pop("clear_participation_pin", False) or validated_data.pop(
            "clear_pin", False
        )
        clear_photo = validated_data.pop("clear_photo", False)
        if clear_photo and not validated_data.get("photo"):
            instance.photo.delete(save=False)
            instance.photo = ""
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if pin:
            instance.set_participation_pin(pin)
        elif clear_pin:
            instance.clear_participation_pin()
        instance.save()
        return instance

    def _resolve_section(self, section_id):
        group = self.context["group"]
        context_section = self.context.get("section")
        if context_section is not None:
            return context_section
        if section_id in (None, ""):
            return None
        section = GroupSection.objects.filter(
            pk=section_id,
            group=group,
            organization=self.context["organization"],
            status=GroupSectionStatus.ACTIVE,
        ).first()
        if section is None:
            raise serializers.ValidationError(
                {"section_id": "Class not found in this Group."}
            )
        return section

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data.pop("photo", None)
        data.pop("pin", None)
        data.pop("participation_pin", None)
        data["section_id"] = instance.section_id
        return data


class AvailableMemberSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    email = serializers.CharField()
    check_in_identifier = serializers.CharField()
    has_photo = serializers.BooleanField()
    has_pin = serializers.BooleanField()
    photo_url = serializers.CharField(allow_null=True)
    suggested_participation_email = serializers.CharField(allow_blank=True)
    missing_required_fields = serializers.ListField(child=serializers.CharField())
    field_messages = serializers.DictField(child=serializers.CharField())


def available_member_payload(member, group, request):
    suggested_email = (member.email or "").strip() if group.require_email else ""
    return {
        "id": member.id,
        "name": member.name,
        "email": member.email,
        "check_in_identifier": member.check_in_identifier,
        "has_photo": member.has_photo,
        "has_pin": member.has_pin,
        "photo_url": absolute_file_url(request, member.photo),
        "suggested_participation_email": suggested_email,
        "missing_required_fields": [],
        "field_messages": {},
    }


class GroupSectionSerializer(serializers.ModelSerializer):
    participant_count = serializers.IntegerField(read_only=True)
    member_count = serializers.IntegerField(read_only=True)
    group_only_participant_count = serializers.IntegerField(read_only=True)
    class_pin = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=12,
    )
    clear_class_pin = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
    )
    has_class_pin = serializers.BooleanField(read_only=True)

    class Meta:
        model = GroupSection
        fields = (
            "id",
            "name",
            "class_pin",
            "clear_class_pin",
            "has_class_pin",
            "status",
            "participant_count",
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
            "has_class_pin",
        )

    def validate_class_pin(self, value):
        if not value:
            return value
        try:
            return validate_member_pin(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

    def to_representation(self, instance):
        data = super().to_representation(instance)
        member_count = getattr(instance, "member_count", None)
        visitor_count = getattr(instance, "group_only_participant_count", None)
        if member_count is None:
            member_count = instance.memberships.operational().count()
        if visitor_count is None:
            visitor_count = instance.group_only_participants.operational().count()
        data["member_count"] = member_count
        data["group_only_participant_count"] = visitor_count
        data["participant_count"] = member_count + visitor_count
        data["group_id"] = instance.group_id
        data["group_name"] = instance.group.name
        data["has_class_pin"] = instance.has_class_pin
        # Managers may view Class PIN (same low-security attendance PIN policy).
        data["class_pin"] = instance.class_pin or ""
        return data

    def create(self, validated_data):
        group = self.context["group"]
        if group.group_type != GroupType.STRUCTURED:
            raise serializers.ValidationError(
                {"group": "Classes can only be created inside Structured Groups."}
            )
        pin = validated_data.pop("class_pin", None)
        validated_data.pop("clear_class_pin", None)
        try:
            section = GroupSection.objects.create_section(
                group=group,
                organization=group.organization,
                **validated_data,
            )
            if pin:
                section.set_class_pin(pin)
                section.save(update_fields=["class_pin", "updated_at"])
            return section
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                getattr(exc, "message_dict", exc.messages)
            ) from exc
        except IntegrityError as exc:
            raise serializers.ValidationError(
                {"name": "A Class with this name already exists in this Group."}
            ) from exc

    def update(self, instance, validated_data):
        pin = validated_data.pop("class_pin", None)
        clear_pin = validated_data.pop("clear_class_pin", False)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if pin is not None and pin != "":
            instance.set_class_pin(pin)
        elif clear_pin:
            instance.clear_class_pin()
        try:
            instance.save()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                getattr(exc, "message_dict", exc.messages)
            ) from exc
        except IntegrityError as exc:
            raise serializers.ValidationError(
                {"name": "A Class with this name already exists in this Group."}
            ) from exc
        return instance


class StandardGroupImportSerializer(serializers.Serializer):
    source_group_id = serializers.IntegerField()
    name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    class_pin = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=12,
    )

    def validate_class_pin(self, value):
        if not value:
            return value
        try:
            return validate_member_pin(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc
