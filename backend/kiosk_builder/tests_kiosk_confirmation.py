"""Tests for kiosk confirmation screen settings, variables, and runtime payload."""

from datetime import datetime
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from attendance.models import ActionRecord, ActionType
from groups.models import Group, GroupMembership, GroupMembershipStatus
from kiosk_builder.kiosk_confirmation import (
    confirmation_payload_for_perform,
    message_template_for_action,
    render_confirmation_message,
    resolve_confirmation_message,
)
from kiosk_builder.kiosk_settings_constants import (
    CONFIRMATION_RETURN_SECONDS_DEFAULT,
    DEFAULT_CONFIRMATION_MESSAGES,
    KioskConfirmationTemplate,
)
from kiosk_builder.models import ensure_group_kiosk_settings
from members.models import Member
from organizations.models import Organization

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True):
    user = User.objects.create_user(email=email, password=password)
    if verified:
        user.mark_email_verified()
    return user


class KioskConfirmationDefaultsTests(TestCase):
    def setUp(self):
        self.owner = create_user("confirmation-defaults@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="School",
            check_in_enabled=True,
        )
        self.settings = ensure_group_kiosk_settings(self.group)

    def test_default_template_is_clean(self):
        self.assertEqual(self.settings.confirmation_template, KioskConfirmationTemplate.CLEAN)

    def test_default_return_delay_is_three_seconds(self):
        self.assertEqual(
            self.settings.confirmation_return_seconds,
            CONFIRMATION_RETURN_SECONDS_DEFAULT,
        )

    def test_default_effects_are_sound_on_and_vibration_off(self):
        self.assertTrue(self.settings.confirmation_sound_enabled)
        self.assertFalse(self.settings.confirmation_vibration_enabled)

    def test_default_messages_when_fields_blank(self):
        for action_type, expected in DEFAULT_CONFIRMATION_MESSAGES.items():
            self.assertEqual(
                message_template_for_action(self.settings, action_type),
                expected,
            )


class KioskConfirmationValidationTests(TestCase):
    def setUp(self):
        self.password = "secure-password"
        self.owner = create_user("confirmation-api@example.com", password=self.password)
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Lobby",
            check_in_enabled=True,
            check_out_enabled=True,
            breaks_enabled=True,
            max_breaks=1,
        )
        self.settings = ensure_group_kiosk_settings(self.group)
        self.client = APIClient()

    def _login(self):
        response = self.client.post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

    def test_valid_preset_accepted(self):
        self._login()
        for template in KioskConfirmationTemplate.values:
            response = self.client.patch(
                f"/api/groups/{self.group.pk}/kiosk-settings/",
                {"confirmation_template": template},
                format="json",
            )
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["confirmation_template"], template)

    def test_invalid_preset_rejected(self):
        self._login()
        response = self.client.patch(
            f"/api/groups/{self.group.pk}/kiosk-settings/",
            {"confirmation_template": "neon_party"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_return_delay_only_accepts_one_three_five(self):
        self._login()
        for seconds in (1, 3, 5):
            response = self.client.patch(
                f"/api/groups/{self.group.pk}/kiosk-settings/",
                {"confirmation_return_seconds": seconds},
                format="json",
            )
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["confirmation_return_seconds"], seconds)

        response = self.client.patch(
            f"/api/groups/{self.group.pk}/kiosk-settings/",
            {"confirmation_return_seconds": 7},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_message_max_length_validation(self):
        self._login()
        long_text = "x" * 501
        response = self.client.patch(
            f"/api/groups/{self.group.pk}/kiosk-settings/",
            {"confirmation_check_in_message": long_text},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_confirmation_effects_persist_through_settings_api(self):
        self._login()
        response = self.client.patch(
            f"/api/groups/{self.group.pk}/kiosk-settings/",
            {
                "confirmation_sound_enabled": False,
                "confirmation_vibration_enabled": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data["confirmation_sound_enabled"])
        self.assertTrue(response.data["confirmation_vibration_enabled"])
        self.settings.refresh_from_db()
        self.assertFalse(self.settings.confirmation_sound_enabled)
        self.assertTrue(self.settings.confirmation_vibration_enabled)


class KioskConfirmationVariableTests(TestCase):
    def test_name_time_group_variables(self):
        performed_at = datetime(2026, 8, 22, 21, 42, tzinfo=ZoneInfo("UTC"))
        message = render_confirmation_message(
            "Hi {name}, {group} at {time}.",
            name="Aleks",
            group_name="School",
            performed_at=performed_at,
            tz=ZoneInfo("UTC"),
        )
        self.assertEqual(message, "Hi Aleks, School at 21:42.")

    def test_unknown_variable_is_safe(self):
        message = render_confirmation_message(
            "Hello {name} and {unknown}.",
            name="Aleks",
            group_name="School",
            performed_at=None,
        )
        self.assertEqual(message, "Hello Aleks and .")

    def test_twenty_four_hour_time_format(self):
        performed_at = datetime(2026, 8, 22, 9, 5, tzinfo=ZoneInfo("UTC"))
        message = render_confirmation_message(
            "At {time}.",
            performed_at=performed_at,
            tz=ZoneInfo("UTC"),
        )
        self.assertEqual(message, "At 09:05.")


class KioskConfirmationActionMessageTests(TestCase):
    def setUp(self):
        self.owner = create_user("confirmation-actions@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Gym",
            check_in_enabled=True,
            check_out_enabled=True,
            breaks_enabled=True,
            max_breaks=1,
        )
        self.settings = ensure_group_kiosk_settings(self.group)
        self.settings.confirmation_check_in_message = "IN: {name}"
        self.settings.confirmation_check_out_message = "OUT: {name}"
        self.settings.confirmation_break_start_message = "BREAK: {time}"
        self.settings.confirmation_break_end_message = "BACK: {name}"
        self.settings.save()

    def test_action_specific_messages(self):
        now = timezone.now()
        cases = [
            (ActionType.CHECK_IN, "IN: Natsumi"),
            (ActionType.CHECK_OUT, "OUT: Natsumi"),
            (ActionType.BREAK_END, "BACK: Natsumi"),
        ]
        for action_type, expected in cases:
            resolved = resolve_confirmation_message(
                self.settings,
                group=self.group,
                action_type=action_type,
                participant_name="Natsumi",
                performed_at=now,
            )
            self.assertEqual(resolved, expected)

        break_start = resolve_confirmation_message(
            self.settings,
            group=self.group,
            action_type=ActionType.BREAK_START,
            participant_name="Natsumi",
            performed_at=now,
        )
        self.assertTrue(break_start.startswith("BREAK: "))


class KioskConfirmationGroupActionVisibilityTests(TestCase):
    def setUp(self):
        self.owner = create_user("confirmation-visibility@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Check-in only",
            check_in_enabled=True,
            check_out_enabled=False,
        )
        self.settings = ensure_group_kiosk_settings(self.group)
        self.settings.confirmation_check_out_message = "Stored checkout text"
        self.settings.save()

    def test_disabled_action_message_preserved_in_storage(self):
        self.settings.refresh_from_db()
        self.assertEqual(self.settings.confirmation_check_out_message, "Stored checkout text")

    def test_group_actions_exposed_on_settings_api(self):
        client = APIClient()
        client.post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": "secure-password"},
            format="json",
        )
        response = client.get(f"/api/groups/{self.group.pk}/kiosk-settings/")
        self.assertEqual(response.status_code, 200)
        actions = response.data["group_actions"]
        self.assertTrue(actions["check_in_enabled"])
        self.assertFalse(actions["check_out_enabled"])


class KioskConfirmationRuntimeTests(TestCase):
    def setUp(self):
        self.password = "secure-password"
        self.owner = create_user("confirmation-runtime@example.com", password=self.password)
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Runtime Group",
            check_in_enabled=True,
            check_out_enabled=False,
        )
        self.settings = ensure_group_kiosk_settings(self.group)
        self.settings.set_exit_code("1111")
        self.settings.confirmation_template = KioskConfirmationTemplate.FRIENDLY
        self.settings.confirmation_check_in_message = "Thanks {name} at {time}."
        self.settings.confirmation_return_seconds = 1
        self.settings.confirmation_sound_enabled = False
        self.settings.confirmation_vibration_enabled = True
        self.settings.save()
        self.member = Member.objects.create_member(organization=self.org, name="Aleks", pin="")
        self.membership = GroupMembership.objects.create(
            organization=self.org,
            group=self.group,
            member=self.member,
            status=GroupMembershipStatus.ACTIVE,
        )
        self.client = APIClient()
        self.client.post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": self.password},
            format="json",
        )

    def test_perform_success_includes_confirmation_payload(self):
        before = ActionRecord.objects.count()
        response = self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/perform/",
            {
                "participant_kind": "member",
                "membership_id": self.membership.id,
                "action": ActionType.CHECK_IN,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(ActionRecord.objects.count(), before + 1)
        confirmation = response.data["confirmation"]
        self.assertEqual(confirmation["template"], KioskConfirmationTemplate.FRIENDLY)
        self.assertEqual(confirmation["action"], ActionType.CHECK_IN)
        self.assertEqual(confirmation["return_delay_seconds"], 1)
        self.assertFalse(confirmation["sound_enabled"])
        self.assertTrue(confirmation["vibration_enabled"])
        self.assertIn("Aleks", confirmation["message"])
        self.assertEqual(response.data["success_message"], confirmation["message"])
        self.assertEqual(response.data["return_delay_seconds"], 1)

    def test_kiosk_start_includes_confirmation_settings(self):
        response = self.client.get(f"/api/groups/{self.group.pk}/kiosk/")
        self.assertEqual(response.status_code, 200)
        confirmation = response.data["kiosk"]["confirmation"]
        self.assertEqual(confirmation["template"], KioskConfirmationTemplate.FRIENDLY)
        self.assertEqual(confirmation["return_delay_seconds"], 1)
        self.assertFalse(confirmation["sound_enabled"])
        self.assertTrue(confirmation["vibration_enabled"])
        self.assertIn("check_in", confirmation["messages"])

    def test_confirmation_payload_helper_matches_perform(self):
        now = timezone.now()
        payload = confirmation_payload_for_perform(
            self.settings,
            group=self.group,
            action_type=ActionType.CHECK_IN,
            participant_name="Aleks",
            performed_at=now,
        )
        self.assertEqual(payload["template"], KioskConfirmationTemplate.FRIENDLY)
        self.assertIn("Aleks", payload["message"])
