from django.db.models import Count, Q
from rest_framework import status, viewsets
from rest_framework.exceptions import NotFound
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.response import Response

from groups.models import (
    Group,
    GroupMembership,
    GroupMembershipStatus,
    GroupOnlyParticipant,
    GroupOnlyParticipantStatus,
    GroupStatus,
)
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
                filter=Q(memberships__status=GroupMembershipStatus.ACTIVE),
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
        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["organization"] = self.organization
        return context

    def perform_destroy(self, instance):
        instance.archive()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)


class GroupScopedMixin(OwnedWorkspaceMixin):
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.group = (
            Group.objects.filter(
                pk=self.kwargs["group_pk"],
                organization=self.organization,
            )
            .exclude(status=GroupStatus.ARCHIVED)
            .first()
        )
        if self.group is None:
            # Archived groups remain readable via GroupViewSet, but nested
            # writes stay limited to the owner's active groups.
            self.group = Group.objects.filter(
                pk=self.kwargs["group_pk"],
                organization=self.organization,
            ).first()
        if self.group is None:
            raise NotFound("Group not found in this workspace.")

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
                status=GroupMembershipStatus.ACTIVE,
            )
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
