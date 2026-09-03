import datetime

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.testing import force_platform_admin_login
from groups.models import (
    Group,
    GroupMembership,
    GroupMembershipStatus,
    GroupOnlyParticipant,
    GroupStatus,
    KioskIdentifierField,
)
from groups.readiness import compute_group_setup_status
from members.models import Member, MemberStatus
from kiosk_builder.kiosk_settings_constants import KioskType
from kiosk_builder.testing import configure_group_kiosk_for_launch
from organizations.models import Organization

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True, **extra_fields):
    user = User.objects.create_user(email=email, password=password, **extra_fields)
    if verified:
        user.mark_email_verified()
    return user


class GroupParticipationSliceTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create_with_owner(
            owner=create_user("owner@example.com")
        )
        self.user = self.organization.owner
        self.client = APIClient()
        force_platform_admin_login(self.client, self.user)
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Class A",
        )
        configure_group_kiosk_for_launch(
            self.group,
            mode=KioskType.CARD,
        )
        self.member = Member.objects.create(
            organization=self.organization,
            name="Alex Member",
            email="alex@example.com",
        )
        self.other_group = Group.objects.create_group(
            organization=self.organization,
            name="Class B",
        )

    def _create_membership(self, *, group=None, member=None, **kwargs):
        group = group or self.group
        member = member or self.member
        membership = GroupMembership(group=group, member=member, organization=self.organization)
        for field, value in kwargs.items():
            setattr(membership, field, value)
        membership.save()
        return membership

    def test_group_pk_is_visible_and_immutable(self):
        url = reverse("group-detail", kwargs={"pk": self.group.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.group.pk)

        patch = self.client.patch(url, {"name": "Renamed"}, format="json")
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        self.assertEqual(patch.data["id"], self.group.pk)

    def test_participant_code_generated_for_member_and_visitor(self):
        membership = self._create_membership()
        self.assertTrue(membership.group_participant_code.startswith(f"G{self.group.pk}-"))

        visitor = GroupOnlyParticipant.objects.create(
            organization=self.organization,
            group=self.group,
            name="Visitor One",
        )
        self.assertTrue(visitor.group_participant_code.startswith(f"G{self.group.pk}-"))
        self.assertNotEqual(membership.group_participant_code, visitor.group_participant_code)

    def test_participant_code_unique_within_group_and_stable_on_edit(self):
        membership = self._create_membership()
        original_code = membership.group_participant_code
        membership.participation_email = "group@example.com"
        membership.save()
        membership.refresh_from_db()
        self.assertEqual(membership.group_participant_code, original_code)

    def test_same_member_in_two_groups_gets_different_codes(self):
        membership_a = self._create_membership(group=self.group)
        membership_b = self._create_membership(group=self.other_group)
        self.assertNotEqual(membership_a.group_participant_code, membership_b.group_participant_code)

    def test_restore_preserves_participant_code(self):
        membership = self._create_membership()
        code = membership.group_participant_code
        membership.deactivate()
        membership.status = GroupMembershipStatus.ACTIVE
        membership.save()
        membership.refresh_from_db()
        self.assertEqual(membership.group_participant_code, code)

    def test_email_off_allows_missing_participation_email(self):
        self.group.require_email = False
        self.group.save()
        self._create_membership()
        status_data = compute_group_setup_status(self.group)
        self.assertTrue(status_data["setup_complete"])

    def test_email_on_requires_participation_email(self):
        self.group.require_email = True
        self.group.save()
        self._create_membership()
        status_data = compute_group_setup_status(self.group)
        self.assertFalse(status_data["setup_complete"])
        self.assertEqual(status_data["missing_email_count"], 1)

    def test_member_email_prefills_participation_email_on_add(self):
        self.group.require_email = True
        self.group.save()
        url = reverse("group-membership-list", kwargs={"group_pk": self.group.pk})
        response = self.client.post(url, {"member_id": self.member.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["participation"]["email"], "alex@example.com")

    def test_available_members_suggests_profile_email_when_require_email_off(self):
        self.group.require_email = False
        self.group.save()
        url = reverse("group-available-members", kwargs={"group_pk": self.group.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = next(item for item in response.data if item["id"] == self.member.id)
        self.assertEqual(row["email"], "alex@example.com")
        self.assertEqual(row["suggested_participation_email"], "alex@example.com")

    def test_available_members_blank_suggestion_without_profile_email(self):
        blank = Member.objects.create(
            organization=self.organization,
            name="No Email Member",
            email="",
        )
        url = reverse("group-available-members", kwargs={"group_pk": self.group.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = next(item for item in response.data if item["id"] == blank.id)
        self.assertEqual(row["suggested_participation_email"], "")

    def test_editing_participation_email_does_not_change_member_profile(self):
        membership = self._create_membership(participation_email="group@example.com")
        url = reverse(
            "group-membership-detail",
            kwargs={"group_pk": self.group.pk, "pk": membership.pk},
        )
        response = self.client.patch(
            url,
            {"participation_email": "other@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.member.refresh_from_db()
        self.assertEqual(self.member.email, "alex@example.com")

    def test_visitor_email_works(self):
        self.group.require_email = True
        self.group.save()
        url = reverse("group-participant-list", kwargs={"group_pk": self.group.pk})
        response = self.client.post(
            url,
            {"name": "Guest", "email": "guest@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["participation"]["email"], "guest@example.com")

    def test_email_off_retains_stored_values(self):
        membership = self._create_membership(participation_email="kept@example.com")
        self.group.require_email = True
        self.group.save()
        self.group.require_email = False
        self.group.save()
        membership.refresh_from_db()
        self.assertEqual(membership.participation_email, "kept@example.com")

    def test_pin_off_allows_missing_pin(self):
        self._create_membership()
        self.group.require_pin = False
        self.group.save()
        self.assertTrue(compute_group_setup_status(self.group)["setup_complete"])

    def test_pin_on_marks_group_incomplete_without_pins(self):
        self.group.require_pin = True
        self.group.save()
        self._create_membership()
        status_data = compute_group_setup_status(self.group)
        self.assertFalse(status_data["setup_complete"])
        self.assertEqual(status_data["missing_pin_count"], 1)

    def test_pin_retained_when_requirement_disabled(self):
        membership = self._create_membership()
        membership.set_participation_pin("1234")
        membership.save()
        self.group.require_pin = True
        self.group.save()
        self.group.require_pin = False
        self.group.save()
        membership.refresh_from_db()
        self.assertTrue(membership.check_effective_pin("1234"))
        self.assertTrue(membership.has_participation_pin)
        self.assertNotEqual(membership.participation_pin_hash, "1234")

    def test_re_enabling_pin_reuses_existing_values(self):
        membership = self._create_membership()
        membership.set_participation_pin("1234")
        membership.save()
        self.group.require_pin = True
        self.group.save()
        self.assertTrue(compute_group_setup_status(self.group)["setup_complete"])

    def test_pin_not_in_kiosk_people_payload(self):
        self.group.require_pin = True
        self.group.save()
        membership = self._create_membership()
        membership.set_participation_pin("1234")
        membership.save()
        configure_group_kiosk_for_launch(
            self.group,
            mode=KioskType.CARD,
            use_pin=True,
        )
        url = reverse("group-kiosk-start", kwargs={"group_pk": self.group.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        person = response.data["people"][0]
        self.assertTrue(person["requires_pin"])
        self.assertNotIn("pin", person)
        self.assertNotIn("has_pin", person)

    def test_enable_pin_on_populated_group_save_succeeds(self):
        self._create_membership()
        url = reverse("group-detail", kwargs={"pk": self.group.pk})
        response = self.client.patch(
            url,
            {"participation": {"pin_required": True}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["readiness"]["setup_complete"])

    def test_launch_kiosk_blocked_when_setup_incomplete(self):
        self._create_membership()
        self.group.require_pin = True
        self.group.save()
        url = reverse("group-kiosk-start", kwargs={"group_pk": self.group.pk})
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "group_setup_incomplete")

    def test_identify_and_perform_blocked_when_setup_incomplete(self):
        membership = self._create_membership()
        self.group.require_pin = True
        self.group.save()
        identify_url = reverse("group-kiosk-identify", kwargs={"group_pk": self.group.pk})
        identify = self.client.post(
            identify_url,
            {"name": membership.effective_name, "pin": "1234"},
            format="json",
        )
        self.assertEqual(identify.status_code, status.HTTP_409_CONFLICT)

        perform_url = reverse("group-kiosk-perform", kwargs={"group_pk": self.group.pk})
        perform = self.client.post(
            perform_url,
            {
                "participant_kind": "member",
                "membership_id": membership.id,
                "action": "check_in",
                "pin": "1234",
            },
            format="json",
        )
        self.assertEqual(perform.status_code, status.HTTP_409_CONFLICT)

    def test_fill_missing_pins_makes_group_ready(self):
        membership = self._create_membership()
        self.group.require_pin = True
        self.group.save()
        url = reverse(
            "group-membership-detail",
            kwargs={"group_pk": self.group.pk, "pk": membership.pk},
        )
        self.client.patch(url, {"participation_pin": "1234"}, format="json")
        self.group.refresh_from_db()
        self.assertTrue(compute_group_setup_status(self.group)["setup_complete"])

    def test_disable_pin_makes_group_ready_immediately(self):
        self._create_membership()
        self.group.require_pin = True
        self.group.save()
        self.assertFalse(compute_group_setup_status(self.group)["setup_complete"])
        self.group.require_pin = False
        self.group.save()
        self.assertTrue(compute_group_setup_status(self.group)["setup_complete"])

    def test_archived_members_ignored_for_completeness(self):
        membership = self._create_membership()
        self.group.require_pin = True
        self.group.save()
        self.member.status = MemberStatus.ARCHIVED
        self.member.save()
        self.assertTrue(compute_group_setup_status(self.group)["setup_complete"])

    def test_restore_member_can_make_group_incomplete(self):
        membership = self._create_membership()
        self.group.require_pin = True
        self.group.save()
        self.member.status = MemberStatus.ARCHIVED
        self.member.save()
        self.assertTrue(compute_group_setup_status(self.group)["setup_complete"])
        self.member.status = MemberStatus.ACTIVE
        self.member.save()
        self.assertFalse(compute_group_setup_status(self.group)["setup_complete"])

    def test_participation_pin_set_flag_visible_to_workspace_api(self):
        membership = self._create_membership()
        membership.set_participation_pin("4321")
        membership.save()
        url = reverse(
            "group-membership-detail",
            kwargs={"group_pk": self.group.pk, "pk": membership.pk},
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["participation"]["has_pin"])
        self.assertNotIn("pin", response.data["participation"])
        self.assertNotIn("4321", str(response.data))

    def test_tenant_isolation_for_memberships(self):
        other_org = Organization.objects.create_with_owner(
            owner=create_user("other@example.com")
        )
        other_group = Group.objects.create_group(organization=other_org, name="Other")
        membership = self._create_membership()
        url = reverse(
            "group-membership-detail",
            kwargs={"group_pk": other_group.pk, "pk": membership.pk},
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class GroupListSerializationRegressionTests(TestCase):
    """Regression: groups list/detail must not 500 on readiness/participation fields."""

    def setUp(self):
        self.organization = Organization.objects.create_with_owner(
            owner=create_user("list-owner@example.com")
        )
        self.client = APIClient()
        force_platform_admin_login(self.client, self.organization.owner)

    def test_groups_list_empty_group_returns_200(self):
        Group.objects.create_group(organization=self.organization, name="Empty Group")
        response = self.client.get("/api/groups/?status=active")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertTrue(response.data[0]["readiness"]["setup_complete"])

    def test_groups_list_with_requirements_and_zero_participants(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="Needs Setup Empty",
            require_email=True,
            require_pin=True,
        )
        response = self.client.get("/api/groups/?status=active")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = next(item for item in response.data if item["id"] == group.id)
        self.assertTrue(payload["readiness"]["setup_complete"])

    def test_newly_created_group_detail_includes_readiness(self):
        created = self.client.post(
            "/api/groups/",
            {"name": "Fresh Group"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertIn("readiness", created.data)
        detail = self.client.get(f"/api/groups/{created.data['id']}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertIn("readiness", detail.data)

    def test_groups_list_with_membership_missing_participation_data(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="Incomplete Members",
            require_pin=True,
        )
        member = Member.objects.create(
            organization=self.organization,
            name="No Pin Yet",
            email="nopin@example.com",
        )
        GroupMembership.objects.create(
            organization=self.organization,
            group=group,
            member=member,
            status=GroupMembershipStatus.ACTIVE,
        )
        response = self.client.get("/api/groups/?status=active")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = next(item for item in response.data if item["id"] == group.id)
        self.assertFalse(payload["readiness"]["setup_complete"])
        self.assertEqual(payload["readiness"]["missing_pin_count"], 1)

    def test_groups_list_with_visitor_and_archived_member(self):
        group = Group.objects.create_group(
            organization=self.organization,
            name="Mixed Participants",
            require_email=True,
        )
        member = Member.objects.create(
            organization=self.organization,
            name="Archived One",
            email="archived@example.com",
        )
        GroupMembership.objects.create(
            organization=self.organization,
            group=group,
            member=member,
            status=GroupMembershipStatus.ACTIVE,
        )
        member.status = MemberStatus.ARCHIVED
        member.save()
        GroupOnlyParticipant.objects.create(
            organization=self.organization,
            group=group,
            name="Visitor",
            email="visitor@example.com",
        )
        response = self.client.get("/api/groups/?status=active")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = next(item for item in response.data if item["id"] == group.id)
        self.assertTrue(payload["readiness"]["setup_complete"])


class GroupParticipationRequirementDecouplingTests(TestCase):
    """Require email/PIN must not be coupled to legacy kiosk input-field selection."""

    def setUp(self):
        self.organization = Organization.objects.create_with_owner(
            owner=create_user("decouple-owner@example.com")
        )
        self.client = APIClient()
        force_platform_admin_login(self.client, self.organization.owner)
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Decouple Group",
            kiosk_input_field_1=KioskIdentifierField.NAME,
            kiosk_input_field_2="",
        )
        self.member = Member.objects.create(
            organization=self.organization,
            name="Needs Data",
            email="needs@example.com",
        )
        self.url = reverse("group-detail", kwargs={"pk": self.group.pk})

    def test_require_pin_on_without_pin_kiosk_field_saves(self):
        response = self.client.patch(
            self.url,
            {"participation": {"pin_required": True}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["participation"]["pin_required"])
        self.group.refresh_from_db()
        self.assertTrue(self.group.require_pin)
        self.assertEqual(self.group.kiosk_input_field_2, "")

    def test_require_pin_on_marks_setup_incomplete_when_participant_lacks_pin(self):
        GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member,
            status=GroupMembershipStatus.ACTIVE,
        )
        response = self.client.patch(
            self.url,
            {"participation": {"pin_required": True}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["readiness"]["setup_complete"])
        self.assertEqual(response.data["readiness"]["missing_pin_count"], 1)

    def test_require_email_on_without_email_kiosk_field_saves(self):
        self.group.kiosk_input_field_1 = KioskIdentifierField.NAME
        self.group.kiosk_input_field_2 = KioskIdentifierField.PIN
        self.group.save()
        response = self.client.patch(
            self.url,
            {"participation": {"email_required": True}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["participation"]["email_required"])
        self.group.refresh_from_db()
        self.assertTrue(self.group.require_email)
        self.assertNotIn(
            KioskIdentifierField.EMAIL,
            {self.group.kiosk_input_field_1, self.group.kiosk_input_field_2},
        )

    def test_require_email_on_marks_setup_incomplete_when_participant_lacks_email(self):
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member,
            status=GroupMembershipStatus.ACTIVE,
        )
        membership.participation_email = ""
        membership.save(update_fields=["participation_email"])
        response = self.client.patch(
            self.url,
            {"participation": {"email_required": True}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["readiness"]["setup_complete"])
        self.assertEqual(response.data["readiness"]["missing_email_count"], 1)

    def test_turning_requirement_off_makes_group_ready(self):
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member,
            status=GroupMembershipStatus.ACTIVE,
        )
        membership.participation_email = ""
        membership.clear_participation_pin()
        membership.save(update_fields=["participation_email", "participation_pin_hash"])
        self.group.require_email = True
        self.group.require_pin = True
        self.group.save()
        response = self.client.patch(
            self.url,
            {
                "participation": {
                    "email_required": False,
                    "pin_required": False,
                }
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["readiness"]["setup_complete"])
        self.assertEqual(response.data["readiness"]["missing_email_count"], 0)
        self.assertEqual(response.data["readiness"]["missing_pin_count"], 0)
