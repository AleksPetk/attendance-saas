import os

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from core.images import (
    optimize_kiosk_background,
    optimize_kiosk_logo,
)
from groups.models import Group, GroupStatus
from kiosk_builder.config_schema import default_config
from kiosk_builder.models import (
    KioskDesign,
    ensure_group_kiosk_design,
    ensure_group_kiosk_settings,
)
from kiosk_builder.kiosk_settings_serializers import KioskSettingsSerializer
from kiosk_builder.kiosk_settings_validation import repair_kiosk_settings_for_group_capabilities
from kiosk_builder.presets import PRESET_CATALOG
from kiosk_builder.serializers import KioskDesignSerializer
from organizations.permissions import (
    CanManageWorkspace,
    CanUseKioskAndViewHistory,
    get_active_workspace_organization,
)


ALLOWED_IMAGE_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB


def _validate_image_file(file_obj, field_name):
    if file_obj.size > MAX_IMAGE_SIZE:
        raise ValidationError({field_name: f"Image must be under {MAX_IMAGE_SIZE // (1024*1024)} MB."})
    ct = getattr(file_obj, "content_type", "")
    if ct not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise ValidationError({field_name: f"Unsupported image type '{ct}'."})


def _safe_delete_file(field_file):
    """Delete a stored file, ignoring missing-file errors."""
    if not field_file:
        return
    name = field_file.name
    if not name:
        return
    try:
        field_file.delete(save=False)
    except Exception:
        pass


class GroupKioskDesignView(APIView):
    """
    GET  — return the Group's kiosk design (auto-creates with defaults if missing).
    PUT  — save the full kiosk design config + optional image uploads.
    """

    parser_classes = [MultiPartParser, JSONParser]

    def get_permissions(self):
        if self.request.method == "GET":
            return [CanUseKioskAndViewHistory()]
        return [CanManageWorkspace()]

    def _get_group(self, request, group_pk):
        org = get_active_workspace_organization(request.user)
        if org is None:
            raise NotFound("Workspace not found.")
        group = (
            Group.objects.filter(pk=group_pk, organization=org)
            .exclude(status=GroupStatus.ARCHIVED)
            .first()
        )
        if group is None:
            raise NotFound("Group not found in this workspace.")
        return org, group

    def get(self, request, group_pk):
        org, group = self._get_group(request, group_pk)
        design = ensure_group_kiosk_design(group)
        serializer = KioskDesignSerializer(design, context={"request": request})
        return Response(serializer.data)

    def put(self, request, group_pk):
        org, group = self._get_group(request, group_pk)
        design, created = KioskDesign.objects.get_or_create(
            group=group,
            defaults={"organization": org, "config": default_config()},
        )

        config = request.data.get("config")
        if config is not None:
            if isinstance(config, str):
                try:
                    import json
                    config = json.loads(config)
                except (json.JSONDecodeError, TypeError):
                    raise ValidationError({"config": "Invalid JSON."})
            serializer = KioskDesignSerializer(data={"config": config}, partial=True)
            serializer.is_valid(raise_exception=True)
            design.config = serializer.validated_data["config"]

        remove_logo = request.data.get("remove_header_logo") in (True, "true", "True", "1")
        remove_footer_logo = request.data.get("remove_footer_logo") in (True, "true", "True", "1")
        remove_bg = request.data.get("remove_main_background_image") in (True, "true", "True", "1")

        old_logo_name = design.header_logo.name if design.header_logo else ""
        old_footer_logo_name = design.footer_logo.name if design.footer_logo else ""
        old_bg_name = design.main_background_image.name if design.main_background_image else ""

        new_logo = request.FILES.get("header_logo")
        new_footer_logo = request.FILES.get("footer_logo")
        new_bg = request.FILES.get("main_background_image")

        if new_logo:
            _validate_image_file(new_logo, "header_logo")
            optimized = optimize_kiosk_logo(new_logo, stem="logo")
            design.header_logo = optimized
        elif remove_logo:
            design.header_logo = ""

        if new_footer_logo:
            _validate_image_file(new_footer_logo, "footer_logo")
            optimized = optimize_kiosk_logo(new_footer_logo, stem="footer-logo")
            design.footer_logo = optimized
        elif remove_footer_logo:
            design.footer_logo = ""

        if new_bg:
            _validate_image_file(new_bg, "main_background_image")
            optimized = optimize_kiosk_background(new_bg, stem="background")
            design.main_background_image = optimized
        elif remove_bg:
            design.main_background_image = ""

        try:
            design.save()
        except DjangoValidationError as exc:
            raise ValidationError(getattr(exc, "message_dict", exc.messages)) from exc

        # Refresh names after save — only delete truly superseded paths.
        new_logo_name = design.header_logo.name if design.header_logo else ""
        new_footer_logo_name = design.footer_logo.name if design.footer_logo else ""
        new_bg_name = (
            design.main_background_image.name if design.main_background_image else ""
        )

        if new_logo and old_logo_name and old_logo_name != new_logo_name:
            _safe_delete_old_file(old_logo_name)
        elif remove_logo and old_logo_name:
            _safe_delete_old_file(old_logo_name)

        if (
            new_footer_logo
            and old_footer_logo_name
            and old_footer_logo_name != new_footer_logo_name
        ):
            _safe_delete_old_file(old_footer_logo_name)
        elif remove_footer_logo and old_footer_logo_name:
            _safe_delete_old_file(old_footer_logo_name)

        if new_bg and old_bg_name and old_bg_name != new_bg_name:
            _safe_delete_old_file(old_bg_name)
        elif remove_bg and old_bg_name:
            _safe_delete_old_file(old_bg_name)

        result = KioskDesignSerializer(design, context={"request": request})
        return Response(result.data)


def _safe_delete_old_file(name):
    from django.core.files.storage import default_storage
    try:
        if name and default_storage.exists(name):
            default_storage.delete(name)
    except Exception:
        pass


class GroupKioskSettingsView(APIView):
    """
    GET  — return Group kiosk behavioral settings + readiness.
    PATCH — update settings; optional exit_code + exit_code_confirm.
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [CanUseKioskAndViewHistory()]
        return [CanManageWorkspace()]

    def _get_group(self, request, group_pk):
        org = get_active_workspace_organization(request.user)
        if org is None:
            raise NotFound("Workspace not found.")
        group = (
            Group.objects.filter(pk=group_pk, organization=org)
            .exclude(status=GroupStatus.ARCHIVED)
            .first()
        )
        if group is None:
            raise NotFound("Group not found in this workspace.")
        return org, group

    def get(self, request, group_pk):
        _org, group = self._get_group(request, group_pk)
        settings_obj = ensure_group_kiosk_settings(group)
        repair_kiosk_settings_for_group_capabilities(settings_obj, group=group, save=True)
        serializer = KioskSettingsSerializer(settings_obj, context={"request": request})
        payload = serializer.data
        payload["group_id"] = group.pk
        payload["group_name"] = group.name
        return Response(payload)

    def patch(self, request, group_pk):
        _org, group = self._get_group(request, group_pk)
        settings_obj = ensure_group_kiosk_settings(group)
        serializer = KioskSettingsSerializer(
            settings_obj,
            data=request.data,
            partial=True,
            context={"request": request, "group": group},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        payload = serializer.data
        payload["group_id"] = group.pk
        payload["group_name"] = group.name
        return Response(payload)


class GroupKioskResetNowView(APIView):
    """
    POST — immediately start a fresh operational attendance cycle for all participants.

    Persists manual_reset_at on KioskSettings. Does not modify ActionRecords or
    scheduled Daily/Rolling configuration.
    """

    permission_classes = [CanManageWorkspace]

    def _get_group(self, request, group_pk):
        org = get_active_workspace_organization(request.user)
        if org is None:
            raise NotFound("Workspace not found.")
        group = (
            Group.objects.filter(pk=group_pk, organization=org)
            .exclude(status=GroupStatus.ARCHIVED)
            .first()
        )
        if group is None:
            raise NotFound("Group not found in this workspace.")
        return org, group

    def post(self, request, group_pk):
        _org, group = self._get_group(request, group_pk)
        settings_obj = ensure_group_kiosk_settings(group)
        settings_obj.manual_reset_at = timezone.now()
        settings_obj.save(update_fields=["manual_reset_at", "updated_at"])
        return Response(
            {
                "manual_reset_at": settings_obj.manual_reset_at,
                "message": "Attendance cycle reset for this Group.",
            }
        )


class KioskPresetListView(APIView):
    """Return the full preset catalog for the builder UI."""

    permission_classes = [CanUseKioskAndViewHistory]

    def get(self, request):
        return Response(PRESET_CATALOG)
