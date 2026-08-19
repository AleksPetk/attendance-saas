from datetime import datetime, time

from django.db.models import Q
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from attendance.models import ActionRecord, ActionSource, ActionType
from attendance.serializers import (
    ActionRecordSerializer,
    HistoryQuerySerializer,
    KioskIdentifyRequestSerializer,
    KioskPerformRequestSerializer,
)
from attendance.services import (
    compute_current_attendance_state,
    ensure_automatic_check_in_action_record_for_membership,
    ensure_automatic_check_in_action_record_for_participant,
    get_valid_actions_for_state,
    perform_action_record_from_kiosk,
)
from groups.models import (
    Group,
    GroupMembership,
    GroupMembershipStatus,
    GroupOnlyParticipant,
    GroupOnlyParticipantStatus,
    GroupStatus,
    KioskIdentifierField,
    KioskMode,
)
from organizations.permissions import (
    CanUseKioskAndViewHistory,
    get_active_workspace_organization,
)


def absolute_file_url(request, field_file):
    if not field_file:
        return None
    if not getattr(field_file, "url", None):
        return None
    url = field_file.url
    return request.build_absolute_uri(url) if request is not None else url


class OwnedWorkspaceMixin:
    permission_classes = [CanUseKioskAndViewHistory]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.organization = get_active_workspace_organization(request.user)


class GroupKioskStartView(OwnedWorkspaceMixin, APIView):
    """
    Return kiosk configuration + either:
    - member list participant cards (member list mode)
    - input identification fields (input mode)
    """

    def get_object(self, group_pk):
        group = (
            Group.objects.filter(pk=group_pk, organization=self.organization)
            .exclude(status=GroupStatus.ARCHIVED)
            .first()
        )
        if group is None:
            raise NotFound("Group not found in this workspace.")
        if not group.kiosk_enabled:
            raise NotFound("Kiosk is not enabled for this Group.")
        return group

    def get(self, request, group_pk):
        group = self.get_object(group_pk)

        if group.kiosk_mode == KioskMode.MEMBER_LIST:
            memberships = GroupMembership.objects.filter(
                organization=self.organization,
                group=group,
                status=GroupMembershipStatus.ACTIVE,
            ).select_related("member")
            participants = GroupOnlyParticipant.objects.filter(
                organization=self.organization,
                group=group,
                status=GroupOnlyParticipantStatus.ACTIVE,
            )

            people = []
            for m in memberships:
                people.append(
                    {
                        "participant_kind": "member",
                        "membership_id": m.id,
                        "member_id": m.member_id,
                        "name": m.effective_name if group.kiosk_list_show_name else None,
                        "photo_url": absolute_file_url(request, m.override_photo or m.member.photo)
                        if group.kiosk_list_show_photo and m.has_effective_photo
                        else None,
                        "identifier": m.effective_check_in_identifier if group.kiosk_list_show_identifier else None,
                        "email": m.effective_email if group.kiosk_list_show_email else None,
                        "has_pin": m.has_effective_pin,
                    }
                )

            for p in participants:
                people.append(
                    {
                        "participant_kind": "group_only_participant",
                        "group_only_participant_id": p.id,
                        "name": p.name if group.kiosk_list_show_name else None,
                        "photo_url": absolute_file_url(request, p.photo)
                        if group.kiosk_list_show_photo and p.has_photo
                        else None,
                        "identifier": p.check_in_identifier if group.kiosk_list_show_identifier else None,
                        "email": p.email if group.kiosk_list_show_email else None,
                        "has_pin": p.has_pin,
                    }
                )

            # List mode is validated at Group-save time.
            if group.check_in_enabled and not group.check_out_enabled:
                primary_action = ActionType.CHECK_IN
            elif group.check_out_enabled and not group.check_in_enabled:
                primary_action = ActionType.CHECK_OUT
            else:
                primary_action = None

            return Response(
                {
                    "kiosk": {
                        "kiosk_mode": group.kiosk_mode,
                        "theme": group.kiosk_theme,
                        "title": group.kiosk_title or group.name,
                        "welcome_text": group.kiosk_welcome_text,
                        "success_message": group.kiosk_success_message,
                        "confirmation_message": group.kiosk_confirmation_message,
                        "return_delay_seconds": group.kiosk_return_delay_seconds,
                        "requires_pin": group.require_pin,
                        "list_display": {
                            "show_name": group.kiosk_list_show_name,
                            "show_photo": group.kiosk_list_show_photo,
                            "show_identifier": group.kiosk_list_show_identifier,
                            "show_email": group.kiosk_list_show_email,
                        },
                    },
                    "primary_action": primary_action,
                    "people": people,
                }
            )

        if group.kiosk_mode == KioskMode.INPUT:
            field_1 = group.kiosk_input_field_1
            field_2 = group.kiosk_input_field_2
            fields = [field_1]
            if field_2:
                fields.append(field_2)

            warnings = []
            if group.require_email is False and KioskIdentifierField.EMAIL in fields:
                # Warn if some participants lack email.
                missing = 0
                total = 0
                memberships = GroupMembership.objects.filter(
                    organization=self.organization,
                    group=group,
                    status=GroupMembershipStatus.ACTIVE,
                ).select_related("member")
                for m in memberships:
                    total += 1
                    if not m.effective_email:
                        missing += 1
                participants = GroupOnlyParticipant.objects.filter(
                    organization=self.organization,
                    group=group,
                    status=GroupOnlyParticipantStatus.ACTIVE,
                )
                for p in participants:
                    total += 1
                    if not (p.email or "").strip():
                        missing += 1
                if missing > 0:
                    warnings.append(
                        "Some participants don't have email; they can't be identified using email in this kiosk mode."
                    )

            return Response(
                {
                    "kiosk": {
                        "kiosk_mode": group.kiosk_mode,
                        "theme": group.kiosk_theme,
                        "title": group.kiosk_title or group.name,
                        "welcome_text": group.kiosk_welcome_text,
                        "success_message": group.kiosk_success_message,
                        "confirmation_message": group.kiosk_confirmation_message,
                        "return_delay_seconds": group.kiosk_return_delay_seconds,
                        "requires_pin": group.require_pin,
                        "input_fields": fields,
                        "warnings": warnings,
                    }
                }
            )

        raise ValidationError({"kiosk_mode": "Unknown kiosk mode."})


class GroupKioskIdentifyView(OwnedWorkspaceMixin, APIView):
    """
    Input-mode identification: match participant(s) using the configured identification fields,
    verify PIN if selected/required, and return the participant snapshot + allowed actions.
    """

    def post(self, request, group_pk):
        group = (
            Group.objects.filter(pk=group_pk, organization=self.organization)
            .exclude(status=GroupStatus.ARCHIVED)
            .first()
        )
        if group is None:
            raise NotFound("Group not found in this workspace.")
        if not group.kiosk_enabled or group.kiosk_mode != KioskMode.INPUT:
            raise ValidationError({"kiosk": "This Group kiosk is not in input mode."})

        req_ser = KioskIdentifyRequestSerializer(data=request.data)
        req_ser.is_valid(raise_exception=True)
        data = req_ser.validated_data

        configured_fields = [group.kiosk_input_field_1]
        if group.kiosk_input_field_2:
            configured_fields.append(group.kiosk_input_field_2)

        # Require non-pin fields present for matching.
        if KioskIdentifierField.PIN not in configured_fields and group.require_pin:
            # Model validation should prevent this.
            raise ValidationError({"pin": "PIN is required for this Group."})

        match_fields = []
        for f in configured_fields:
            if f == KioskIdentifierField.PIN:
                continue
            match_fields.append(f)

        if not match_fields:
            raise ValidationError({"kiosk": "Invalid input field configuration."})

        # Validate required request inputs for configured fields.
        if KioskIdentifierField.NAME in configured_fields and not data.get("name"):
            raise ValidationError({"name": "Name is required for this kiosk configuration."})
        if KioskIdentifierField.EMAIL in configured_fields and not data.get("email"):
            raise ValidationError({"email": "Email is required for this kiosk configuration."})
        if KioskIdentifierField.IDENTIFIER in configured_fields and not data.get("identifier"):
            raise ValidationError({"identifier": "Identifier is required for this kiosk configuration."})

        pin = data.get("pin") or ""
        needs_pin = KioskIdentifierField.PIN in configured_fields

        # Build candidates from both Members (via active membership) and Group-only Participants.
        memberships = GroupMembership.objects.filter(
            organization=self.organization,
            group=group,
            status=GroupMembershipStatus.ACTIVE,
        ).select_related("member")
        group_only = GroupOnlyParticipant.objects.filter(
            organization=self.organization,
            group=group,
            status=GroupOnlyParticipantStatus.ACTIVE,
        )

        def _match_membership(m):
            for f in match_fields:
                if f == KioskIdentifierField.NAME:
                    if (m.effective_name or "").strip().lower() != data["name"].strip().lower():
                        return False
                if f == KioskIdentifierField.EMAIL:
                    if (m.effective_email or "").strip().lower() != data["email"].strip().lower():
                        return False
                if f == KioskIdentifierField.IDENTIFIER:
                    if (m.effective_check_in_identifier or "").strip() != data["identifier"].strip():
                        return False
            return True

        def _match_participant(p):
            for f in match_fields:
                if f == KioskIdentifierField.NAME:
                    if (p.name or "").strip().lower() != data["name"].strip().lower():
                        return False
                if f == KioskIdentifierField.EMAIL:
                    if (p.email or "").strip().lower() != data["email"].strip().lower():
                        return False
                if f == KioskIdentifierField.IDENTIFIER:
                    if (p.check_in_identifier or "").strip() != data["identifier"].strip():
                        return False
            return True

        candidate_memberships = [m for m in memberships if _match_membership(m)]
        candidate_participants = [p for p in group_only if _match_participant(p)]

        total_candidates = len(candidate_memberships) + len(candidate_participants)
        if total_candidates == 0:
            return Response({"code": "not_found", "detail": "No participant matches the provided inputs."}, status=status.HTTP_404_NOT_FOUND)

        if not needs_pin:
            if total_candidates != 1:
                matches = []
                for m in candidate_memberships:
                    matches.append({"participant_kind": "member", "name": m.effective_name})
                for p in candidate_participants:
                    matches.append({"participant_kind": "group_only_participant", "name": p.name})
                return Response(
                    {"code": "ambiguous", "detail": "Multiple participants match; configure the kiosk inputs to be more specific.", "matches": matches},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Exactly one match without PIN.
            if candidate_memberships:
                membership = candidate_memberships[0]
                participant_kind = "member"
                participant_obj = membership
            else:
                participant_kind = "group_only_participant"
                participant_obj = candidate_participants[0]
        else:
            # Verify PIN among candidates.
            pin_matches = []
            for m in candidate_memberships:
                if m.check_effective_pin(pin):
                    pin_matches.append(("member", m))
            for p in candidate_participants:
                if p.check_pin(pin):
                    pin_matches.append(("group_only_participant", p))

            if len(pin_matches) == 0:
                return Response({"code": "invalid_pin", "detail": "PIN verification failed."}, status=status.HTTP_400_BAD_REQUEST)
            if len(pin_matches) != 1:
                matches = []
                for kind, obj in pin_matches:
                    if kind == "member":
                        matches.append({"participant_kind": kind, "name": obj.effective_name})
                    else:
                        matches.append({"participant_kind": kind, "name": obj.name})
                return Response(
                    {
                        "code": "ambiguous",
                        "detail": "PIN matched multiple participants; configure inputs to be more specific.",
                        "matches": matches,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            participant_kind, participant_obj = pin_matches[0]

        # Automatic check-in may create a check-in record on demand.
        if participant_kind == "member":
            membership = participant_obj
            auto_result = ensure_automatic_check_in_action_record_for_membership(group=group, membership=membership, now=timezone.now())
            state = compute_current_attendance_state(group=group, participant_kind="member", member_id=membership.member_id)
            allowed_actions = get_valid_actions_for_state(group=group, state=state)
            return Response(
                {
                    "code": "ok",
                    "participant": {
                        "participant_kind": "member",
                        "membership_id": membership.id,
                        "name": membership.effective_name,
                        "email": membership.effective_email,
                        "identifier": membership.effective_check_in_identifier,
                    },
                    "automatic_check_in": auto_result,
                    "attendance_state": state,
                    "allowed_actions": allowed_actions,
                }
            )
        else:
            participant = participant_obj
            auto_result = ensure_automatic_check_in_action_record_for_participant(group=group, participant=participant, now=timezone.now())
            state = compute_current_attendance_state(
                group=group,
                participant_kind="group_only_participant",
                participant_id=participant.id,
            )
            allowed_actions = get_valid_actions_for_state(group=group, state=state)
            return Response(
                {
                    "code": "ok",
                    "participant": {
                        "participant_kind": "group_only_participant",
                        "group_only_participant_id": participant.id,
                        "name": participant.name,
                        "email": participant.email,
                        "identifier": participant.check_in_identifier,
                    },
                    "automatic_check_in": auto_result,
                    "attendance_state": state,
                    "allowed_actions": allowed_actions,
                }
            )


class GroupKioskPerformView(OwnedWorkspaceMixin, APIView):
    """
    Perform an attendance action from kiosk with sequencing validation + PIN verification.
    """

    def post(self, request, group_pk):
        group = (
            Group.objects.filter(pk=group_pk, organization=self.organization)
            .exclude(status=GroupStatus.ARCHIVED)
            .first()
        )
        if group is None:
            raise NotFound("Group not found in this workspace.")
        if not group.kiosk_enabled:
            raise NotFound("Kiosk is not enabled for this Group.")

        req_ser = KioskPerformRequestSerializer(data=request.data)
        req_ser.is_valid(raise_exception=True)
        data = req_ser.validated_data

        participant_kind = data["participant_kind"]
        action_type = data["action"]
        pin = data.get("pin") or ""

        membership = None
        group_only_participant = None

        if participant_kind == "member":
            membership_id = data.get("membership_id")
            if not membership_id:
                raise ValidationError({"membership_id": "membership_id is required for member participant kind."})
            membership = GroupMembership.objects.filter(
                organization=self.organization,
                group=group,
                status=GroupMembershipStatus.ACTIVE,
                pk=membership_id,
            ).select_related("member").first()
            if membership is None:
                raise ValidationError({"participant": "Selected member is not part of this Group."})
        elif participant_kind == "group_only_participant":
            group_only_id = data.get("group_only_participant_id")
            if not group_only_id:
                raise ValidationError({"group_only_participant_id": "group_only_participant_id is required."})
            group_only_participant = GroupOnlyParticipant.objects.filter(
                organization=self.organization,
                group=group,
                status=GroupOnlyParticipantStatus.ACTIVE,
                pk=group_only_id,
            ).first()
            if group_only_participant is None:
                raise ValidationError({"participant": "Selected group-only participant is not part of this Group."})
        else:
            raise ValidationError({"participant_kind": "Invalid participant kind."})

        # Verify PIN if Group requires it.
        if group.require_pin:
            if not pin:
                raise ValidationError({"pin": "PIN is required for this Group."})
            if participant_kind == "member" and not membership.check_effective_pin(pin):
                raise ValidationError({"pin": "PIN verification failed."})
            if participant_kind == "group_only_participant" and not group_only_participant.check_pin(pin):
                raise ValidationError({"pin": "PIN verification failed."})

        # Automatic check-in (preset) on-demand (no scheduler).
        if group.automatic_check_in_enabled:
            if participant_kind == "member":
                ensure_automatic_check_in_action_record_for_membership(
                    group=group, membership=membership, now=timezone.now()
                )
            else:
                ensure_automatic_check_in_action_record_for_participant(
                    group=group, participant=group_only_participant, now=timezone.now()
                )

        # Snapshot identity for history.
        if participant_kind == "member":
            snapshot = {
                "participant_name_snapshot": membership.effective_name,
                "participant_email_snapshot": membership.effective_email,
                "participant_check_in_identifier_snapshot": membership.effective_check_in_identifier,
            }
        else:
            snapshot = {
                "participant_name_snapshot": group_only_participant.name,
                "participant_email_snapshot": group_only_participant.email,
                "participant_check_in_identifier_snapshot": group_only_participant.check_in_identifier,
            }

        ar = perform_action_record_from_kiosk(
            group=group,
            participant_kind=participant_kind,
            action_type=action_type,
            member=membership.member if participant_kind == "member" else None,
            group_only_participant=group_only_participant if participant_kind == "group_only_participant" else None,
            membership=membership if participant_kind == "member" else None,
            pin_verified=bool(pin),
            snapshot=snapshot,
            now=timezone.now(),
        )

        state = compute_current_attendance_state(
            group=group,
            participant_kind=participant_kind,
            member_id=membership.member_id if participant_kind == "member" else None,
            participant_id=group_only_participant.id if participant_kind == "group_only_participant" else None,
        )
        allowed_actions = get_valid_actions_for_state(group=group, state=state)

        return Response(
            {
                "code": "ok",
                "action_record": ActionRecordSerializer(ar).data,
                "success_message": group.kiosk_success_message or "Done.",
                "return_delay_seconds": group.kiosk_return_delay_seconds,
                "attendance_state": state,
                "allowed_actions": allowed_actions,
            }
        )


class WorkspaceHistoryListView(OwnedWorkspaceMixin, APIView):
    """
    Owner-visible history list for kiosk and automatic/preset actions.
    """

    def get(self, request):
        query = HistoryQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data

        qs = ActionRecord.objects.filter(organization=self.organization)
        group_id = data.get("group_id")
        if group_id:
            qs = qs.filter(group_id=group_id)

        if data.get("action"):
            qs = qs.filter(action_type=data["action"])

        if data.get("source"):
            qs = qs.filter(source=data["source"])

        if data.get("day"):
            qs = qs.filter(performed_at__date=data["day"])

        search = (data.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(participant_name_snapshot__icontains=search)
                | Q(participant_email_snapshot__icontains=search)
                | Q(participant_check_in_identifier_snapshot__icontains=search)
            )

        qs = qs.order_by("-performed_at", "-id")[:200]

        serializer = ActionRecordSerializer(qs, many=True)
        return Response({"items": serializer.data})

