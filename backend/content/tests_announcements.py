from datetime import timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from content.models import (
    Announcement,
    AnnouncementAcknowledgement,
    AnnouncementAudience,
    AnnouncementSeverity,
    PublicationStatus,
)
from organizations.entitlements.transitions import apply_effective_plan
from organizations.models import (
    Organization,
    OrganizationPlan,
    WorkspaceStaffAccount,
    WorkspaceStaffRole,
)

User = get_user_model()


def create_owner(email="announce-owner@example.com"):
    owner = User.objects.create_user(email=email, password="secure-password")
    owner.mark_email_verified()
    organization = Organization.objects.create_with_owner(owner=owner)
    return owner, organization


def publish_announcement(**kwargs):
    defaults = {
        "title": "Platform notice",
        "message": "Hello from CheckStation.",
        "severity": AnnouncementSeverity.INFO,
        "status": PublicationStatus.PUBLISHED,
        "audience": AnnouncementAudience.ALL,
        "published_at": timezone.now() - timedelta(minutes=1),
    }
    defaults.update(kwargs)
    target_workspaces = defaults.pop("target_workspaces", None)
    announcement = Announcement(**defaults)
    announcement.save()
    if target_workspaces:
        announcement.target_workspaces.set(target_workspaces)
    return announcement


class AnnouncementApiTests(TestCase):
    def setUp(self):
        self.owner, self.organization = create_owner()
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.list_url = reverse("announcement-list")

    def test_published_all_announcement_is_visible(self):
        publish_announcement(title="All workspaces")
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["unread_count"], 1)
        self.assertEqual(response.data["results"][0]["title"], "All workspaces")
        self.assertFalse(response.data["results"][0]["is_read"])
        self.assertIn("no-store", response["Cache-Control"])
        self.assertEqual(response["Pragma"], "no-cache")

    def test_draft_is_hidden(self):
        publish_announcement(status=PublicationStatus.DRAFT, published_at=None)
        response = self.client.get(self.list_url)
        self.assertEqual(response.data["results"], [])

    def test_expired_is_hidden(self):
        publish_announcement(
            expires_at=timezone.now() - timedelta(minutes=1),
            published_at=timezone.now() - timedelta(hours=1),
        )
        response = self.client.get(self.list_url)
        self.assertEqual(response.data["results"], [])

    def test_future_expiry_remains_visible(self):
        now = timezone.now()
        publish_announcement(
            title="Still active",
            published_at=now - timedelta(hours=1),
            expires_at=now + timedelta(minutes=30),
        )
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["unread_count"], 1)

    def test_expires_exactly_at_now_is_hidden(self):
        now = timezone.now()
        publish_announcement(
            title="Boundary expiry",
            published_at=now - timedelta(hours=1),
            expires_at=now,
        )
        response = self.client.get(self.list_url)
        self.assertEqual(response.data["results"], [])
        self.assertEqual(response.data["unread_count"], 0)

    def test_unread_count_excludes_expired(self):
        now = timezone.now()
        publish_announcement(
            title="Expired unread",
            published_at=now - timedelta(hours=2),
            expires_at=now - timedelta(seconds=1),
        )
        publish_announcement(
            title="Active unread",
            published_at=now - timedelta(minutes=5),
            expires_at=now + timedelta(hours=1),
        )
        response = self.client.get(self.list_url)
        self.assertEqual([item["title"] for item in response.data["results"]], ["Active unread"])
        self.assertEqual(response.data["unread_count"], 1)

    def test_future_published_at_is_hidden(self):
        publish_announcement(published_at=timezone.now() + timedelta(hours=1))
        response = self.client.get(self.list_url)
        self.assertEqual(response.data["results"], [])

    def test_basic_plan_targeting(self):
        apply_effective_plan(self.organization, OrganizationPlan.BASIC, source="test")
        publish_announcement(
            audience=AnnouncementAudience.PLAN,
            target_plans=["basic"],
            title="Basic only",
        )
        publish_announcement(
            audience=AnnouncementAudience.PLAN,
            target_plans=["plus"],
            title="Plus only",
        )
        titles = [item["title"] for item in self.client.get(self.list_url).data["results"]]
        self.assertEqual(titles, ["Basic only"])

    def test_plus_plan_targeting(self):
        apply_effective_plan(self.organization, OrganizationPlan.PLUS, source="test")
        publish_announcement(
            audience=AnnouncementAudience.PLAN,
            target_plans=["plus"],
            title="Plus only",
        )
        titles = [item["title"] for item in self.client.get(self.list_url).data["results"]]
        self.assertEqual(titles, ["Plus only"])

    def test_business_plan_targeting(self):
        apply_effective_plan(self.organization, OrganizationPlan.BUSINESS, source="test")
        publish_announcement(
            audience=AnnouncementAudience.PLAN,
            target_plans=["business"],
            title="Business only",
        )
        titles = [item["title"] for item in self.client.get(self.list_url).data["results"]]
        self.assertEqual(titles, ["Business only"])

    def test_business_trial_is_targeted_as_business(self):
        # New workspaces receive Business via builtin trial / apply_effective_plan.
        self.assertEqual(self.organization.plan, OrganizationPlan.BUSINESS)
        publish_announcement(
            audience=AnnouncementAudience.PLAN,
            target_plans=["business"],
            title="Business audience",
        )
        titles = [item["title"] for item in self.client.get(self.list_url).data["results"]]
        self.assertEqual(titles, ["Business audience"])

    def test_specific_workspace_targeting(self):
        other_owner, other_org = create_owner("other-announce@example.com")
        mine = publish_announcement(
            audience=AnnouncementAudience.WORKSPACES,
            title="Only mine",
            target_workspaces=[self.organization],
        )
        publish_announcement(
            audience=AnnouncementAudience.WORKSPACES,
            title="Only other",
            target_workspaces=[other_org],
        )
        response = self.client.get(self.list_url)
        self.assertEqual([item["id"] for item in response.data["results"]], [mine.id])

        other_client = APIClient()
        other_client.force_authenticate(other_owner)
        other_response = other_client.get(self.list_url)
        self.assertEqual(
            [item["title"] for item in other_response.data["results"]],
            ["Only other"],
        )

    def test_owner_read_acknowledgement_persists_across_clients(self):
        announcement = publish_announcement(title="Read me")
        read_url = reverse("announcement-read", kwargs={"announcement_id": announcement.id})
        first = self.client.post(read_url, {}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertTrue(first.data["is_read"])
        self.assertTrue(first.data["created"])

        second_browser = APIClient()
        second_browser.force_authenticate(self.owner)
        listed = second_browser.get(self.list_url)
        self.assertEqual(listed.data["unread_count"], 0)
        self.assertTrue(listed.data["results"][0]["is_read"])
        self.assertIsNotNone(listed.data["results"][0]["read_at"])

        again = second_browser.post(read_url, {}, format="json")
        self.assertFalse(again.data["created"])

    def test_owner_mark_read_survives_new_session_like_hard_refresh(self):
        """Simulate panel open (mark-visible-read) then a brand-new client/page load."""
        announcement = publish_announcement(title="Hard refresh notice")
        before = self.client.get(self.list_url)
        self.assertEqual(before.data["unread_count"], 1)
        self.assertFalse(before.data["results"][0]["is_read"])

        mark = self.client.post(reverse("announcement-mark-visible-read"), {}, format="json")
        self.assertEqual(mark.status_code, 200)
        self.assertEqual(mark.data["marked_read"], 1)
        self.assertTrue(
            AnnouncementAcknowledgement.objects.filter(
                announcement=announcement,
                user=self.owner,
            ).exists()
        )

        # Entirely new request client = new browser tab / hard refresh session.
        refreshed = APIClient()
        refreshed.force_authenticate(self.owner)
        after = refreshed.get(self.list_url)
        self.assertEqual(after.data["unread_count"], 0)
        self.assertEqual(after.data["results"][0]["id"], announcement.id)
        self.assertTrue(after.data["results"][0]["is_read"])
        self.assertIsNotNone(after.data["results"][0]["read_at"])

    def test_staff_mark_read_survives_new_session_like_hard_refresh(self):
        announcement = publish_announcement(title="Staff hard refresh notice")
        staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="announce-staff-persist",
            password="secure-password",
            role=WorkspaceStaffRole.ADMIN,
            email="announce-staff-persist@example.com",
        )
        staff_client = APIClient()
        staff_client.force_authenticate(staff)
        before = staff_client.get(self.list_url)
        self.assertEqual(before.data["unread_count"], 1)

        mark = staff_client.post(reverse("announcement-mark-visible-read"), {}, format="json")
        self.assertEqual(mark.status_code, 200)
        self.assertEqual(mark.data["marked_read"], 1)
        self.assertTrue(
            AnnouncementAcknowledgement.objects.filter(
                announcement=announcement,
                workspace_staff_account=staff,
            ).exists()
        )

        refreshed = APIClient()
        refreshed.force_authenticate(staff)
        after = refreshed.get(self.list_url)
        self.assertEqual(after.data["unread_count"], 0)
        self.assertTrue(after.data["results"][0]["is_read"])
        self.assertIsNotNone(after.data["results"][0]["read_at"])

        # Owner in the same workspace keeps an independent unread state.
        owner_listed = self.client.get(self.list_url)
        self.assertEqual(owner_listed.data["unread_count"], 1)
        self.assertFalse(owner_listed.data["results"][0]["is_read"])

    def test_staff_has_separate_unread_state(self):
        announcement = publish_announcement(title="Shared workspace notice")
        staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="announce-staff",
            password="secure-password",
            role=WorkspaceStaffRole.ADMIN,
            email="announce-staff@example.com",
        )
        self.client.post(
            reverse("announcement-read", kwargs={"announcement_id": announcement.id}),
            {},
            format="json",
        )

        staff_client = APIClient()
        staff_client.force_authenticate(staff)
        listed = staff_client.get(self.list_url)
        self.assertEqual(listed.data["unread_count"], 1)
        self.assertFalse(listed.data["results"][0]["is_read"])

        staff_client.post(
            reverse("announcement-read", kwargs={"announcement_id": announcement.id}),
            {},
            format="json",
        )
        listed_again = staff_client.get(self.list_url)
        self.assertEqual(listed_again.data["unread_count"], 0)
        self.assertTrue(listed_again.data["results"][0]["is_read"])

    def test_cannot_acknowledge_ineligible_announcement(self):
        other_owner, other_org = create_owner("ineligible-owner@example.com")
        announcement = publish_announcement(
            audience=AnnouncementAudience.WORKSPACES,
            target_workspaces=[other_org],
            title="Secret",
        )
        response = self.client.post(
            reverse("announcement-read", kwargs={"announcement_id": announcement.id}),
            {},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        self.assertFalse(
            AnnouncementAcknowledgement.objects.filter(
                announcement=announcement,
                user=self.owner,
            ).exists()
        )

    def test_mark_visible_read_marks_all_unread(self):
        publish_announcement(title="One", published_at=timezone.now() - timedelta(minutes=2))
        publish_announcement(title="Two", published_at=timezone.now() - timedelta(minutes=1))
        response = self.client.post(reverse("announcement-mark-visible-read"), {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["marked_read"], 2)
        listed = self.client.get(self.list_url)
        self.assertEqual(listed.data["unread_count"], 0)
        self.assertTrue(all(item["is_read"] for item in listed.data["results"]))

    def test_newest_first_ordering(self):
        older = publish_announcement(
            title="Older",
            published_at=timezone.now() - timedelta(hours=2),
        )
        newer = publish_announcement(
            title="Newer",
            published_at=timezone.now() - timedelta(minutes=5),
        )
        ids = [item["id"] for item in self.client.get(self.list_url).data["results"]]
        self.assertEqual(ids, [newer.id, older.id])


class AnnouncementModelConstraintTests(TestCase):
    def setUp(self):
        self.owner, self.organization = create_owner("constraint-owner@example.com")
        self.announcement = publish_announcement(title="Constraint check")

    def test_ack_actor_xor_constraint(self):
        with self.assertRaises(IntegrityError):
            AnnouncementAcknowledgement.objects.create(
                announcement=self.announcement,
                user=None,
                workspace_staff_account=None,
            )

    def test_admin_creation_and_workspace_targeting(self):
        announcement = Announcement(
            title="Admin published",
            message="Body",
            severity=AnnouncementSeverity.IMPORTANT,
            status=PublicationStatus.PUBLISHED,
            audience=AnnouncementAudience.WORKSPACES,
        )
        announcement.save()
        announcement.target_workspaces.add(self.organization)
        self.assertEqual(announcement.status, PublicationStatus.PUBLISHED)
        self.assertIsNotNone(announcement.published_at)
        self.assertTrue(announcement.target_workspaces.filter(pk=self.organization.pk).exists())


class AnnouncementAdminTimezoneTests(TestCase):
    def test_announcement_admin_uses_tokyo_override_not_global_time_zone(self):
        from django.conf import settings
        from content.admin import ANNOUNCEMENT_ADMIN_TZ, AnnouncementAdmin

        self.assertEqual(settings.TIME_ZONE, "UTC")
        self.assertTrue(settings.USE_TZ)
        self.assertEqual(str(ANNOUNCEMENT_ADMIN_TZ), "Asia/Tokyo")
        self.assertTrue(hasattr(AnnouncementAdmin, "changeform_view"))

        # Naive admin input under Tokyo override becomes 01:30 UTC for 10:30 JST.
        from datetime import datetime
        from django.utils import timezone as dj_tz

        with dj_tz.override(ANNOUNCEMENT_ADMIN_TZ):
            aware = dj_tz.make_aware(datetime(2026, 8, 31, 10, 30, 0))
        self.assertEqual(aware.utcoffset().total_seconds(), 9 * 3600)
        self.assertEqual(aware.astimezone(ZoneInfo("UTC")).hour, 1)
        self.assertEqual(aware.astimezone(ZoneInfo("UTC")).minute, 30)
