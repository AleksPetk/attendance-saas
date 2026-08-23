from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models import Count, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.response import Response

from groups.deletion import (
    PermanentGroupDeletionError,
    permanently_delete_group,
)
from groups.models import (
    Group,
    GroupMembership,
    GroupMembershipStatus,
    GroupOnlyParticipant,
    GroupOnlyParticipantStatus,
    GroupStatus,
)
from groups.operations import group_archived_error_payload
from groups.serializers import (
    AvailableMemberSerializer,
    GroupListQuerySerializer,
    GroupMembershipSerializer,
    GroupOnlyParticipantSerializer,
    GroupSerializer,
    available_member_payload,
)
from members.models import Member, MemberStatus
from organizations.permissions import (
    CanManageWorkspace,
    CanViewWorkspace,
    get_active_workspace_organization,
)

class OwnedWorkspaceMixin:
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.organization = get_active_workspace_organization(request.user)


class GroupViewSet(OwnedWorkspaceMixin, viewsets.ModelViewSet):
    serializer_class = GroupSerializer
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [CanViewWorkspace()]
        return [CanManageWorkspace()]

    def get_queryset(self):
        queryset = Group.objects.filter(organization=self.organization).annotate(
            member_count=Count(
                "memberships",
                filter=Q(
                    memberships__status=GroupMembershipStatus.ACTIVE,
                    memberships__member__status=MemberStatus.ACTIVE,
                ),
                distinct=True,
            ),
            group_only_participant_count=Count(
                "group_only_participants",
                filter=Q(
                    group_only_participants__status=GroupOnlyParticipantStatus.ACTIVE
                ),
                distinct=True,
            ),
        )
        query = GroupListQuerySerializer(data=self.request.query_params)
        query.is_valid(raise_exception=False)
        status_filter = query.validated_data.get("status", "active")
        if self.action == "list" and status_filter != "all":
            queryset = queryset.filter(status=status_filter)
        search = (query.validated_data.get("search") or "").strip()
        if search and self.action == "list":
            queryset = queryset.filter(name__icontains=search)
        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["organization"] = self.organization
        return context

    def update(self, request, *args, **kwargs):
        group = self.get_object()
        if group.status == GroupStatus.ARCHIVED:
            return Response(
                group_archived_error_payload(),
                status=status.HTTP_409_CONFLICT,
            )
        return super().update(request, *args, **kwargs)

    def perform_destroy(self, instance):
        instance.archive()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == GroupStatus.ARCHIVED:
            return Response(
                group_archived_error_payload(
                    "Archived Groups cannot be edited this way. "
                    "Restore the Group or permanently delete it."
                ),
                status=status.HTTP_409_CONFLICT,
            )
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        group = self.get_object()
        if group.status == GroupStatus.ARCHIVED:
            return Response(
                {
                    "code": "already_archived",
                    "detail": "This Group is already archived.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        group.archive()
        serializer = self.get_serializer(group)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        group = self.get_object()
        if group.status != GroupStatus.ARCHIVED:
            return Response(
                {
                    "code": "not_archived",
                    "detail": "Only archived Groups can be restored.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            group.restore()
        except (DjangoValidationError, IntegrityError):
            return Response(
                {
                    "code": "group_name_conflict",
                    "detail": "A Group with this name already exists in this workspace.",
                },
                status=status.HTTP_409_CONFLICT,
            )
        serializer = self.get_serializer(group)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="permanently-delete")
    def permanently_delete(self, request, pk=None):
        group = self.get_object()
        try:
            permanently_delete_group(group)
        except PermanentGroupDeletionError as exc:
            return Response(
                {
                    "code": "group_not_archived",
                    "detail": exc.messages[0] if exc.messages else str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class GroupScopedMixin(OwnedWorkspaceMixin):
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.group = Group.objects.filter(
            pk=self.kwargs["group_pk"],
            organization=self.organization,
        ).first()
        if self.group is None:
            raise NotFound("Group not found in this workspace.")
        if self.group.status == GroupStatus.ARCHIVED and request.method not in (
            "GET",
            "HEAD",
            "OPTIONS",
        ):
            from rest_framework.exceptions import APIException

            class ArchivedGroupMutation(APIException):
                status_code = 409
                default_code = "group_archived"

            raise ArchivedGroupMutation(
                detail=group_archived_error_payload(
                    "Archived Groups cannot be changed. Restore the Group first."
                )["detail"]
            )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["organization"] = self.organization
        context["group"] = self.group
        return context


class GroupMembershipListCreateView(GroupScopedMixin, ListCreateAPIView):
    serializer_class = GroupMembershipSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [CanViewWorkspace()]
        return [CanManageWorkspace()]

    def get_queryset(self):
        return (
            GroupMembership.objects.filter(
                organization=self.organization,
                group=self.group,
            )
            .operational()
            .select_related("member", "group")
        )


class GroupMembershipDetailView(GroupScopedMixin, RetrieveUpdateDestroyAPIView):
    serializer_class = GroupMembershipSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [CanViewWorkspace()]
        return [CanManageWorkspace()]

    def get_queryset(self):
        return GroupMembership.objects.filter(
            organization=self.organization,
            group=self.group,
        ).select_related("member", "group")

    def perform_destroy(self, instance):
        instance.deactivate()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)


class GroupOnlyParticipantListCreateView(GroupScopedMixin, ListCreateAPIView):
    serializer_class = GroupOnlyParticipantSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [CanViewWorkspace()]
        return [CanManageWorkspace()]

    def get_queryset(self):
        return GroupOnlyParticipant.objects.filter(
            organization=self.organization,
            group=self.group,
            status=GroupOnlyParticipantStatus.ACTIVE,
        )


class GroupOnlyParticipantDetailView(GroupScopedMixin, RetrieveUpdateDestroyAPIView):
    serializer_class = GroupOnlyParticipantSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [CanViewWorkspace()]
        return [CanManageWorkspace()]

    def get_queryset(self):
        return GroupOnlyParticipant.objects.filter(
            organization=self.organization,
            group=self.group,
        )

    def perform_destroy(self, instance):
        instance.archive()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)


class GroupAvailableMembersView(GroupScopedMixin, ListAPIView):
    serializer_class = AvailableMemberSerializer

    def get_permissions(self):
        return [CanViewWorkspace()]

    def get_queryset(self):
        already_in_group = GroupMembership.objects.filter(
            group=self.group,
            status=GroupMembershipStatus.ACTIVE,
        ).values("member_id")
        return Member.objects.filter(
            organization=self.organization,
            status=MemberStatus.ACTIVE,
        ).exclude(pk__in=already_in_group)

    def list(self, request, *args, **kwargs):
        payload = [
            available_member_payload(member, self.group, request)
            for member in self.get_queryset()
        ]
        serializer = self.get_serializer(payload, many=True)
        return Response(serializer.data)
