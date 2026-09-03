"""Phase 6: Class and participation PIN hashing at rest."""

from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.testing import force_platform_admin_login
from groups.models import (
    Group,
    GroupMembership,
    GroupOnlyParticipant,
    GroupSection,
    GroupType,
)
from kiosk_builder.testing import configure_group_kiosk_for_launch
from members.models import Member
from organizations.models import Organization, OrganizationPlan

from django.contrib.auth import get_user_model

User = get_user_model()


def create_verified_owner(email):
    user = User.objects.create_user(email=email, password="secure-password")
    user.mark_email_verified()
    return user


class ClassPinHashingTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create_with_owner(
            owner=create_verified_owner("class-pin-hash@example.com")
        )
        self.org.plan = OrganizationPlan.BUSINESS
        self.org.save(update_fields=["plan", "updated_at"])
        self.client = APIClient()
        force_platform_admin_login(self.client, self.org.owner)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="School",
            group_type=GroupType.STRUCTURED,
            check_in_enabled=True,
            check_out_enabled=True,
            require_class_pin=True,
        )
        configure_group_kiosk_for_launch(self.group)
        self.section = GroupSection.objects.create_section(
            group=self.group,
            name="Class A",
        )
        member = Member.objects.create(
            organization=self.org,
            name="Aleks",
            email="aleks@classpin.test",
        )
        GroupMembership.objects.create(
            organization=self.org,
            group=self.group,
            member=member,
            section=self.section,
        )
        self.section_b = GroupSection.objects.create_section(
            group=self.group,
            name="Class B",
        )
        self.section_b.set_class_pin("8888")
        self.section_b.save(update_fields=["class_pin_hash", "updated_at"])

    def test_a_creating_class_pin_does_not_store_raw(self):
        self.section.set_class_pin("9999")
        self.section.save(update_fields=["class_pin_hash", "updated_at"])
        self.section.refresh_from_db()
        self.assertTrue(self.section.has_class_pin)
        self.assertNotEqual(self.section.class_pin_hash, "9999")
        self.assertTrue(check_password("9999", self.section.class_pin_hash))
        self.assertNotIn("9999", self.section.class_pin_hash)

    def test_b_api_get_omits_raw_and_hash(self):
        self.section.set_class_pin("9999")
        self.section.save(update_fields=["class_pin_hash", "updated_at"])
        response = self.client.get(
            reverse(
                "group-section-detail",
                kwargs={"group_pk": self.group.pk, "pk": self.section.pk},
            )
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["has_class_pin"])
        self.assertNotIn("class_pin", response.data)
        self.assertNotIn("class_pin_hash", response.data)
        payload = str(response.data)
        self.assertNotIn("9999", payload)
        self.assertNotIn(self.section.class_pin_hash, payload)

    def test_c_correct_pin_verifies(self):
        self.section.set_class_pin("9999")
        self.section.save(update_fields=["class_pin_hash", "updated_at"])
        self.assertTrue(self.section.check_class_pin("9999"))

    def test_d_incorrect_pin_fails(self):
        self.section.set_class_pin("9999")
        self.section.save(update_fields=["class_pin_hash", "updated_at"])
        self.assertFalse(self.section.check_class_pin("0000"))
        self.assertFalse(self.section.check_class_pin(self.section.class_pin_hash))

    def test_e_reset_changes_pin(self):
        self.section.set_class_pin("9999")
        self.section.save(update_fields=["class_pin_hash", "updated_at"])
        self.section.set_class_pin("7777")
        self.section.save(update_fields=["class_pin_hash", "updated_at"])
        self.assertFalse(self.section.check_class_pin("9999"))
        self.assertTrue(self.section.check_class_pin("7777"))

    def test_f_clear_class_pin(self):
        self.section.set_class_pin("9999")
        self.section.save(update_fields=["class_pin_hash", "updated_at"])
        self.section.clear_class_pin()
        self.section.save(update_fields=["class_pin_hash", "updated_at"])
        self.assertFalse(self.section.has_class_pin)
        self.assertFalse(self.section.check_class_pin("9999"))

    def test_g_migrated_plaintext_style_hash_verifies(self):
        """Simulate post-migration state: only hash present, verifies original PIN."""
        self.section.class_pin_hash = make_password("4242")
        self.section.save(update_fields=["class_pin_hash", "updated_at"])
        self.assertTrue(self.section.check_class_pin("4242"))
        self.assertFalse(self.section.check_class_pin("0000"))

    def test_h_verify_endpoint_and_grant_flow(self):
        self.section.set_class_pin("9999")
        self.section.save(update_fields=["class_pin_hash", "updated_at"])
        configure_group_kiosk_for_launch(self.group)
        verify = self.client.post(
            reverse(
                "group-kiosk-class-verify-pin",
                kwargs={"group_pk": self.group.pk, "section_pk": self.section.pk},
            ),
            {"pin": "9999"},
            format="json",
        )
        self.assertEqual(verify.status_code, status.HTTP_200_OK)
        people = self.client.get(
            reverse(
                "group-kiosk-class-people",
                kwargs={"group_pk": self.group.pk, "section_pk": self.section.pk},
            )
        )
        self.assertEqual(people.status_code, status.HTTP_200_OK)


@override_settings(
    CLASS_PIN_VERIFY_LIMIT=3,
    CLASS_PIN_VERIFY_WINDOW=60,
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "phase6-class-pin-rl",
        }
    },
)
class ClassPinRateLimitStillAppliesTests(TestCase):
    def setUp(self):
        cache.clear()
        self.org = Organization.objects.create_with_owner(
            owner=create_verified_owner("class-pin-rl2@example.com")
        )
        self.org.plan = OrganizationPlan.BUSINESS
        self.org.save(update_fields=["plan", "updated_at"])
        self.client = APIClient()
        force_platform_admin_login(self.client, self.org.owner)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="PIN RL",
            group_type=GroupType.STRUCTURED,
            check_in_enabled=True,
            check_out_enabled=True,
            require_class_pin=True,
        )
        configure_group_kiosk_for_launch(self.group)
        self.section = GroupSection.objects.create_section(group=self.group, name="A")
        self.section.set_class_pin("9999")
        self.section.save(update_fields=["class_pin_hash", "updated_at"])
        other = GroupSection.objects.create_section(group=self.group, name="B")
        other.set_class_pin("8888")
        other.save(update_fields=["class_pin_hash", "updated_at"])
        member = Member.objects.create(
            organization=self.org, name="M", email="m@rl.test"
        )
        GroupMembership.objects.create(
            organization=self.org,
            group=self.group,
            member=member,
            section=self.section,
        )

    def test_i_rate_limit_still_applies(self):
        url = reverse(
            "group-kiosk-class-verify-pin",
            kwargs={"group_pk": self.group.pk, "section_pk": self.section.pk},
        )
        for _ in range(3):
            response = self.client.post(url, {"pin": "0000"}, format="json")
            self.assertEqual(response.status_code, 400)
        blocked = self.client.post(url, {"pin": "0000"}, format="json")
        self.assertEqual(blocked.status_code, 429)


class ParticipationPinHashingTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create_with_owner(
            owner=create_verified_owner("part-pin-hash@example.com")
        )
        self.org.plan = OrganizationPlan.BUSINESS
        self.org.save(update_fields=["plan", "updated_at"])
        self.client = APIClient()
        force_platform_admin_login(self.client, self.org.owner)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Club",
            group_type=GroupType.STANDARD,
            check_in_enabled=True,
            require_pin=True,
        )
        self.member = Member.objects.create(
            organization=self.org,
            name="Member",
            email="member@partpin.test",
        )
        self.membership = GroupMembership.objects.create(
            organization=self.org,
            group=self.group,
            member=self.member,
        )
        self.visitor = GroupOnlyParticipant.objects.create(
            organization=self.org,
            group=self.group,
            name="Visitor",
        )

    def test_membership_raw_pin_not_stored(self):
        self.membership.set_participation_pin("1234")
        self.membership.save(update_fields=["participation_pin_hash", "updated_at"])
        self.membership.refresh_from_db()
        self.assertTrue(self.membership.has_participation_pin)
        self.assertNotEqual(self.membership.participation_pin_hash, "1234")
        self.assertTrue(self.membership.check_effective_pin("1234"))
        self.assertFalse(self.membership.check_effective_pin("0000"))
        self.assertFalse(
            self.membership.check_effective_pin(self.membership.participation_pin_hash)
        )

    def test_visitor_raw_pin_not_stored(self):
        self.visitor.set_participation_pin("5678")
        self.visitor.save(update_fields=["pin_hash", "updated_at"])
        self.visitor.refresh_from_db()
        self.assertTrue(self.visitor.has_pin)
        self.assertNotEqual(self.visitor.pin_hash, "5678")
        self.assertTrue(self.visitor.check_pin("5678"))
        self.assertFalse(self.visitor.check_pin("0000"))

    def test_membership_api_omits_raw_and_hash(self):
        self.membership.set_participation_pin("1234")
        self.membership.save(update_fields=["participation_pin_hash", "updated_at"])
        response = self.client.get(
            reverse(
                "group-membership-detail",
                kwargs={"group_pk": self.group.pk, "pk": self.membership.pk},
            )
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["participation"]["has_pin"])
        self.assertNotIn("pin", response.data["participation"])
        self.assertNotIn("participation_pin", response.data)
        self.assertNotIn("participation_pin_hash", response.data)
        self.assertNotIn("1234", str(response.data))

    def test_visitor_api_omits_raw_and_hash(self):
        self.visitor.set_participation_pin("5678")
        self.visitor.save(update_fields=["pin_hash", "updated_at"])
        response = self.client.get(
            reverse(
                "group-participant-detail",
                kwargs={"group_pk": self.group.pk, "pk": self.visitor.pk},
            )
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["participation"]["has_pin"])
        self.assertNotIn("pin", response.data["participation"])
        self.assertNotIn("5678", str(response.data))
        self.assertNotIn(self.visitor.pin_hash, str(response.data))

    def test_reset_membership_pin(self):
        self.membership.set_participation_pin("1234")
        self.membership.save(update_fields=["participation_pin_hash", "updated_at"])
        self.membership.set_participation_pin("9999")
        self.membership.save(update_fields=["participation_pin_hash", "updated_at"])
        self.assertFalse(self.membership.check_effective_pin("1234"))
        self.assertTrue(self.membership.check_effective_pin("9999"))

    def test_migrated_hash_still_verifies(self):
        self.membership.participation_pin_hash = make_password("4242")
        self.membership.save(update_fields=["participation_pin_hash", "updated_at"])
        self.assertTrue(self.membership.check_effective_pin("4242"))
        self.visitor.pin_hash = make_password("4343")
        self.visitor.save(update_fields=["pin_hash", "updated_at"])
        self.assertTrue(self.visitor.check_pin("4343"))
