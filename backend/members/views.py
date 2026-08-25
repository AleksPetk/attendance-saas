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
from organizations.entitlements import LIMIT_MEMBERS
from organizations.entitlements.api import deny_plan_capacity, raise_plan_denied
from organizations.entitlements.exceptions import PlanEntitlementDenied
from organizations.entitlements.plan_locks import (
    order_members_queryset_by_plan_availability,
    require_member_plan_unlocked,
    require_no_unresolved_member_selection,
)
from organizations.permissions import (
    CanManageWorkspace,
    CanViewWorkspace,
    get_active_workspace_organization,
)


def _deny_locked_member(member):
    try:
        require_member_plan_unlocked(member)
    except PlanEntitlementDenied as exc:
        raise_plan_denied(exc)


def _deny_unresolved_member_selection(organization):
    try:
        require_no_unresolved_member_selection(organization)
    except PlanEntitlementDenied as exc:
        raise_plan_denied(exc)


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
        if self.action == "list":
            queryset = order_members_queryset_by_plan_availability(queryset)
        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["organization"] = self.organization
        return context

    def retrieve(self, request, *args, **kwargs):
        member = self.get_object()
        if member.status == MemberStatus.ACTIVE:
            _deny_locked_member(member)
        return super().retrieve(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        _deny_unresolved_member_selection(self.organization)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        member = self.get_object()
        _deny_unresolved_member_selection(self.organization)
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
        _deny_locked_member(member)
        return super().update(request, *args, **kwargs)

    def perform_destroy(self, instance):
        instance.archive()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        _deny_unresolved_member_selection(self.organization)
        _deny_locked_member(instance)
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
        _deny_unresolved_member_selection(self.organization)
        _deny_locked_member(member)
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
        _deny_unresolved_member_selection(self.organization)
        if member.status != MemberStatus.ARCHIVED:
            return Response(
                {
                    "code": "not_archived",
                    "detail": "Only archived Members can be restored.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        deny_plan_capacity(self.organization, LIMIT_MEMBERS)
        member.plan_unlocked = True
        member.save(update_fields=["plan_unlocked", "updated_at"])
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
