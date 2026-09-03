from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.testing import force_platform_admin_login
from groups.models import Group, GroupMembership, GroupSection, GroupType
from members.models import Member
from organizations.models import Organization, OrganizationPlan

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True):
    user = User.objects.create_user(email=email, password=password)
    if verified:
        user.mark_email_verified()
    return user


class GroupSectionQueryCountTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create_with_owner(
            owner=create_user("sections-query@example.com")
        )
        self.organization.plan = OrganizationPlan.BUSINESS
        self.organization.save(update_fields=["plan"])
        self.user = self.organization.owner
        self.client = APIClient()
        force_platform_admin_login(self.client, self.user)
        self.group = Group.objects.create(
            organization=self.organization,
            name="Structured Group",
            group_type=GroupType.STRUCTURED,
        )
        for index in range(5):
            section = GroupSection.objects.create(
                organization=self.organization,
                group=self.group,
                name=f"Class {index + 1}",
            )
            member = Member.objects.create(
                organization=self.organization,
                name=f"Member {index + 1}",
            )
            GroupMembership.objects.create(
                organization=self.organization,
                group=self.group,
                section=section,
                member=member,
            )

    def test_structured_group_section_list_avoids_per_section_count_queries(self):
        url = reverse("group-section-list", kwargs={"group_pk": self.group.pk})
        with CaptureQueriesContext(connection) as context:
            response = self.client.get(url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 5)
        # Bounded query count: auth/workspace + annotated section list, not 2 queries per section.
        self.assertLessEqual(len(context.captured_queries), 12)
