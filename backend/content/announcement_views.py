"""Authenticated Workspace announcement API."""

from rest_framework import serializers, status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from content.announcements import (
    acknowledge_announcement,
    acknowledge_announcements,
    get_eligible_announcement_for_actor,
    list_eligible_announcements_for_actor,
)
from content.models import Announcement
from organizations.permissions import (
    deny_unverified_customer,
    get_active_workspace_organization,
)


class CanAccessWorkspaceAnnouncements(BasePermission):
    message = "Not allowed to access Workspace announcements."

    def has_permission(self, request, view):
        deny_unverified_customer(request.user)
        return get_active_workspace_organization(request.user) is not None


class AnnouncementSerializer(serializers.ModelSerializer):
    is_read = serializers.SerializerMethodField()
    read_at = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = (
            "id",
            "title",
            "message",
            "severity",
            "published_at",
            "expires_at",
            "include_status_link",
            "is_read",
            "read_at",
        )

    def get_is_read(self, obj):
        return bool(getattr(obj, "is_read", False))

    def get_read_at(self, obj):
        read_map = self.context.get("read_at_by_id") or {}
        return read_map.get(obj.pk)


class AnnouncementListView(APIView):
    permission_classes = [IsAuthenticated, CanAccessWorkspaceAnnouncements]

    def get(self, request):
        organization = get_active_workspace_organization(request.user)
        qs, user, staff = list_eligible_announcements_for_actor(
            request.user,
            organization=organization,
        )
        announcements = list(qs[:100])
        unread_count = sum(1 for item in announcements if not getattr(item, "is_read", False))
        read_at_by_id = _read_at_map(announcements, user=user, staff=staff)
        serializer = AnnouncementSerializer(
            announcements,
            many=True,
            context={"read_at_by_id": read_at_by_id},
        )
        response = Response(
            {
                "unread_count": unread_count,
                "results": serializer.data,
            }
        )
        # Workspace bell polls this endpoint; never serve a stale cached list.
        response["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response["Pragma"] = "no-cache"
        return response


class AnnouncementReadView(APIView):
    permission_classes = [IsAuthenticated, CanAccessWorkspaceAnnouncements]

    def post(self, request, announcement_id):
        announcement, _user, _staff = get_eligible_announcement_for_actor(
            request.user,
            announcement_id,
        )
        if announcement is None:
            return Response({"detail": "Announcement not found."}, status=status.HTTP_404_NOT_FOUND)

        ack, created = acknowledge_announcement(request.user, announcement)
        return Response(
            {
                "id": announcement.id,
                "is_read": True,
                "read_at": ack.read_at,
                "created": created,
            }
        )


class AnnouncementMarkVisibleReadView(APIView):
    """Mark all currently eligible unread announcements as read for this actor."""

    permission_classes = [IsAuthenticated, CanAccessWorkspaceAnnouncements]

    def post(self, request):
        organization = get_active_workspace_organization(request.user)
        qs, _user, _staff = list_eligible_announcements_for_actor(
            request.user,
            organization=organization,
        )
        unread = list(qs.filter(is_read=False)[:100])
        acknowledge_announcements(request.user, unread)
        return Response({"marked_read": len(unread), "unread_count": 0})


def _read_at_map(announcements, *, user=None, staff=None):
    from content.models import AnnouncementAcknowledgement

    ids = [item.pk for item in announcements if getattr(item, "is_read", False)]
    if not ids:
        return {}
    qs = AnnouncementAcknowledgement.objects.filter(announcement_id__in=ids)
    if staff is not None:
        qs = qs.filter(workspace_staff_account=staff)
    elif user is not None:
        qs = qs.filter(user=user)
    else:
        return {}
    return {row.announcement_id: row.read_at for row in qs}
