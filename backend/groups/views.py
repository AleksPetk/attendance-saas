from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models import Count, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

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
    GroupSection,
    GroupSectionStatus,
    GroupStatus,
    GroupType,
)
from groups.operations import group_archived_error_payload
from groups.section_deletion import (
    PermanentSectionDeletionError,
    permanently_delete_section,
)
from groups.serializers import (
    AvailableMemberSerializer,
    GroupListQuerySerializer,
    GroupMembershipSerializer,
    GroupOnlyParticipantSerializer,
    GroupSectionSerializer,
    GroupSerializer,
    StandardGroupImportSerializer,
    available_member_payload,
)
from groups.standard_group_import import (
    StandardGroupImportError,
    import_standard_group_as_class,
    list_standard_import_sources,
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
                )
                & (
                    Q(
                        group_type=GroupType.STANDARD,
                        memberships__section__isnull=True,
                    )
                    | Q(
                        group_type=GroupType.STRUCTURED,
                        memberships__section__isnull=False,
                        memberships__section__status=GroupSectionStatus.ACTIVE,
                    )
                ),
                distinct=True,
            ),
            group_only_participant_count=Count(
                "group_only_participants",
                filter=Q(
                    group_only_participants__status=GroupOnlyParticipantStatus.ACTIVE,
                )
                & (
                    Q(
                        group_type=GroupType.STANDARD,
                        group_only_participants__section__isnull=True,
                    )
                    | Q(
                        group_type=GroupType.STRUCTURED,
                        group_only_participants__section__isnull=False,
                        group_only_participants__section__status=GroupSectionStatus.ACTIVE,
                    )
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
        if self.group.group_type == GroupType.STRUCTURED and self.context_section() is None:
            return GroupMembership.objects.none()
        queryset = (
            GroupMembership.objects.filter(
                organization=self.organization,
                group=self.group,
            )
            .operational()
            .select_related("member", "group", "section")
        )
        section = self.context_section()
        if section is not None:
            queryset = queryset.filter(section=section)
        return queryset

    def context_section(self):
        return getattr(self, "section", None)

    def create(self, request, *args, **kwargs):
        if self.group.group_type == GroupType.STRUCTURED and self.context_section() is None:
            return Response(
                {
                    "code": "structured_requires_class",
                    "detail": (
                        "Add participants inside a Class for Structured Groups."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().create(request, *args, **kwargs)


class GroupMembershipDetailView(GroupScopedMixin, RetrieveUpdateDestroyAPIView):
    serializer_class = GroupMembershipSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [CanViewWorkspace()]
        return [CanManageWorkspace()]

    def get_queryset(self):
        queryset = GroupMembership.objects.filter(
            organization=self.organization,
            group=self.group,
        ).select_related("member", "group", "section")
        section = getattr(self, "section", None)
        if section is not None:
            queryset = queryset.filter(section=section)
        return queryset

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
        if self.group.group_type == GroupType.STRUCTURED and getattr(self, "section", None) is None:
            return GroupOnlyParticipant.objects.none()
        queryset = GroupOnlyParticipant.objects.filter(
            organization=self.organization,
            group=self.group,
        ).operational()
        section = getattr(self, "section", None)
        if section is not None:
            queryset = queryset.filter(section=section)
        return queryset

    def create(self, request, *args, **kwargs):
        if self.group.group_type == GroupType.STRUCTURED and getattr(self, "section", None) is None:
            return Response(
                {
                    "code": "structured_requires_class",
                    "detail": (
                        "Add participants inside a Class for Structured Groups."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().create(request, *args, **kwargs)


class GroupOnlyParticipantDetailView(GroupScopedMixin, RetrieveUpdateDestroyAPIView):
    serializer_class = GroupOnlyParticipantSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [CanViewWorkspace()]
        return [CanManageWorkspace()]

    def get_queryset(self):
        queryset = GroupOnlyParticipant.objects.filter(
            organization=self.organization,
            group=self.group,
        )
        section = getattr(self, "section", None)
        if section is not None:
            queryset = queryset.filter(section=section)
        return queryset

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


class SectionScopedMixin(GroupScopedMixin):
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if self.group.group_type != GroupType.STRUCTURED:
            raise NotFound("Classes are only available on Structured Groups.")
        self.section = GroupSection.objects.filter(
            pk=self.kwargs["section_pk"],
            group=self.group,
            organization=self.organization,
        ).first()
        if self.section is None:
            raise NotFound("Class not found in this Group.")
        if self.section.status == GroupSectionStatus.ARCHIVED and request.method not in (
            "GET",
            "HEAD",
            "OPTIONS",
        ):
            from rest_framework.exceptions import APIException

            class ArchivedSectionMutation(APIException):
                status_code = 409
                default_code = "section_archived"

            raise ArchivedSectionMutation(
                detail="Archived Classes cannot be changed. Restore the Class first."
            )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["section"] = self.section
        return context


class GroupSectionListCreateView(GroupScopedMixin, ListCreateAPIView):
    serializer_class = GroupSectionSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [CanViewWorkspace()]
        return [CanManageWorkspace()]

    def get_queryset(self):
        if self.group.group_type != GroupType.STRUCTURED:
            return GroupSection.objects.none()
        queryset = GroupSection.objects.filter(
            organization=self.organization,
            group=self.group,
        ).annotate(
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
        status_filter = (self.request.query_params.get("status") or "active").strip()
        if status_filter != "all":
            queryset = queryset.filter(status=status_filter)
        return queryset

    def create(self, request, *args, **kwargs):
        if self.group.group_type != GroupType.STRUCTURED:
            return Response(
                {
                    "code": "standard_group_no_classes",
                    "detail": "Classes can only be created inside Structured Groups.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().create(request, *args, **kwargs)


class GroupSectionImportSourcesView(GroupScopedMixin, APIView):
    """List active Standard Groups that can be snapshotted into a Class."""

    def get_permissions(self):
        return [CanViewWorkspace()]

    def get(self, request, group_pk):
        if self.group.group_type != GroupType.STRUCTURED:
            return Response(
                {
                    "code": "destination_not_structured",
                    "detail": "Only Structured Groups can import a Standard Group as a Class.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        sources = list_standard_import_sources(
            organization=self.organization,
            destination_group=self.group,
        )
        payload = []
        for source in sources:
            member_count = (
                GroupMembership.objects.filter(group=source).operational().count()
            )
            visitor_count = (
                GroupOnlyParticipant.objects.filter(group=source).operational().count()
            )
            payload.append(
                {
                    "id": source.id,
                    "name": source.name,
                    "group_type": source.group_type,
                    "participant_count": member_count + visitor_count,
                    "member_count": member_count,
                    "visitor_count": visitor_count,
                }
            )
        return Response(payload)


class GroupSectionImportStandardGroupView(GroupScopedMixin, APIView):
    """One-time snapshot: Standard Group participants → new Class."""

    def get_permissions(self):
        return [CanManageWorkspace()]

    def post(self, request, group_pk):
        serializer = StandardGroupImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            result = import_standard_group_as_class(
                organization=self.organization,
                destination_group=self.group,
                source_group_id=data["source_group_id"],
                name=data.get("name"),
                class_pin=data.get("class_pin"),
            )
        except StandardGroupImportError as exc:
            body = {
                "code": exc.code,
                "detail": exc.detail,
            }
            if exc.field_errors:
                body.update(exc.field_errors)
            status_code = status.HTTP_400_BAD_REQUEST
            if exc.code in {"source_not_found", "destination_wrong_workspace"}:
                status_code = status.HTTP_404_NOT_FOUND
            return Response(body, status=status_code)

        section_payload = GroupSectionSerializer(
            result.section,
            context={
                "request": request,
                "organization": self.organization,
                "group": self.group,
            },
        ).data
        message = (
            f"{result.source_group_name} copied as a Class with "
            f"{result.participants_copied} participant"
            f"{'' if result.participants_copied == 1 else 's'}."
        )
        if result.members_skipped:
            message = (
                f"{result.source_group_name} copied with {result.participants_copied} "
                f"participant{'' if result.participants_copied == 1 else 's'}. "
                f"{result.members_skipped} existing participant"
                f"{'' if result.members_skipped == 1 else 's'} "
                f"{'was' if result.members_skipped == 1 else 'were'} skipped."
            )
        return Response(
            {
                "section": section_payload,
                "source_group_id": result.source_group_id,
                "source_group_name": result.source_group_name,
                "members_copied": result.members_copied,
                "visitors_copied": result.visitors_copied,
                "members_skipped": result.members_skipped,
                "participants_copied": result.participants_copied,
                "message": message,
                "readiness": result.readiness,
            },
            status=status.HTTP_201_CREATED,
        )


class GroupSectionDetailView(GroupScopedMixin, RetrieveUpdateDestroyAPIView):
    serializer_class = GroupSectionSerializer
    http_method_names = ["get", "put", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [CanViewWorkspace()]
        return [CanManageWorkspace()]

    def get_queryset(self):
        return GroupSection.objects.filter(
            organization=self.organization,
            group=self.group,
        ).annotate(
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

    def update(self, request, *args, **kwargs):
        section = self.get_object()
        if section.status == GroupSectionStatus.ARCHIVED:
            return Response(
                {
                    "code": "section_archived",
                    "detail": "Archived Classes cannot be edited. Restore the Class first.",
                },
                status=status.HTTP_409_CONFLICT,
            )
        return super().update(request, *args, **kwargs)

    def perform_destroy(self, instance):
        instance.archive()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == GroupSectionStatus.ARCHIVED:
            return Response(
                {
                    "code": "already_archived",
                    "detail": "This Class is already archived.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)


class GroupSectionArchiveView(GroupScopedMixin, APIView):
    def get_permissions(self):
        return [CanManageWorkspace()]

    def post(self, request, group_pk, pk):
        section = GroupSection.objects.filter(
            pk=pk,
            group=self.group,
            organization=self.organization,
        ).first()
        if section is None:
            raise NotFound("Class not found in this Group.")
        if section.status == GroupSectionStatus.ARCHIVED:
            return Response(
                {
                    "code": "already_archived",
                    "detail": "This Class is already archived.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        section.archive()
        serializer = GroupSectionSerializer(section, context=self.get_serializer_context())
        return Response(serializer.data)


class GroupSectionRestoreView(GroupScopedMixin, APIView):
    def get_permissions(self):
        return [CanManageWorkspace()]

    def post(self, request, group_pk, pk):
        section = GroupSection.objects.filter(
            pk=pk,
            group=self.group,
            organization=self.organization,
        ).first()
        if section is None:
            raise NotFound("Class not found in this Group.")
        if section.status != GroupSectionStatus.ARCHIVED:
            return Response(
                {
                    "code": "not_archived",
                    "detail": "Only archived Classes can be restored.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            section.restore()
        except (DjangoValidationError, IntegrityError):
            return Response(
                {
                    "code": "section_name_conflict",
                    "detail": "A Class with this name already exists in this Group.",
                },
                status=status.HTTP_409_CONFLICT,
            )
        serializer = GroupSectionSerializer(section, context=self.get_serializer_context())
        return Response(serializer.data)


class GroupSectionPermanentDeleteView(GroupScopedMixin, APIView):
    def get_permissions(self):
        return [CanManageWorkspace()]

    def post(self, request, group_pk, pk):
        section = GroupSection.objects.filter(
            pk=pk,
            group=self.group,
            organization=self.organization,
        ).first()
        if section is None:
            raise NotFound("Class not found in this Group.")
        try:
            permanently_delete_section(section)
        except PermanentSectionDeletionError as exc:
            return Response(
                {
                    "code": "section_not_archived",
                    "detail": exc.messages[0] if exc.messages else str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class SectionMembershipListCreateView(SectionScopedMixin, GroupMembershipListCreateView):
    pass


class SectionMembershipDetailView(SectionScopedMixin, GroupMembershipDetailView):
    pass


class SectionParticipantListCreateView(SectionScopedMixin, GroupOnlyParticipantListCreateView):
    pass


class SectionParticipantDetailView(SectionScopedMixin, GroupOnlyParticipantDetailView):
    pass


class SectionAvailableMembersView(SectionScopedMixin, GroupAvailableMembersView):
    pass
