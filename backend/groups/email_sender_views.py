"""API views for Group email sender configuration."""

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from groups.email_sender import (
    email_sender_public_payload,
    get_group_email_sender,
    save_group_email_sender,
    send_group_email_sender_test,
)
from groups.email_sender_serializers import (
    GroupEmailSenderSerializer,
    GroupEmailSenderTestSerializer,
)
from groups.models import Group, GroupStatus
from groups.operations import group_archived_error_payload
from organizations.permissions import (
    CanManageWorkspace,
    CanViewWorkspace,
    get_active_workspace_organization,
)


class GroupScopedEmailSenderMixin:
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.organization = get_active_workspace_organization(request.user)

    def get_group(self):
        group = Group.objects.filter(
            pk=self.kwargs["group_pk"],
            organization=self.organization,
        ).first()
        if group is None:
            return None
        return group


class GroupEmailSenderView(GroupScopedEmailSenderMixin, APIView):
    http_method_names = ["get", "put", "patch", "head", "options"]

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [CanViewWorkspace()]
        return [CanManageWorkspace()]

    def get(self, request, group_pk):
        group = self.get_group()
        if group is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        sender = get_group_email_sender(group)
        return Response(email_sender_public_payload(sender))

    def put(self, request, group_pk):
        return self._save(request, group_pk)

    def patch(self, request, group_pk):
        return self._save(request, group_pk)

    def _save(self, request, group_pk):
        group = self.get_group()
        if group is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if group.status == GroupStatus.ARCHIVED:
            return Response(
                group_archived_error_payload(),
                status=status.HTTP_409_CONFLICT,
            )
        serializer = GroupEmailSenderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            sender = save_group_email_sender(
                group=group,
                request=request,
                provider=data.get("provider"),
                smtp_host=data.get("smtp_host"),
                smtp_port=data.get("smtp_port"),
                smtp_security=data.get("smtp_security"),
                smtp_username=data.get("smtp_username"),
                from_email=data.get("from_email"),
                from_name=data.get("from_name"),
                gmail_address=data.get("gmail_address"),
                microsoft_email=data.get("microsoft_email"),
                yahoo_email=data.get("yahoo_email"),
                smtp_password=data.get("smtp_password") or None,
                change_password=bool(data.get("change_password")),
            )
        except DjangoValidationError as exc:
            detail = getattr(exc, "message_dict", None) or {"detail": exc.messages}
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)
        return Response(email_sender_public_payload(sender))


class GroupEmailSenderTestView(GroupScopedEmailSenderMixin, APIView):
    http_method_names = ["post", "head", "options"]

    def get_permissions(self):
        return [CanManageWorkspace()]

    def post(self, request, group_pk):
        group = self.get_group()
        if group is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if group.status == GroupStatus.ARCHIVED:
            return Response(
                group_archived_error_payload(),
                status=status.HTTP_409_CONFLICT,
            )
        serializer = GroupEmailSenderTestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        draft = serializer.draft_payload()
        try:
            sender = send_group_email_sender_test(
                group=group,
                to_email=serializer.validated_data["to_email"],
                request=request,
                draft=draft,
            )
        except DjangoValidationError as exc:
            detail = getattr(exc, "message_dict", None) or {"detail": exc.messages}
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)
        payload = {
            "detail": "Test email sent.",
            "draft_verified": draft is not None,
            "email_sender": email_sender_public_payload(sender),
        }
        if draft is not None:
            payload["detail"] = (
                "Test email sent. Save the sender to make this configuration active."
            )
        return Response(payload)
