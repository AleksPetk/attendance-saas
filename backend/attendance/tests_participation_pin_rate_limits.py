"""Participation PIN brute-force rate-limit tests."""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from groups.models import (
    Group,
    GroupMembership,
    GroupMembershipStatus,
    GroupOnlyParticipant,
    GroupOnlyParticipantStatus,
)
from kiosk_builder.kiosk_settings_constants import KioskInputSecondField, KioskType
from kiosk_builder.testing import configure_group_kiosk_for_launch
from members.models import Member
from organizations.models import Organization

User = get_user_model()


@override_settings(
    PARTICIPATION_PIN_VERIFY_LIMIT=3,
    PARTICIPATION_PIN_VERIFY_WINDOW=60,
    PARTICIPATION_PIN_GROUP_IP_LIMIT=40,
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "participation-pin-rl",
        },
        "ratelimit": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "participation-pin-rl",
        },
    },
)
class ParticipationPinRateLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(
            email="pin-rl-owner@example.com",
            password="secure-password",
        )
        self.owner.mark_email_verified()
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="PIN RL",
            check_in_enabled=True,
            require_pin=True,
        )
        configure_group_kiosk_for_launch(
            self.group,
            mode=KioskType.CARD,
            use_pin=True,
        )
        self.member_a = Member.objects.create_member(
            organization=self.org, name="Ada"
        )
        self.membership_a = GroupMembership.objects.create(
            organization=self.org,
            group=self.group,
            member=self.member_a,
            status=GroupMembershipStatus.ACTIVE,
        )
        self.membership_a.set_participation_pin("1111")
        self.membership_a.save(update_fields=["participation_pin_hash"])

        self.member_b = Member.objects.create_member(
            organization=self.org, name="Bob"
        )
        self.membership_b = GroupMembership.objects.create(
            organization=self.org,
            group=self.group,
            member=self.member_b,
            status=GroupMembershipStatus.ACTIVE,
        )
        self.membership_b.set_participation_pin("2222")
        self.membership_b.save(update_fields=["participation_pin_hash"])

        self.visitor = GroupOnlyParticipant.objects.create(
            organization=self.org,
            group=self.group,
            name="Visitor",
            status=GroupOnlyParticipantStatus.ACTIVE,
        )
        self.visitor.set_participation_pin("3333")
        self.visitor.save(update_fields=["pin_hash"])

        self.client.post(f"/api/groups/{self.group.pk}/kiosk/")

    def _identify(self, membership, pin):
        return self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/identify/",
            {
                "participant_kind": "member",
                "membership_id": membership.id,
                "pin": pin,
            },
            format="json",
        )

    def _perform(self, membership, pin):
        return self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/perform/",
            {
                "participant_kind": "member",
                "membership_id": membership.id,
                "action": "check_in",
                "pin": pin,
                "pin_verified": True,
            },
            format="json",
        )

    def test_correct_pin_identifies(self):
        response = self._identify(self.membership_a, "1111")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["code"], "ok")

    def test_bad_pin_rejected(self):
        response = self._identify(self.membership_a, "0000")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "invalid_pin")

    def test_repeated_bad_pins_throttle(self):
        for _ in range(3):
            response = self._identify(self.membership_a, "0000")
            self.assertEqual(response.status_code, 400)
        blocked = self._identify(self.membership_a, "0000")
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.data["code"], "rate_limited")

    def test_participant_a_failures_do_not_lock_participant_b(self):
        for _ in range(3):
            self._identify(self.membership_a, "0000")
        blocked_a = self._identify(self.membership_a, "0000")
        self.assertEqual(blocked_a.status_code, 429)
        ok_b = self._identify(self.membership_b, "2222")
        self.assertEqual(ok_b.status_code, 200)

    def test_successful_auth_clears_failure_counter(self):
        for _ in range(2):
            self._identify(self.membership_a, "0000")
        ok = self._identify(self.membership_a, "1111")
        self.assertEqual(ok.status_code, 200)
        # After success, three fresh failures are allowed again.
        for _ in range(3):
            response = self._identify(self.membership_a, "0000")
            self.assertEqual(response.status_code, 400)
        blocked = self._identify(self.membership_a, "0000")
        self.assertEqual(blocked.status_code, 429)

    def test_perform_still_verifies_and_throttles(self):
        # Identify succeeds first (required UX), then perform re-checks PIN.
        identify = self._identify(self.membership_a, "1111")
        self.assertEqual(identify.status_code, 200)
        for _ in range(3):
            response = self._perform(self.membership_a, "0000")
            self.assertEqual(response.status_code, 400)
        blocked = self._perform(self.membership_a, "0000")
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.data["code"], "rate_limited")

    def test_forged_pin_verified_does_not_bypass_perform_check(self):
        identify = self._identify(self.membership_a, "1111")
        self.assertEqual(identify.status_code, 200)
        forged = self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/perform/",
            {
                "participant_kind": "member",
                "membership_id": self.membership_a.id,
                "action": "check_in",
                "pin": "9999",
                "pin_verified": True,
            },
            format="json",
        )
        self.assertEqual(forged.status_code, 400)

    def test_omitted_pin_verified_still_requires_real_pin(self):
        identify = self._identify(self.membership_a, "1111")
        self.assertEqual(identify.status_code, 200)
        missing_flag = self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/perform/",
            {
                "participant_kind": "member",
                "membership_id": self.membership_a.id,
                "action": "check_in",
                "pin": "1111",
            },
            format="json",
        )
        self.assertEqual(missing_flag.status_code, 200)

    def test_visitor_participation_pin_throttles(self):
        for _ in range(3):
            response = self.client.post(
                f"/api/groups/{self.group.pk}/kiosk/identify/",
                {
                    "participant_kind": "group_only_participant",
                    "group_only_participant_id": self.visitor.id,
                    "pin": "0000",
                },
                format="json",
            )
            self.assertEqual(response.status_code, 400)
        blocked = self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/identify/",
            {
                "participant_kind": "group_only_participant",
                "group_only_participant_id": self.visitor.id,
                "pin": "0000",
            },
            format="json",
        )
        self.assertEqual(blocked.status_code, 429)


@override_settings(
    PARTICIPATION_PIN_VERIFY_LIMIT=3,
    PARTICIPATION_PIN_VERIFY_WINDOW=60,
    PARTICIPATION_PIN_GROUP_IP_LIMIT=40,
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "participation-pin-input-rl",
        },
        "ratelimit": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "participation-pin-input-rl",
        },
    },
)
class InputModeParticipationPinRateLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(
            email="pin-input-rl@example.com",
            password="secure-password",
        )
        self.owner.mark_email_verified()
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Input PIN RL",
            check_in_enabled=True,
            require_pin=True,
        )
        configure_group_kiosk_for_launch(
            self.group,
            mode=KioskType.INPUT,
            use_pin=False,
            input_field_count=2,
            input_second_field=KioskInputSecondField.PIN,
        )
        self.member = Member.objects.create_member(
            organization=self.org, name="Input Ada"
        )
        from groups.participant_codes import format_group_participant_code

        self.membership = GroupMembership.objects.create(
            organization=self.org,
            group=self.group,
            member=self.member,
            status=GroupMembershipStatus.ACTIVE,
            group_participant_code=format_group_participant_code(self.group.pk, 1111),
        )
        self.membership.set_participation_pin("4444")
        self.membership.save(update_fields=["participation_pin_hash"])
        self.client.post(f"/api/groups/{self.group.pk}/kiosk/")

    def test_input_mode_pin_failures_throttle(self):
        for _ in range(3):
            response = self.client.post(
                f"/api/groups/{self.group.pk}/kiosk/identify/",
                {
                    "participant_code": self.membership.group_participant_code,
                    "pin": "0000",
                },
                format="json",
            )
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data["code"], "invalid_pin")
        blocked = self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/identify/",
            {
                "participant_code": self.membership.group_participant_code,
                "pin": "0000",
            },
            format="json",
        )
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.data["code"], "rate_limited")

    def test_input_mode_correct_pin_works(self):
        response = self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/identify/",
            {
                "participant_code": self.membership.group_participant_code,
                "pin": "4444",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
