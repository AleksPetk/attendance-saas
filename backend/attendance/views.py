from datetime import datetime, time

from django.db.models import Q
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.exceptions import EmailNotVerified
from accounts.verification import customer_must_verify_email
from django.http import HttpResponse

from attendance.attendance_report import (
    build_attendance_report,
    list_report_groups,
)
from attendance.report_export import render_attendance_report_export
from attendance.kiosk_lock import (
    attach_kiosk_status,
    clear_kiosk_lock,
    kiosk_status_payload,
    lock_kiosk_session,
)
from attendance.models import ActionRecord, ActionSource, ActionType
from attendance.serializers import (
    ActionRecordSerializer,
    AttendanceReportExportQuerySerializer,
    AttendanceReportQuerySerializer,
    HistoryQuerySerializer,
    KioskIdentifyRequestSerializer,
    KioskPerformRequestSerializer,
)
from attendance.services import (
    build_kiosk_identify_payload,
    compute_current_attendance_state,
    get_valid_actions_for_state,
    perform_action_record_from_kiosk,
)
from core.media_urls import absolute_file_url
from groups.operations import ensure_group_operationally_ready, ensure_kiosk_launch_ready
from kiosk_builder.kiosk_identification import (
    find_by_participant_code,
    normalize_participant_code,
    verify_second_field,
)
from kiosk_builder.kiosk_confirmation import confirmation_payload_for_perform
from kiosk_builder.kiosk_runtime import (
    build_card_people,
    build_structured_class_cards,
    get_active_kiosk_section,
    get_kiosk_settings_for_group,
    kiosk_settings_payload,
)
from kiosk_builder.kiosk_settings_constants import KioskInputSecondField, KioskType
from kiosk_builder.models import ensure_group_kiosk_design, ensure_group_kiosk_settings
from organizations.permissions import (
    CanUseKioskAndViewHistory,
    get_active_workspace_organization,
)
from groups.models import (
    Group,
    GroupMembership,
    GroupOnlyParticipant,
    GroupOnlyParticipantStatus,
    GroupStatus,
    GroupType,
)


def _kiosk_start_payload(request, group, payload):
    payload["group_id"] = group.pk
    payload["group_name"] = group.name
    attach_kiosk_status(request, payload)

    settings_obj = get_kiosk_settings_for_group(group)
    design = ensure_group_kiosk_design(group)
    payload["kiosk_settings"] = kiosk_settings_payload(group, settings_obj)
    payload["visual_design"] = {
        "config": design.config,
        "header_logo_url": absolute_file_url(request, design.header_logo),
        "footer_logo_url": absolute_file_url(request, design.footer_logo),
        "main_background_image_url": absolute_file_url(
            request, design.main_background_image
        ),
    }
    return payload


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
            .select_related("kiosk_design", "kiosk_settings")
            .exclude(status=GroupStatus.ARCHIVED)
            .first()
        )
        if group is None:
            raise NotFound("Group not found in this workspace.")
        return group

    def post(self, request, group_pk):
        """Lock this Check Station app session to the Group kiosk."""
        group = self.get_object(group_pk)
        blocked = ensure_kiosk_launch_ready(group)
        if blocked:
            return Response(blocked, status=status.HTTP_409_CONFLICT)
        lock_kiosk_session(request, group.pk)
        payload = {"ok": True, "group_id": group.pk, "group_name": group.name}
        attach_kiosk_status(request, payload)
        return Response(payload)

    def get(self, request, group_pk):
        group = self.get_object(group_pk)
        blocked = ensure_kiosk_launch_ready(group)
        if blocked:
            return Response(blocked, status=status.HTTP_409_CONFLICT)

        settings_obj = get_kiosk_settings_for_group(group)
        kiosk_payload = kiosk_settings_payload(group, settings_obj)

        if group.check_in_enabled and not group.check_out_enabled:
            primary_action = ActionType.CHECK_IN
        elif group.check_out_enabled and not group.check_in_enabled:
            primary_action = ActionType.CHECK_OUT
        else:
            primary_action = None

        if group.group_type == GroupType.STRUCTURED:
            classes = build_structured_class_cards(
                group=group,
                organization=self.organization,
            )
            return Response(
                _kiosk_start_payload(
                    request,
                    group,
                    {
                        "kiosk": kiosk_payload,
                        "primary_action": primary_action,
                        "classes": classes,
                        "people": [],
                    },
                )
            )

        if settings_obj.mode == KioskType.CARD:
            people = build_card_people(
                request=request,
                group=group,
                organization=self.organization,
                settings=settings_obj,
                absolute_file_url=absolute_file_url,
            )

            return Response(
                _kiosk_start_payload(
                    request,
                    group,
                    {
                        "kiosk": kiosk_payload,
                        "primary_action": primary_action,
                        "people": people,
                    },
                )
            )

        if settings_obj.mode == KioskType.INPUT:
            return Response(
                _kiosk_start_payload(
                    request,
                    group,
                    {"kiosk": kiosk_payload},
                )
            )

        raise ValidationError({"mode": "Unknown kiosk type."})


class GroupKioskClassPeopleView(OwnedWorkspaceMixin, APIView):
    """Return participant cards for one active Class (Structured Groups)."""

    def get(self, request, group_pk, section_pk):
        group = (
            Group.objects.filter(pk=group_pk, organization=self.organization)
            .exclude(status=GroupStatus.ARCHIVED)
            .first()
        )
        if group is None:
            raise NotFound("Group not found in this workspace.")
        blocked = ensure_kiosk_launch_ready(group)
        if blocked:
            return Response(blocked, status=status.HTTP_409_CONFLICT)
        if group.group_type != GroupType.STRUCTURED:
            raise ValidationError({"group": "Class kiosk lists require a Structured Group."})

        section = get_active_kiosk_section(
            group=group,
            organization=self.organization,
            section_id=section_pk,
        )
        if section is None:
            raise NotFound("Class not found in this Group.")

        if group.require_class_pin:
            pin = request.query_params.get("pin", "")
            if not section.check_class_pin(pin):
                return Response(
                    {
                        "code": "invalid_class_pin",
                        "detail": "Incorrect PIN. Try again.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        settings_obj = get_kiosk_settings_for_group(group)
        people = build_card_people(
            request=request,
            group=group,
            organization=self.organization,
            settings=settings_obj,
            absolute_file_url=absolute_file_url,
            section=section,
        )
        return Response(
            {
                "section_id": section.id,
                "section_name": section.name,
                "requires_class_pin": bool(group.require_class_pin),
                "people": people,
            }
        )


class GroupKioskClassVerifyPinView(OwnedWorkspaceMixin, APIView):
    """Verify Class PIN for Structured kiosk Class entry."""

    def post(self, request, group_pk, section_pk):
        group = (
            Group.objects.filter(pk=group_pk, organization=self.organization)
            .exclude(status=GroupStatus.ARCHIVED)
            .first()
        )
        if group is None:
            raise NotFound("Group not found in this workspace.")
        blocked = ensure_kiosk_launch_ready(group)
        if blocked:
            return Response(blocked, status=status.HTTP_409_CONFLICT)
        if group.group_type != GroupType.STRUCTURED:
            raise ValidationError({"group": "Class PIN applies only to Structured Groups."})

        section = get_active_kiosk_section(
            group=group,
            organization=self.organization,
            section_id=section_pk,
        )
        if section is None:
            raise NotFound("Class not found in this Group.")

        if not group.require_class_pin:
            return Response(
                {
                    "ok": True,
                    "section_id": section.id,
                    "section_name": section.name,
                }
            )

        pin = request.data.get("pin", "")
        if not section.check_class_pin(pin):
            return Response(
                {
                    "code": "invalid_class_pin",
                    "detail": "Incorrect PIN. Try again.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {
                "ok": True,
                "section_id": section.id,
                "section_name": section.name,
            }
        )


class GroupKioskIdentifyView(OwnedWorkspaceMixin, APIView):
    """
    Identify a participant for kiosk action selection.

    Input mode: Group Participant Code (+ optional second field).
    Card mode: selected participant card (+ optional PIN when kiosk use_pin is on).
    """

    def _resolve_card_participant(self, *, group, data):
        participant_kind = data.get("participant_kind")
        if participant_kind == "member":
            membership_id = data.get("membership_id")
            if not membership_id:
                raise ValidationError({"membership_id": "membership_id is required."})
            membership = (
                GroupMembership.objects.filter(
                    organization=self.organization,
                    group=group,
                    pk=membership_id,
                )
                .operational()
                .select_related("member")
                .first()
            )
            if membership is None:
                return None, None
            return "member", membership

        if participant_kind == "group_only_participant":
            participant_id = data.get("group_only_participant_id")
            if not participant_id:
                raise ValidationError(
                    {"group_only_participant_id": "group_only_participant_id is required."}
                )
            participant = GroupOnlyParticipant.objects.filter(
                organization=self.organization,
                group=group,
                status=GroupOnlyParticipantStatus.ACTIVE,
                pk=participant_id,
            ).first()
            if participant is None:
                return None, None
            return "group_only_participant", participant

        raise ValidationError({"participant_kind": "participant_kind is required for card mode."})

    def _verify_card_pin(self, *, settings_obj, participant_kind, obj, pin):
        if not settings_obj.use_pin:
            return True
        if not pin:
            raise ValidationError({"pin": "PIN is required for this kiosk."})
        if participant_kind == "member" and not obj.check_effective_pin(pin):
            return False
        if participant_kind == "group_only_participant" and not obj.check_pin(pin):
            return False
        return True

    def post(self, request, group_pk):
        group = (
            Group.objects.filter(pk=group_pk, organization=self.organization)
            .exclude(status=GroupStatus.ARCHIVED)
            .first()
        )
        if group is None:
            raise NotFound("Group not found in this workspace.")
        blocked = ensure_kiosk_launch_ready(group)
        if blocked:
            return Response(blocked, status=status.HTTP_409_CONFLICT)

        settings_obj = get_kiosk_settings_for_group(group)
        req_ser = KioskIdentifyRequestSerializer(data=request.data)
        req_ser.is_valid(raise_exception=True)
        data = req_ser.validated_data

        if settings_obj.mode == KioskType.CARD:
            participant_kind, obj = self._resolve_card_participant(group=group, data=data)
            if obj is None:
                return Response(
                    {"code": "not_found", "detail": "Selected participant is not available."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            pin = data.get("pin") or ""
            if not self._verify_card_pin(
                settings_obj=settings_obj,
                participant_kind=participant_kind,
                obj=obj,
                pin=pin,
            ):
                return Response(
                    {"code": "invalid_pin", "detail": "PIN verification failed."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            payload = build_kiosk_identify_payload(
                group=group,
                participant_kind=participant_kind,
                membership=obj if participant_kind == "member" else None,
                group_only_participant=obj if participant_kind == "group_only_participant" else None,
            )
            return Response(payload)

        if settings_obj.mode != KioskType.INPUT:
            raise ValidationError({"kiosk": "Unknown kiosk type."})

        code = normalize_participant_code(
            data.get("participant_code") or data.get("identifier")
        )
        if not code:
            raise ValidationError(
                {"participant_code": "Group Participant Code is required."}
            )

        kind, obj = find_by_participant_code(
            group=group,
            organization=self.organization,
            code=code,
        )
        if obj is None:
            return Response(
                {"code": "not_found", "detail": "No participant matches the provided code."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if settings_obj.input_field_count == 2:
            if not verify_second_field(
                settings=settings_obj,
                membership=obj if kind == "member" else None,
                participant=obj if kind == "group_only_participant" else None,
                data=data,
            ):
                if settings_obj.input_second_field == KioskInputSecondField.PIN:
                    return Response(
                        {"code": "invalid_pin", "detail": "PIN verification failed."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                return Response(
                    {"code": "not_found", "detail": "Verification failed."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        payload = build_kiosk_identify_payload(
            group=group,
            participant_kind=kind,
            membership=obj if kind == "member" else None,
            group_only_participant=obj if kind == "group_only_participant" else None,
        )
        return Response(payload)


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
        blocked = ensure_kiosk_launch_ready(group)
        if blocked:
            return Response(blocked, status=status.HTTP_409_CONFLICT)

        settings_obj = get_kiosk_settings_for_group(group)
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
                pk=membership_id,
            ).operational().select_related("member").first()
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

        # Card mode: verify PIN when kiosk settings require it after card selection.
        # Input mode with PIN as second field is verified during identify.
        needs_pin = (
            settings_obj.mode == KioskType.CARD
            and settings_obj.use_pin
        )
        if needs_pin:
            if not pin:
                raise ValidationError({"pin": "PIN is required for this kiosk."})
            if participant_kind == "member" and not membership.check_effective_pin(pin):
                raise ValidationError({"pin": "PIN verification failed."})
            if (
                participant_kind == "group_only_participant"
                and not group_only_participant.check_pin(pin)
            ):
                raise ValidationError({"pin": "PIN verification failed."})

        # Snapshot identity for history.
        if participant_kind == "member":
            snapshot = {
                "participant_name_snapshot": membership.effective_name,
                "participant_email_snapshot": membership.participation_email
                or membership.effective_email,
                "participant_check_in_identifier_snapshot": membership.group_participant_code,
            }
        else:
            snapshot = {
                "participant_name_snapshot": group_only_participant.name,
                "participant_email_snapshot": group_only_participant.email,
                "participant_check_in_identifier_snapshot": group_only_participant.group_participant_code,
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

        settings_obj = get_kiosk_settings_for_group(group)
        participant_name = snapshot["participant_name_snapshot"]
        confirmation = confirmation_payload_for_perform(
            settings_obj,
            group=group,
            action_type=action_type,
            participant_name=participant_name,
            performed_at=ar.performed_at,
        )

        return Response(
            {
                "code": "ok",
                "action_record": ActionRecordSerializer(ar).data,
                "confirmation": confirmation,
                "success_message": confirmation["message"],
                "return_delay_seconds": confirmation["return_delay_seconds"],
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


class WorkspaceHistoryReportGroupsView(OwnedWorkspaceMixin, APIView):
    """
    Groups available for Attendance Report selection (active, archived, deleted).
    """

    def get(self, request):
        return Response({"items": list_report_groups(organization=self.organization)})


class WorkspaceAttendanceReportView(OwnedWorkspaceMixin, APIView):
    """
    Aggregated attendance report for one Group over a date range.

    Response shape is export-ready: group meta, date range, columns, and rows.
    """

    def get(self, request):
        query = AttendanceReportQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data

        try:
            report = build_attendance_report(
                organization=self.organization,
                source_group_id=data["source_group_id"],
                preset=data["preset"],
                date_from=data.get("date_from"),
                date_to=data.get("date_to"),
                timezone_name=data.get("timezone"),
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        if report is None:
            raise NotFound("Group not found for attendance report in this workspace.")

        return Response(report)


class WorkspaceAttendanceReportExportView(OwnedWorkspaceMixin, APIView):
    """
    Export the Attendance Report for the same filters as the report view.

    Uses build_attendance_report() — not a separate attendance calculation.
    """

    def get(self, request):
        query = AttendanceReportExportQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data

        try:
            report = build_attendance_report(
                organization=self.organization,
                source_group_id=data["source_group_id"],
                preset=data["preset"],
                date_from=data.get("date_from"),
                date_to=data.get("date_to"),
                timezone_name=data.get("timezone"),
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        if report is None:
            raise NotFound("Group not found for attendance report in this workspace.")

        if not report.get("sections"):
            raise ValidationError(
                {"detail": "No attendance rows available to export for this selection."}
            )

        try:
            rendered = render_attendance_report_export(
                report=report,
                export_format=data["export_format"],
                organization=self.organization,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        except FileNotFoundError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        response = HttpResponse(
            rendered["content"],
            content_type=rendered["content_type"],
        )
        response["Content-Disposition"] = f'attachment; filename="{rendered["filename"]}"'
        return response


class GroupKioskExitView(APIView):
    """
    Clear the app-session kiosk lock after the Group kiosk exit code is verified.

    Wrong codes leave the lock in place. Verification is server-side against the
    locked Group's KioskSettings exit code hash.
    """

    permission_classes = [IsAuthenticated]

    SESSION_EXIT_ATTEMPTS = "kiosk_exit_attempt_timestamps"

    def _rate_limited(self, request):
        import time

        now = time.time()
        window = 60
        max_attempts = 15
        stamps = [t for t in request.session.get(self.SESSION_EXIT_ATTEMPTS, []) if now - t < window]
        if len(stamps) >= max_attempts:
            return True
        stamps.append(now)
        request.session[self.SESSION_EXIT_ATTEMPTS] = stamps
        request.session.modified = True
        return False

    def post(self, request):
        from attendance.kiosk_lock import locked_group_id
        from organizations.permissions import get_active_workspace_organization

        actor = request.user
        if customer_must_verify_email(actor):
            raise EmailNotVerified()

        exit_code = str(request.data.get("exit_code") or "").strip()
        if not exit_code:
            return Response({"detail": "Exit code is required."}, status=400)

        if self._rate_limited(request):
            return Response(
                {"detail": "Too many attempts. Wait a moment and try again."},
                status=429,
            )

        group_id = locked_group_id(request)
        if not group_id:
            clear_kiosk_lock(request)
            payload = {"ok": True}
            payload.update(kiosk_status_payload(request))
            return Response(payload)

        organization = get_active_workspace_organization(actor)
        if organization is None:
            return Response({"detail": "Workspace not found."}, status=403)

        group = Group.objects.filter(pk=group_id, organization=organization).first()
        if group is None:
            return Response({"detail": "Kiosk Group is not available."}, status=403)

        settings_obj = ensure_group_kiosk_settings(group)
        if not settings_obj.check_exit_code(exit_code):
            return Response({"detail": "Exit code verification failed."}, status=403)

        clear_kiosk_lock(request)
        request.session.pop(self.SESSION_EXIT_ATTEMPTS, None)
        request.session.modified = True
        payload = {"ok": True}
        payload.update(kiosk_status_payload(request))
        return Response(payload)

