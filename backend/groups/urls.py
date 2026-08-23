from django.urls import path
from rest_framework.routers import DefaultRouter

from groups.views import (
    GroupAvailableMembersView,
    GroupMembershipDetailView,
    GroupMembershipListCreateView,
    GroupOnlyParticipantDetailView,
    GroupOnlyParticipantListCreateView,
    GroupViewSet,
)
from groups.email_sender_views import GroupEmailSenderTestView, GroupEmailSenderView

router = DefaultRouter()
router.register("groups", GroupViewSet, basename="group")

urlpatterns = [
    path(
        "groups/<int:group_pk>/memberships/",
        GroupMembershipListCreateView.as_view(),
        name="group-membership-list",
    ),
    path(
        "groups/<int:group_pk>/memberships/<int:pk>/",
        GroupMembershipDetailView.as_view(),
        name="group-membership-detail",
    ),
    path(
        "groups/<int:group_pk>/participants/",
        GroupOnlyParticipantListCreateView.as_view(),
        name="group-participant-list",
    ),
    path(
        "groups/<int:group_pk>/participants/<int:pk>/",
        GroupOnlyParticipantDetailView.as_view(),
        name="group-participant-detail",
    ),
    path(
        "groups/<int:group_pk>/available-members/",
        GroupAvailableMembersView.as_view(),
        name="group-available-members",
    ),
    path(
        "groups/<int:group_pk>/email-sender/",
        GroupEmailSenderView.as_view(),
        name="group-email-sender",
    ),
    path(
        "groups/<int:group_pk>/email-sender/test/",
        GroupEmailSenderTestView.as_view(),
        name="group-email-sender-test",
    ),
]
urlpatterns += router.urls
