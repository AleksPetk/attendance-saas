"""Tests for themed after-action notification email rendering."""

from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from accounts.models import User
from attendance.attendance_report import (
    _format_local_time,
    format_local_action_time,
    get_report_timezone,
)
from attendance.models import ActionRecord, ActionSource, ActionType
from groups.models import Group, GroupType
from groups.notification_email_render import (
    build_html_body,
    build_plain_text_body,
    escape_multiline_html,
    format_notification_time,
    render_after_action_notification,
    resolve_group_flow_template_key,
)
from groups.notification_email_themes import (
    EMAIL_THEME_STYLES,
    all_kiosk_template_keys,
    email_theme_coverage,
    get_email_theme,
    normalize_email_theme_key,
)
from kiosk_builder.kiosk_settings_constants import KioskType
from kiosk_builder.models import ensure_group_kiosk_settings
from kiosk_builder.presets import CARD_TEMPLATES, INPUT_TEMPLATES
from organizations.models import Organization


class NotificationEmailThemeRegistryTests(SimpleTestCase):
    def test_unknown_template_falls_back_safely(self):
        self.assertEqual(normalize_email_theme_key("neon_disco"), "clean")
        self.assertEqual(normalize_email_theme_key(""), "clean")
        self.assertEqual(normalize_email_theme_key(None), "clean")

    def test_every_card_and_input_key_resolves(self):
        for key in all_kiosk_template_keys():
            theme = get_email_theme(key)
            self.assertEqual(theme["key"], normalize_email_theme_key(key))
            self.assertIn("accent", theme)
            self.assertIn("panel_bg", theme)

    def test_explicit_coverage_includes_showcase_families(self):
        for key in (
            "terminal",
            "kids_bubble",
            "playground",
            "executive",
            "pure",
            "ticket",
            "pass",
            "heart_pop",
            "cyber_hex",
            "victory",
            "comic",
            "clean",
            "business",
        ):
            self.assertIn(key, EMAIL_THEME_STYLES)

    def test_coverage_report_matches_catalog_union(self):
        report = email_theme_coverage()
        expected = len(set(CARD_TEMPLATES) | set(INPUT_TEMPLATES))
        self.assertEqual(report["total"], expected)
        self.assertEqual(len(report["explicit"]) + len(report["fallback_to_default"]), expected)
        # Prefer explicit themes for all current catalog keys.
        self.assertEqual(report["fallback_to_default"], [])


class NotificationEmailRenderUnitTests(SimpleTestCase):
    def test_a_html_and_plain_text_generated(self):
        text = build_plain_text_body(
            brand_name="Sels Academy",
            participant_name="Nami",
            action_type="check_in",
            display_time="10:46",
            customer_message="Hi from sels.\nHave a nice day.",
        )
        html = build_html_body(
            brand_name="Sels Academy",
            participant_name="Nami",
            action_type="check_in",
            display_time="10:46",
            customer_message="Hi from sels.\nHave a nice day.",
            theme_key="terminal",
        )
        self.assertIn("Participant: Nami", text)
        self.assertIn("Action: Checked in", text)
        self.assertIn("Time: 10:46", text)
        self.assertIn("Hi from sels.", text)
        self.assertIn("Sent via Check Station", text)
        self.assertIn("<!DOCTYPE html>", html)
        self.assertIn("Nami", html)
        self.assertIn("Checked in", html)
        self.assertIn("10:46", html)

    def test_b_template_family_resolves_to_theme(self):
        html = build_html_body(
            brand_name="Group",
            participant_name="Pat",
            action_type="check_out",
            display_time="11:00",
            customer_message="Bye",
            theme_key="kids_bubble",
        )
        self.assertIn("#A855F7", html)
        self.assertIn("★", html)

        terminal = build_html_body(
            brand_name="Group",
            participant_name="Pat",
            action_type="check_in",
            display_time="11:00",
            customer_message="Ok",
            theme_key="terminal",
        )
        self.assertIn("SFMono-Regular", terminal)
        self.assertIn("#4ADE80", terminal)

    def test_c_customer_message_safely_escaped(self):
        html = build_html_body(
            brand_name='Org <script>alert(1)</script>',
            participant_name='Bob <img src=x onerror=alert(1)>',
            action_type="check_in",
            display_time="09:00",
            customer_message='Hello <b>world</b> & "friends"',
            theme_key="clean",
        )
        self.assertNotIn("<script>", html)
        self.assertNotIn("<img src", html)
        self.assertNotIn("<b>world</b>", html)
        self.assertIn("&lt;b&gt;world&lt;/b&gt;", html)
        self.assertIn("&amp;", html)

    def test_d_line_breaks_preserved(self):
        self.assertEqual(
            escape_multiline_html("line1\nline2"),
            "line1<br>\nline2",
        )
        html = build_html_body(
            brand_name="G",
            participant_name="Nami",
            action_type="check_in",
            display_time="10:00",
            customer_message="Hi from sels.\nYour kid checked in.\nHave a nice day.",
            theme_key="executive",
        )
        self.assertIn("Hi from sels.<br>\nYour kid checked in.<br>\nHave a nice day.", html)

    def test_e_template_variables_resolved_in_render(self):
        class FakeGroup:
            id = 1
            name = "School"

        class FakeRecord:
            action_type = ActionType.CHECK_IN
            performed_at = None
            participant_name_snapshot = "Nami"

        rendered = render_after_action_notification(
            group=FakeGroup(),
            action_record=FakeRecord(),
            participant_name="Nami",
            kind="check_in",
            customer_template="Hi. {name} checked in at {time} ({group}).",
            brand_name="Sels",
            theme_key="clean",
        )
        self.assertIn("Nami checked in at", rendered["customer_message"])
        self.assertIn("School", rendered["customer_message"])
        self.assertIn(rendered["customer_message"], rendered["text_body"])
        self.assertIn("Nami", rendered["html_body"])

    def test_f_unknown_theme_falls_back_in_html(self):
        html = build_html_body(
            brand_name="G",
            participant_name="Nami",
            action_type="check_in",
            display_time="10:00",
            customer_message="Hello",
            theme_key="does_not_exist",
        )
        # Falls back to clean accent.
        self.assertIn("#2563EB", html)

    def test_g_html_has_no_js_or_external_css(self):
        for key in ("terminal", "kids_bubble", "executive", "ticket", "cyber_hex", "clean"):
            html = build_html_body(
                brand_name="G",
                participant_name="Nami",
                action_type="break_start",
                display_time="12:00",
                customer_message="Break time",
                theme_key=key,
            )
            lowered = html.lower()
            self.assertNotIn("<script", lowered)
            self.assertNotIn("javascript:", lowered)
            self.assertNotIn("stylesheet", lowered)
            self.assertNotIn("http://", lowered)
            self.assertNotIn("https://", lowered)


@override_settings(
    APP_SECRETS_ENCRYPTION_KEY="",
    SECRET_KEY="test-secret-key-for-notification-email",
)
class NotificationEmailFlowTemplateResolveTests(TestCase):
    def setUp(self):
        owner = User.objects.create_user(
            email="notify-theme@example.com",
            password="password12345",
        )
        owner.email_verified = True
        owner.save(update_fields=["email_verified"])
        self.organization = Organization.objects.create_with_owner(
            owner=owner,
            internal_label="Notify Theme",
        )
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Theme Group",
        )

    def _set_design(self, group=None, *, card="clean", input_template="terminal"):
        from kiosk_builder.config_schema import default_config_for_classic
        from kiosk_builder.models import ensure_group_kiosk_design

        target = group or self.group
        design = ensure_group_kiosk_design(target)
        config = design.config or default_config_for_classic(target.name)
        main = dict(config.get("main") or {})
        main["card_template"] = card
        main["input_template"] = input_template
        config["main"] = main
        design.config = config
        design.save(update_fields=["config", "updated_at"])

    def test_card_mode_uses_card_template(self):
        settings = ensure_group_kiosk_settings(self.group)
        settings.mode = KioskType.CARD
        settings.save(update_fields=["mode", "updated_at"])
        self._set_design(card="heart_pop", input_template="terminal")
        self.assertEqual(resolve_group_flow_template_key(self.group), "heart_pop")

    def test_input_mode_uses_input_template(self):
        settings = ensure_group_kiosk_settings(self.group)
        settings.mode = KioskType.INPUT
        settings.save(update_fields=["mode", "updated_at"])
        self._set_design(card="heart_pop", input_template="cyber_hex")
        self.assertEqual(resolve_group_flow_template_key(self.group), "cyber_hex")

    def test_structured_uses_card_template(self):
        structured = Group.objects.create_group(
            organization=self.organization,
            name="Structured Theme Group",
            group_type=GroupType.STRUCTURED,
        )
        settings = ensure_group_kiosk_settings(structured)
        settings.mode = KioskType.INPUT
        settings.save(update_fields=["mode", "updated_at"])
        self._set_design(structured, card="ticket", input_template="terminal")
        self.assertEqual(resolve_group_flow_template_key(structured), "ticket")

    def test_render_uses_group_theme_and_action_type(self):
        settings = ensure_group_kiosk_settings(self.group)
        settings.mode = KioskType.CARD
        settings.save(update_fields=["mode", "updated_at"])
        self._set_design(card="terminal", input_template="clean")
        ar = ActionRecord(
            organization=self.organization,
            group=self.group,
            source_group_id=self.group.pk,
            participant_kind="member",
            action_type=ActionType.BREAK_END,
            source=ActionSource.KIOSK,
            participant_name_snapshot="Nami",
            group_name_snapshot=self.group.name,
            group_type_snapshot=self.group.group_type,
        )
        rendered = render_after_action_notification(
            group=self.group,
            action_record=ar,
            participant_name="Nami",
            kind="break",
            customer_template="{name} finished at {time}.",
            brand_name="Sels",
        )
        self.assertEqual(rendered["theme_key"], "terminal")
        self.assertIn("Break ended", rendered["text_body"])
        self.assertIn("SFMono-Regular", rendered["html_body"])
        self.assertIn("Nami finished at", rendered["customer_message"])

    def test_after_action_send_includes_themed_multipart(self):
        from unittest.mock import patch

        from attendance.services import perform_action_record_from_kiosk
        from groups.email_sender_testing import (
            mock_batch_send_success,
            save_verified_email_sender,
        )
        from groups.models import GroupMembership
        from members.models import Member

        settings = ensure_group_kiosk_settings(self.group)
        settings.mode = KioskType.CARD
        settings.save(update_fields=["mode", "updated_at"])
        self._set_design(card="kids_bubble", input_template="clean")
        self.group.send_email_after_check_in = True
        self.group.require_email = True
        self.group.save()
        with patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send"):
            save_verified_email_sender(
                group=self.group,
                provider="custom_smtp",
                smtp_host="smtp.example.com",
                smtp_port=587,
                smtp_security="starttls",
                smtp_username="user@example.com",
                from_email="from@example.com",
                from_name="Sels Desk",
                smtp_password="secret-password",
                change_password=True,
            )
        member = Member.objects.create(organization=self.organization, name="Nami")
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=member,
            participation_email="parent@example.com",
        )
        with patch(
            "groups.email_providers.custom_smtp.CustomSMTPProvider.send_messages_batch",
            side_effect=mock_batch_send_success,
        ) as mock_send:
            perform_action_record_from_kiosk(
                group=self.group,
                action_type=ActionType.CHECK_IN,
                participant_kind="member",
                membership=membership,
            )
            mock_send.assert_called_once()
            message = mock_send.call_args.kwargs["messages"][0]
            self.assertIn("Participant: Nami", message["text_body"])
            self.assertIn("<!DOCTYPE html>", message["html_body"])
            self.assertIn("#A855F7", message["html_body"])
            self.assertIn("Checked in", message["html_body"])
            self.assertTrue(message["text_body"])
            self.assertTrue(message["html_body"])


@override_settings(TIME_ZONE="UTC")
class NotificationEmailLocalTimeTests(SimpleTestCase):
    """After-action email times must match History/Report local conversion."""

    def _utc(self, y, m, d, h, mi):
        return timezone.make_aware(datetime(y, m, d, h, mi), ZoneInfo("UTC"))

    def test_a_utc_converts_to_expected_local_email_time(self):
        performed_at = self._utc(2026, 8, 24, 2, 19)
        self.assertEqual(
            format_notification_time(performed_at, timezone_name="Asia/Tokyo"),
            "11:19",
        )

    def test_b_time_variable_uses_local_time(self):
        performed_at = self._utc(2026, 8, 24, 2, 19)

        class FakeGroup:
            organization = None
            name = "School"

        class FakeRecord:
            action_type = ActionType.CHECK_OUT
            participant_name_snapshot = "Mama"

        record = FakeRecord()
        record.performed_at = performed_at

        rendered = render_after_action_notification(
            group=FakeGroup(),
            action_record=record,
            participant_name="Mama",
            kind="check_out",
            customer_template="{name} checked out at {time}",
            brand_name="Desk",
            theme_key="clean",
            timezone_name="Asia/Tokyo",
        )
        self.assertEqual(rendered["customer_message"], "Mama checked out at 11:19")

    def test_c_html_summary_uses_same_local_time(self):
        performed_at = self._utc(2026, 8, 24, 2, 19)

        class FakeGroup:
            organization = None
            name = "School"

        class FakeRecord:
            action_type = ActionType.CHECK_OUT
            participant_name_snapshot = "Mama"

        record = FakeRecord()
        record.performed_at = performed_at

        rendered = render_after_action_notification(
            group=FakeGroup(),
            action_record=record,
            participant_name="Mama",
            kind="check_out",
            customer_template="Done",
            theme_key="clean",
            timezone_name="Asia/Tokyo",
        )
        self.assertIn("Time: 11:19", rendered["text_body"])
        self.assertIn("11:19", rendered["html_body"])

    def test_d_plain_text_fallback_uses_same_local_time(self):
        performed_at = self._utc(2026, 8, 24, 2, 19)
        text = build_plain_text_body(
            brand_name="G",
            participant_name="Mama",
            action_type="check_out",
            display_time=format_notification_time(
                performed_at,
                timezone_name="Asia/Tokyo",
            ),
            customer_message="Mama checked out at 11:19",
        )
        self.assertIn("Time: 11:19", text)
        self.assertIn("Mama checked out at 11:19", text)

    def test_e_midnight_crossover_uses_local_date_time(self):
        performed_at = self._utc(2026, 8, 24, 23, 30)
        self.assertEqual(
            format_notification_time(performed_at, timezone_name="Asia/Tokyo"),
            "08:30",
        )
        tokyo_date = performed_at.astimezone(ZoneInfo("Asia/Tokyo")).date()
        self.assertEqual(tokyo_date.isoformat(), "2026-08-25")

    def test_f_notification_uses_report_timezone_helper(self):
        performed_at = self._utc(2026, 8, 24, 2, 19)
        tz = get_report_timezone(timezone_name="Asia/Tokyo")
        expected = _format_local_time(performed_at, tz)
        self.assertEqual(
            format_local_action_time(performed_at, timezone_name="Asia/Tokyo"),
            expected,
        )
        self.assertEqual(
            format_notification_time(performed_at, timezone_name="Asia/Tokyo"),
            expected,
        )

    def test_g_timezone_not_hardcoded_to_japan(self):
        performed_at = self._utc(2026, 8, 24, 17, 30)
        self.assertEqual(
            format_notification_time(performed_at, timezone_name="America/New_York"),
            "13:30",
        )
        self.assertEqual(
            format_notification_time(performed_at, timezone_name="Europe/London"),
            "18:30",
        )


@override_settings(
    APP_SECRETS_ENCRYPTION_KEY="",
    SECRET_KEY="test-secret-key-for-notification-email",
    TIME_ZONE="UTC",
)
class NotificationEmailLocalTimeIntegrationTests(TestCase):
    def setUp(self):
        owner = User.objects.create_user(
            email="notify-tz@example.com",
            password="password12345",
        )
        owner.email_verified = True
        owner.save(update_fields=["email_verified"])
        self.organization = Organization.objects.create_with_owner(
            owner=owner,
            internal_label="Notify TZ",
        )
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="TZ Group",
        )

    def test_perform_with_timezone_sends_local_time_in_email(self):
        from attendance.services import perform_action_record_from_kiosk
        from groups.email_sender_testing import (
            mock_batch_send_success,
            save_verified_email_sender,
        )
        from groups.models import GroupMembership
        from kiosk_builder.models import ensure_group_kiosk_settings
        from members.models import Member

        self.group.send_email_after_check_in = True
        self.group.require_email = True
        self.group.check_in_email_template = "{name} checked in at {time}"
        self.group.save()
        ensure_group_kiosk_settings(self.group)
        with patch("groups.email_providers.custom_smtp.CustomSMTPProvider._smtp_send"):
            save_verified_email_sender(
                group=self.group,
                provider="custom_smtp",
                smtp_host="smtp.example.com",
                smtp_port=587,
                smtp_security="starttls",
                smtp_username="user@example.com",
                from_email="from@example.com",
                from_name="Desk",
                smtp_password="secret-password",
                change_password=True,
            )
        member = Member.objects.create(organization=self.organization, name="Nami")
        membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=member,
            participation_email="parent@example.com",
        )
        performed_at = timezone.make_aware(
            datetime(2026, 8, 24, 2, 19),
            ZoneInfo("UTC"),
        )
        with patch(
            "groups.email_providers.custom_smtp.CustomSMTPProvider.send_messages_batch",
            side_effect=mock_batch_send_success,
        ) as mock_send:
            perform_action_record_from_kiosk(
                group=self.group,
                action_type=ActionType.CHECK_IN,
                participant_kind="member",
                membership=membership,
                now=performed_at,
                timezone_name="Asia/Tokyo",
            )
            message = mock_send.call_args.kwargs["messages"][0]
            self.assertIn("Nami checked in at 11:19", message["text_body"])
            self.assertIn("Time: 11:19", message["text_body"])
            self.assertIn("11:19", message["html_body"])
