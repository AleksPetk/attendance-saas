"""Workspace Saved Sender template API. Templates are not linked to Groups."""

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from groups.email_sender_models import EmailSenderProviderKind, SmtpSecurity
from groups.saved_email_senders import (
    SAVED_SENDER_NAME_EXISTS,
    SavedSenderNameExists,
    create_saved_email_sender,
    delete_saved_email_sender,
    list_saved_email_senders,
    saved_sender_public_payload,
)
from organizations.permissions import (
    CanManageGroupConfiguration,
    get_active_workspace_organization,
)


class SavedEmailSenderWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    replace = serializers.BooleanField(required=False, default=False)
    provider = serializers.ChoiceField(choices=EmailSenderProviderKind.choices)
    smtp_host = serializers.CharField(required=False, allow_blank=True, max_length=255)
    smtp_port = serializers.IntegerField(
        required=False, allow_null=True, min_value=1, max_value=65535
    )
    smtp_security = serializers.ChoiceField(
        choices=SmtpSecurity.choices,
        required=False,
        allow_blank=True,
    )
    smtp_username = serializers.CharField(required=False, allow_blank=True, max_length=255)
    smtp_password = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
        max_length=255,
        style={"input_type": "password"},
    )
    gmail_address = serializers.EmailField(required=False, allow_blank=True)
    microsoft_email = serializers.EmailField(required=False, allow_blank=True)
    yahoo_email = serializers.EmailField(required=False, allow_blank=True)
    from_email = serializers.EmailField(required=False, allow_blank=True)
    from_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    saved_sender_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    source_group_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)


class SavedEmailSenderListCreateView(APIView):
    http_method_names = ["get", "post", "head", "options"]

    def get_permissions(self):
        return [CanManageGroupConfiguration()]

    def get(self, request):
        organization = get_active_workspace_organization(request.user)
        if organization is None:
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        senders = list_saved_email_senders(organization)
        return Response(
            {"results": [saved_sender_public_payload(sender) for sender in senders]}
        )

    def post(self, request):
        organization = get_active_workspace_organization(request.user)
        if organization is None:
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        serializer = SavedEmailSenderWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            sender = create_saved_email_sender(
                organization=organization,
                name=data["name"],
                replace=bool(data.get("replace")),
                provider=data["provider"],
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
                saved_sender_id=data.get("saved_sender_id"),
                source_group_id=data.get("source_group_id"),
            )
        except SavedSenderNameExists as exc:
            return Response(
                {
                    "code": SAVED_SENDER_NAME_EXISTS,
                    "detail": "A saved sender with this name already exists.",
                    "name": exc.name,
                },
                status=status.HTTP_409_CONFLICT,
            )
        except DjangoValidationError as exc:
            detail = getattr(exc, "message_dict", None) or {"detail": exc.messages}
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)
        created = not bool(data.get("replace"))
        return Response(
            saved_sender_public_payload(sender),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class SavedEmailSenderDetailView(APIView):
    http_method_names = ["delete", "head", "options"]

    def get_permissions(self):
        return [CanManageGroupConfiguration()]

    def delete(self, request, pk):
        organization = get_active_workspace_organization(request.user)
        if organization is None:
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        deleted = delete_saved_email_sender(
            organization=organization,
            saved_sender_id=pk,
        )
        if not deleted:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
