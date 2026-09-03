"""
Phase 3 regressions: Staff Group kiosk authorization + Structured Class PIN grants.
"""

import base64

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from attendance.models import ActionRecord, ActionType
from groups.models import (
    Group,
    GroupMembership,
    GroupSection,
    GroupType,
)
from kiosk_builder.kiosk_settings_constants import KioskType
from kiosk_builder.testing import configure_group_kiosk_for_launch
from members.models import Member
from organizations.models import (
    Organization,
    OrganizationPlan,
    WorkspaceStaffAccount,
    WorkspaceStaffRole,
)
from organizations.staff_group_access import set_staff_group_access

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True, **extra_fields):
    user = User.objects.create_user(email=email, password=password, **extra_fields)
    if verified:
        user.mark_email_verified()
    return user


def login_owner(api, email, password="secure-password"):
    response = api.post(
        "/api/auth/login/",
        {"email": email, "password": password},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK, response.content
    return api


def login_staff(api, organization, username, password):
    response = api.post(
        "/api/auth/staff-login/",
        {
            "workspace_id": organization.workspace_id,
            "username": username,
            "password": password,
        },
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK, response.content
    return api


def basic_auth_header(username, password):
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return f"Basic {token}"


class StaffGroupKioskAuthorizationTests(TestCase):
    def setUp(self):
        self.owner = create_user("kiosk-auth-owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.organization.plan = OrganizationPlan.BUSINESS
        self.organization.save(update_fields=["plan", "updated_at"])

        self.group_a = Group.objects.create_group(
            organization=self.organization,
            name="Authorized Group",
            group_type=GroupType.STRUCTURED,
            check_in_enabled=True,
            check_out_enabled=True,
            require_class_pin=True,
        )
        self.group_b = Group.objects.create_group(
            organization=self.organization,
            name="Other Group",
            group_type=GroupType.STRUCTURED,
            check_in_enabled=True,
            check_out_enabled=True,
            require_class_pin=True,
        )
        for group in (self.group_a, self.group_b):
            configure_group_kiosk_for_launch(group, mode=KioskType.CARD, use_pin=False)

        self.class_a = GroupSection.objects.create_section(group=self.group_a, name="Class A")
        self.class_a.set_class_pin("1111")
        self.class_a.save()
        self.class_b = GroupSection.objects.create_section(group=self.group_b, name="Class B")
        self.class_b.set_class_pin("2222")
        self.class_b.save()

        self.member_a = Member.objects.create(
            organization=self.organization, name="Aleks A"
        )
        self.member_b = Member.objects.create(
            organization=self.organization, name="Blake B"
        )
        self.membership_a = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group_a,
            member=self.member_a,
            section=self.class_a,
        )
        self.membership_b = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group_b,
            member=self.member_b,
            section=self.class_b,
        )

        self.staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.organization,
            username="scopedstaff",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )
        set_staff_group_access(
            staff_account=self.staff,
            organization=self.organization,
            group_ids=[self.group_a.pk],
        )
        self.api = login_staff(
            APIClient(), self.organization, "scopedstaff", "staff-password"
        )

    def test_a_staff_people_assigned_ok_unassigned_denied(self):
        verify = self.api.post(
            reverse(
                "group-kiosk-class-verify-pin",
                kwargs={"group_pk": self.group_a.pk, "section_pk": self.class_a.pk},
            ),
            {"pin": "1111"},
            format="json",
        )
        self.assertEqual(verify.status_code, status.HTTP_200_OK)

        allowed = self.api.get(
            reverse(
                "group-kiosk-class-people",
                kwargs={"group_pk": self.group_a.pk, "section_pk": self.class_a.pk},
            )
        )
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
        self.assertEqual(len(allowed.data["people"]), 1)

        denied = self.api.get(
            reverse(
                "group-kiosk-class-people",
                kwargs={"group_pk": self.group_b.pk, "section_pk": self.class_b.pk},
            )
        )
        self.assertEqual(denied.status_code, status.HTTP_404_NOT_FOUND)

    def test_b_staff_verify_pin_unassigned_denied_even_with_correct_pin(self):
        denied = self.api.post(
            reverse(
                "group-kiosk-class-verify-pin",
                kwargs={"group_pk": self.group_b.pk, "section_pk": self.class_b.pk},
            ),
            {"pin": "2222"},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_404_NOT_FOUND)

    def test_c_staff_identify_unassigned_denied(self):
        denied = self.api.post(
            reverse("group-kiosk-identify", kwargs={"group_pk": self.group_b.pk}),
            {
                "participant_kind": "member",
                "membership_id": self.membership_b.pk,
            },
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_404_NOT_FOUND)

    def test_d_staff_perform_unassigned_denied_no_action_record(self):
        before = ActionRecord.objects.count()
        denied = self.api.post(
            reverse("group-kiosk-perform", kwargs={"group_pk": self.group_b.pk}),
            {
                "participant_kind": "member",
                "membership_id": self.membership_b.pk,
                "action": ActionType.CHECK_IN,
            },
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(ActionRecord.objects.count(), before)

    def test_j_basic_auth_unassigned_group_denied(self):
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header("scopedstaff", "staff-password"),
            HTTP_X_WORKSPACE_ID=self.organization.workspace_id,
        )
        # Confirm Basic auth works for assigned Group start.
        ok = client.get(reverse("group-kiosk-start", kwargs={"group_pk": self.group_a.pk}))
        self.assertEqual(ok.status_code, status.HTTP_200_OK, ok.content)

        denied = client.post(
            reverse(
                "group-kiosk-class-verify-pin",
                kwargs={"group_pk": self.group_b.pk, "section_pk": self.class_b.pk},
            ),
            {"pin": "2222"},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_404_NOT_FOUND)

        before = ActionRecord.objects.count()
        perform = client.post(
            reverse("group-kiosk-perform", kwargs={"group_pk": self.group_b.pk}),
            {
                "participant_kind": "member",
                "membership_id": self.membership_b.pk,
                "action": ActionType.CHECK_IN,
            },
            format="json",
        )
        self.assertEqual(perform.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(ActionRecord.objects.count(), before)


class StructuredClassPinGrantTests(TestCase):
    def setUp(self):
        self.owner = create_user("class-pin-owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.organization.plan = OrganizationPlan.BUSINESS
        self.organization.save(update_fields=["plan", "updated_at"])
        self.api = login_owner(APIClient(), "class-pin-owner@example.com")

        self.group = Group.objects.create_group(
            organization=self.organization,
            name="School",
            group_type=GroupType.STRUCTURED,
            check_in_enabled=True,
            check_out_enabled=True,
            require_class_pin=True,
        )
        configure_group_kiosk_for_launch(self.group, mode=KioskType.CARD, use_pin=False)
        self.class_a = GroupSection.objects.create_section(group=self.group, name="Class A")
        self.class_a.set_class_pin("9999")
        self.class_a.save()
        self.class_b = GroupSection.objects.create_section(group=self.group, name="Class B")
        self.class_b.set_class_pin("8888")
        self.class_b.save()

        self.member_a = Member.objects.create(
            organization=self.organization, name="Aleks"
        )
        self.member_b = Member.objects.create(
            organization=self.organization, name="Blake"
        )
        self.membership_a = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member_a,
            section=self.class_a,
        )
        self.membership_b = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member_b,
            section=self.class_b,
        )

    def _people_url(self, section):
        return reverse(
            "group-kiosk-class-people",
            kwargs={"group_pk": self.group.pk, "section_pk": section.pk},
        )

    def _verify(self, section, pin):
        return self.api.post(
            reverse(
                "group-kiosk-class-verify-pin",
                kwargs={"group_pk": self.group.pk, "section_pk": section.pk},
            ),
            {"pin": pin},
            format="json",
        )

    def test_e_people_requires_verification_then_succeeds(self):
        blocked = self.api.get(self._people_url(self.class_a))
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(blocked.data["code"], "class_pin_required")
        self.assertNotIn("people", blocked.data)

        bad = self._verify(self.class_a, "0000")
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

        ok = self._verify(self.class_a, "9999")
        self.assertEqual(ok.status_code, status.HTTP_200_OK)

        people = self.api.get(self._people_url(self.class_a))
        self.assertEqual(people.status_code, status.HTTP_200_OK)
        self.assertEqual(len(people.data["people"]), 1)

    def test_f_identify_by_id_requires_class_grant(self):
        denied = self.api.post(
            reverse("group-kiosk-identify", kwargs={"group_pk": self.group.pk}),
            {
                "participant_kind": "member",
                "membership_id": self.membership_a.pk,
            },
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(denied.data["code"], "class_pin_required")

        self.assertEqual(self._verify(self.class_a, "9999").status_code, status.HTTP_200_OK)
        allowed = self.api.post(
            reverse("group-kiosk-identify", kwargs={"group_pk": self.group.pk}),
            {
                "participant_kind": "member",
                "membership_id": self.membership_a.pk,
            },
            format="json",
        )
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)

    def test_g_perform_by_id_requires_class_grant(self):
        before = ActionRecord.objects.count()
        denied = self.api.post(
            reverse("group-kiosk-perform", kwargs={"group_pk": self.group.pk}),
            {
                "participant_kind": "member",
                "membership_id": self.membership_a.pk,
                "action": ActionType.CHECK_IN,
            },
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(ActionRecord.objects.count(), before)

        self.assertEqual(self._verify(self.class_a, "9999").status_code, status.HTTP_200_OK)
        allowed = self.api.post(
            reverse("group-kiosk-perform", kwargs={"group_pk": self.group.pk}),
            {
                "participant_kind": "member",
                "membership_id": self.membership_a.pk,
                "action": ActionType.CHECK_IN,
            },
            format="json",
        )
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
        self.assertEqual(ActionRecord.objects.count(), before + 1)

    def test_h_verify_section_a_cannot_unlock_section_b(self):
        self.assertEqual(self._verify(self.class_a, "9999").status_code, status.HTTP_200_OK)
        denied_people = self.api.get(self._people_url(self.class_b))
        self.assertEqual(denied_people.status_code, status.HTTP_403_FORBIDDEN)

        before = ActionRecord.objects.count()
        denied_perform = self.api.post(
            reverse("group-kiosk-perform", kwargs={"group_pk": self.group.pk}),
            {
                "participant_kind": "member",
                "membership_id": self.membership_b.pk,
                "action": ActionType.CHECK_IN,
            },
            format="json",
        )
        self.assertEqual(denied_perform.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(ActionRecord.objects.count(), before)

    def test_i_query_string_pin_rejected(self):
        response = self.api.get(self._people_url(self.class_a) + "?pin=9999")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("pin", response.data)

    def test_k_kiosk_exit_clears_class_pin_grant(self):
        start = self.api.post(reverse("group-kiosk-start", kwargs={"group_pk": self.group.pk}))
        self.assertEqual(start.status_code, status.HTTP_200_OK)
        self.assertEqual(self._verify(self.class_a, "9999").status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.api.get(self._people_url(self.class_a)).status_code,
            status.HTTP_200_OK,
        )

        exit_response = self.api.post(
            reverse("group-kiosk-exit"),
            {"exit_code": "1111"},
            format="json",
        )
        self.assertEqual(exit_response.status_code, status.HTTP_200_OK, exit_response.content)

        blocked = self.api.get(self._people_url(self.class_a))
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(blocked.data["code"], "class_pin_required")
