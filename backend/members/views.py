from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from members.deletion import (
    PermanentMemberDeletionError,
    permanently_delete_member,
)
from members.models import Member, MemberStatus
from members.serializers import MemberListQuerySerializer, MemberSerializer
from organizations.permissions import (
    CanManageWorkspace,
    CanViewWorkspace,
    get_active_workspace_organization,
)


class MemberViewSet(viewsets.ModelViewSet):
    serializer_class = MemberSerializer
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [CanViewWorkspace()]
        return [CanManageWorkspace()]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.organization = get_active_workspace_organization(request.user)

    def get_queryset(self):
        queryset = Member.objects.filter(organization=self.organization)
        query = MemberListQuerySerializer(data=self.request.query_params)
        query.is_valid(raise_exception=False)
        status_filter = query.validated_data.get("status", "active")
        if self.action in ("list",) and status_filter != "all":
            queryset = queryset.filter(status=status_filter)
        search = (query.validated_data.get("search") or "").strip()
        if search and self.action == "list":
            lookup = (
                Q(name__icontains=search)
                | Q(email__icontains=search)
                | Q(phone__icontains=search)
                | Q(address__icontains=search)
            )
            id_token = search.lstrip("#").strip()
            if id_token.isdigit():
                lookup |= Q(pk=int(id_token))
            queryset = queryset.filter(lookup)
        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["organization"] = self.organization
        return context

    def update(self, request, *args, **kwargs):
        member = self.get_object()
        if member.status == MemberStatus.ARCHIVED:
            return Response(
                {
                    "code": "member_archived",
                    "detail": (
                        "Archived Members cannot be edited. Restore the Member first."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )
        return super().update(request, *args, **kwargs)

    def perform_destroy(self, instance):
        instance.archive()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == MemberStatus.ARCHIVED:
            return Response(
                {
                    "code": "member_archived",
                    "detail": (
                        "Archived Members cannot be edited this way. "
                        "Restore the Member or permanently delete it."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        member = self.get_object()
        if member.status == MemberStatus.ARCHIVED:
            return Response(
                {
                    "code": "already_archived",
                    "detail": "This Member is already archived.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        member.archive()
        serializer = self.get_serializer(member)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        member = self.get_object()
        if member.status != MemberStatus.ARCHIVED:
            return Response(
                {
                    "code": "not_archived",
                    "detail": "Only archived Members can be restored.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        member.restore()
        serializer = self.get_serializer(member)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="permanently-delete")
    def permanently_delete(self, request, pk=None):
        member = self.get_object()
        try:
            permanently_delete_member(member)
        except PermanentMemberDeletionError as exc:
            return Response(
                {
                    "code": "member_not_archived",
                    "detail": exc.messages[0] if exc.messages else str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
