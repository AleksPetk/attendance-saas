"""Tests for Group KioskSettings model, API, readiness, and runtime integration."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from groups.models import (
    Group,
    GroupMembership,
    GroupMembershipStatus,
    KioskMode,
)
from kiosk_builder.kiosk_settings_constants import KioskInputSecondField, KioskType
from kiosk_builder.kiosk_settings_validation import compute_kiosk_readiness, validate_exit_code
from kiosk_builder.models import KioskSettings, ensure_group_kiosk_settings
from members.models import Member
from organizations.models import Organization

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True):
    user = User.objects.create_user(email=email, password=password)
    if verified:
        user.mark_email_verified()
    return user


class KioskSettingsModelTests(TestCase):
    def setUp(self):
        self.owner = create_user("kiosk-settings-owner@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Lobby",
            check_in_enabled=True,
            check_out_enabled=False,
        )

    def test_group_auto_creates_kiosk_settings(self):
        settings = ensure_group_kiosk_settings(self.group)
        self.assertEqual(KioskSettings.objects.filter(group=self.group).count(), 1)
        self.assertEqual(settings.organization_id, self.org.pk)
        self.assertEqual(settings.mode, KioskType.CARD)
        self.assertFalse(settings.has_exit_code)

    def test_exit_code_hashed_and_verified(self):
        settings = ensure_group_kiosk_settings(self.group)
        settings.set_exit_code("1111")
        settings.save()
        self.assertTrue(settings.has_exit_code)
        self.assertNotEqual(settings.exit_code_hash, "1111")
        self.assertTrue(settings.check_exit_code("1111"))
        self.assertFalse(settings.check_exit_code("2222"))

    def test_exit_code_validation(self):
        validate_exit_code("1111")
        validate_exit_code("sd6j")
        validate_exit_code("ABCD")
        validate_exit_code("123456")
        with self.assertRaises(Exception):
            validate_exit_code("abc")
        with self.assertRaises(Exception):
            validate_exit_code("12345678901")

    def test_pin_forces_participant_code_visible(self):
        self.group.require_pin = True
        self.group.save()
        settings = ensure_group_kiosk_settings(self.group)
        settings.mode = KioskType.CARD
        settings.use_pin = True
        settings.card_show_participant_code = False
        settings.save()
        settings.refresh_from_db()
        self.assertTrue(settings.card_show_participant_code)

    def test_group_pin_disabled_normalizes_kiosk_settings(self):
        self.group.require_pin = True
        self.group.save()
        settings = ensure_group_kiosk_settings(self.group)
        settings.use_pin = True
        settings.set_exit_code("1111")
        settings.save()
        self.group.require_pin = False
        self.group.save()
        from kiosk_builder.kiosk_settings_validation import repair_kiosk_settings_for_group

        repair_kiosk_settings_for_group(self.group)
        settings.refresh_from_db()
        self.assertFalse(settings.use_pin)
        status = compute_kiosk_readiness(settings, group=self.group)
        self.assertTrue(status["ready"])
        self.assertFalse(any("PIN" in issue for issue in status["issues"]))


class KioskSettingsAPITests(TestCase):
    def setUp(self):
        self.password = "secure-password"
        self.owner = create_user("kiosk-settings-api@example.com", password=self.password)
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.other_owner = create_user("other-kiosk-settings@example.com", password=self.password)
        self.other_org = Organization.objects.create_with_owner(owner=self.other_owner)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="API Group",
            check_in_enabled=True,
            check_out_enabled=False,
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

    def test_get_settings_includes_readiness(self):
        self._login()
        response = self.client.get(f"/api/groups/{self.group.pk}/kiosk-settings/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["readiness"]["ready"])
        self.assertIn("Exit code required", response.data["readiness"]["issues"])
        self.assertNotIn("header_enabled", response.data)
        self.assertNotIn("footer_enabled", response.data)

    def test_settings_model_has_no_structure_fields(self):
        field_names = {f.name for f in KioskSettings._meta.get_fields()}
        self.assertNotIn("header_enabled", field_names)
        self.assertNotIn("footer_enabled", field_names)

    def test_patch_settings_and_exit_code(self):
        self._login()
        response = self.client.patch(
            f"/api/groups/{self.group.pk}/kiosk-settings/",
            {
                "mode": "input",
                "input_field_count": 2,
                "input_second_field": KioskInputSecondField.NAME,
                "exit_code": "1111",
                "exit_code_confirm": "1111",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["exit_code_configured"])
        self.assertTrue(response.data["readiness"]["ready"])
        self.settings.refresh_from_db()
        self.assertEqual(self.settings.mode, KioskType.INPUT)
        self.assertEqual(self.settings.input_field_count, 2)

    def test_email_option_cleared_when_group_email_disabled(self):
        self._login()
        response = self.client.patch(
            f"/api/groups/{self.group.pk}/kiosk-settings/",
            {"card_show_email": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.settings.refresh_from_db()
        self.assertFalse(self.settings.card_show_email)
        self.assertFalse(response.data["card_show_email"])

    def test_tenant_isolation(self):
        self.client.post(
            "/api/auth/login/",
            {"email": self.other_owner.email, "password": self.password},
            format="json",
        )
        response = self.client.get(f"/api/groups/{self.group.pk}/kiosk-settings/")
        self.assertEqual(response.status_code, 404)


class KioskRuntimeIdentificationTests(TestCase):
    def setUp(self):
        self.password = "secure-password"
        self.owner = create_user("kiosk-runtime@example.com", password=self.password)
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Runtime Group",
            check_in_enabled=True,
            check_out_enabled=False,
        )
        self.settings = ensure_group_kiosk_settings(self.group)
        self.settings.mode = KioskType.INPUT
        self.settings.input_field_count = 2
        self.settings.input_second_field = KioskInputSecondField.NAME
        self.settings.set_exit_code("1111")
        self.settings.save()
        self.member = Member.objects.create_member(
            organization=self.org,
            name="Alex Chen",
        )
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

    def test_input_identify_by_code_and_name(self):
        code = self.membership.group_participant_code
        response = self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/identify/",
            {"participant_code": code, "name": "Alex Chen"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["code"], "ok")

    def test_launch_blocked_without_exit_code(self):
        fresh = Group.objects.create_group(
            organization=self.org,
            name="No Exit",
            check_in_enabled=True,
            check_out_enabled=False,
        )
        ensure_group_kiosk_settings(fresh)
        response = self.client.post(f"/api/groups/{fresh.pk}/kiosk/", format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "kiosk_settings_invalid")

    def test_exit_uses_kiosk_code_not_password(self):
        self.client.post(f"/api/groups/{self.group.pk}/kiosk/", format="json")
        bad = self.client.post("/api/kiosk/exit/", {"password": self.password}, format="json")
        self.assertEqual(bad.status_code, 400)
        good = self.client.post("/api/kiosk/exit/", {"exit_code": "1111"}, format="json")
        self.assertEqual(good.status_code, 200)
        self.assertFalse(good.data["kiosk_locked"])

    def test_card_list_excludes_archived_member(self):
        self.settings.mode = KioskType.CARD
        self.settings.save()
        self.member.archive()
        response = self.client.get(f"/api/groups/{self.group.pk}/kiosk/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["people"], [])

    def test_card_pin_not_in_list_payload(self):
        self.group.require_pin = True
        self.group.save()
        self.membership.set_participation_pin("1234")
        self.membership.save()
        self.settings.mode = KioskType.CARD
        self.settings.use_pin = True
        self.settings.save()
        response = self.client.get(f"/api/groups/{self.group.pk}/kiosk/")
        self.assertEqual(response.status_code, 200)
        for person in response.data["people"]:
            self.assertNotIn("pin", person)
            self.assertNotIn("has_pin", person)


class KioskSettingsGroupCapabilityNormalizationTests(TestCase):
    def setUp(self):
        self.password = "secure-password"
        self.owner = create_user("kiosk-cap-deps@example.com", password=self.password)
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Capability Group",
            check_in_enabled=True,
            check_out_enabled=False,
        )
        self.settings = ensure_group_kiosk_settings(self.group)
        self.settings.set_exit_code("1111")
        self.settings.save()
        self.member = Member.objects.create_member(
            organization=self.org,
            name="Alex Chen",
            email="alex@example.com",
        )
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

    def test_group_pin_off_clears_card_use_pin_via_api(self):
        self.group.require_pin = True
        self.group.save()
        self.settings.mode = KioskType.CARD
        self.settings.use_pin = True
        self.settings.save()
        response = self.client.patch(
            f"/api/groups/{self.group.pk}/",
            {"participation": {"pin_required": False}},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.settings.refresh_from_db()
        self.assertFalse(self.settings.use_pin)
        status = compute_kiosk_readiness(self.settings, group=self.group)
        self.assertTrue(status["ready"])

    def test_group_pin_off_normalizes_input_pin_second_field(self):
        self.group.require_pin = True
        self.group.save()
        self.settings.mode = KioskType.INPUT
        self.settings.input_field_count = 2
        self.settings.input_second_field = KioskInputSecondField.PIN
        self.settings.save()
        self.client.patch(
            f"/api/groups/{self.group.pk}/",
            {"participation": {"pin_required": False}},
            format="json",
        )
        self.settings.refresh_from_db()
        self.assertEqual(self.settings.input_field_count, 1)
        self.assertEqual(self.settings.input_second_field, "")

    def test_group_pin_off_preserves_participation_pin(self):
        self.membership.set_participation_pin("1234")
        self.membership.save()
        self.group.require_pin = True
        self.group.save()
        self.settings.use_pin = True
        self.settings.save()
        self.client.patch(
            f"/api/groups/{self.group.pk}/",
            {"participation": {"pin_required": False}},
            format="json",
        )
        self.membership.refresh_from_db()
        self.assertTrue(self.membership.check_effective_pin("1234"))
        self.assertTrue(self.membership.has_participation_pin)
        self.assertNotEqual(self.membership.participation_pin_hash, "1234")

    def test_re_enabling_group_pin_does_not_auto_enable_kiosk_pin(self):
        self.group.require_pin = True
        self.group.save()
        self.settings.use_pin = True
        self.settings.save()
        self.client.patch(
            f"/api/groups/{self.group.pk}/",
            {"participation": {"pin_required": False}},
            format="json",
        )
        self.settings.refresh_from_db()
        self.assertFalse(self.settings.use_pin)
        self.client.patch(
            f"/api/groups/{self.group.pk}/",
            {"participation": {"pin_required": True}},
            format="json",
        )
        self.settings.refresh_from_db()
        self.assertFalse(self.settings.use_pin)

    def test_group_email_off_clears_card_show_email(self):
        self.group.require_email = True
        self.group.save()
        self.settings.card_show_email = True
        self.settings.save()
        self.client.patch(
            f"/api/groups/{self.group.pk}/",
            {"participation": {"email_required": False}},
            format="json",
        )
        self.settings.refresh_from_db()
        self.assertFalse(self.settings.card_show_email)

    def test_group_email_off_normalizes_input_email_second_field(self):
        self.group.require_email = True
        self.group.save()
        self.settings.mode = KioskType.INPUT
        self.settings.input_field_count = 2
        self.settings.input_second_field = KioskInputSecondField.EMAIL
        self.settings.save()
        self.client.patch(
            f"/api/groups/{self.group.pk}/",
            {"participation": {"email_required": False}},
            format="json",
        )
        self.settings.refresh_from_db()
        self.assertEqual(self.settings.input_field_count, 1)
        self.assertEqual(self.settings.input_second_field, "")

    def test_group_email_off_preserves_participation_email(self):
        self.membership.participation_email = "group@example.com"
        self.membership.save()
        self.group.require_email = True
        self.group.save()
        self.settings.card_show_email = True
        self.settings.save()
        self.client.patch(
            f"/api/groups/{self.group.pk}/",
            {"participation": {"email_required": False}},
            format="json",
        )
        self.membership.refresh_from_db()
        self.assertEqual(self.membership.participation_email, "group@example.com")

    def test_legacy_stale_kiosk_pin_repaired_on_get(self):
        self.group.require_pin = False
        self.group.save()
        self.settings.use_pin = True
        KioskSettings.objects.filter(pk=self.settings.pk).update(use_pin=True)
        response = self.client.get(f"/api/groups/{self.group.pk}/kiosk-settings/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["use_pin"])
        self.settings.refresh_from_db()
        self.assertFalse(self.settings.use_pin)
        self.assertTrue(response.data["readiness"]["ready"])
