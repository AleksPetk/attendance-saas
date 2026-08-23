"""Tests for Attendance Reset configuration and live kiosk state boundaries."""

import base64
from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from attendance.models import ActionRecord, ActionSource, ActionType
from attendance.services import compute_current_attendance_state
from groups.models import (
    Group,
    GroupMembership,
    GroupMembershipStatus,
    GroupStatus,
)
from kiosk_builder.attendance_reset import (
    compute_daily_reset_boundary,
    compute_effective_reset_boundary,
    get_attendance_reset_timezone,
)
from kiosk_builder.kiosk_settings_constants import AttendanceResetMode
from kiosk_builder.models import ensure_group_kiosk_settings
from kiosk_builder.testing import configure_group_kiosk_for_launch
from members.models import Member
from organizations.models import Organization

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True):
    user = User.objects.create_user(email=email, password=password)
    if verified:
        user.mark_email_verified()
    return user


def basic_auth(email, password="secure-password"):
    token = base64.b64encode(f"{email}:{password}".encode()).decode()
    return f"Basic {token}"


class AttendanceResetBoundaryTests(TestCase):
    def setUp(self):
        self.owner = create_user("reset-boundary@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Reset Group",
            check_in_enabled=True,
            check_out_enabled=True,
            breaks_enabled=True,
            max_breaks=2,
        )
        self.settings = configure_group_kiosk_for_launch(self.group)
        self.member = Member.objects.create_member(organization=self.org, name="Jimi")
        self.membership = GroupMembership.objects.create(
            organization=self.org,
            group=self.group,
            member=self.member,
            status=GroupMembershipStatus.ACTIVE,
        )
        self.tz = get_attendance_reset_timezone(self.org)

    def _create_record(self, action_type, performed_at, *, member=None):
        member = member or self.member
        return ActionRecord.objects.create(
            organization=self.org,
            group=self.group,
            source_group_id=self.group.pk,
            participant_kind="member",
            member=member,
            action_type=action_type,
            source=ActionSource.KIOSK,
            performed_at=performed_at,
            participant_name_snapshot=member.name,
            group_name_snapshot=self.group.name,
        )

    def test_default_daily_midnight_boundary(self):
        self.assertEqual(self.settings.attendance_reset_mode, AttendanceResetMode.DAILY)
        self.assertEqual(self.settings.attendance_reset_daily_time, time.min)

    @override_settings(TIME_ZONE="UTC")
    def test_daily_midnight_ignores_previous_day_actions(self):
        now = timezone.make_aware(datetime(2026, 8, 22, 10, 0))
        yesterday = timezone.make_aware(datetime(2026, 8, 21, 23, 55))
        self._create_record(ActionType.CHECK_IN, yesterday)
        state = compute_current_attendance_state(
            group=self.group,
            participant_kind="member",
            member_id=self.member.pk,
            now=now,
        )
        self.assertFalse(state["is_checked_in"])

    @override_settings(TIME_ZONE="UTC")
    def test_daily_noon_boundary(self):
        self.settings.attendance_reset_daily_time = time(12, 0)
        self.settings.save()
        now = timezone.make_aware(datetime(2026, 8, 22, 13, 0))
        before_noon = timezone.make_aware(datetime(2026, 8, 22, 11, 30))
        self._create_record(ActionType.CHECK_IN, before_noon)
        state = compute_current_attendance_state(
            group=self.group,
            participant_kind="member",
            member_id=self.member.pk,
            now=now,
        )
        self.assertFalse(state["is_checked_in"])

    @override_settings(TIME_ZONE="UTC")
    def test_daily_custom_time_shared_boundary(self):
        self.settings.attendance_reset_daily_time = time(15, 47)
        self.settings.save()
        member2 = Member.objects.create_member(organization=self.org, name="Clara")
        GroupMembership.objects.create(
            organization=self.org,
            group=self.group,
            member=member2,
            status=GroupMembershipStatus.ACTIVE,
        )
        self._create_record(ActionType.CHECK_IN, timezone.make_aware(datetime(2026, 8, 22, 4, 0)))
        self._create_record(
            ActionType.CHECK_IN,
            timezone.make_aware(datetime(2026, 8, 22, 15, 46)),
            member=member2,
        )
        before = timezone.make_aware(datetime(2026, 8, 22, 15, 46, 30))
        self.assertTrue(
            compute_current_attendance_state(
                group=self.group,
                participant_kind="member",
                member_id=self.member.pk,
                now=before,
            )["is_checked_in"]
        )
        after = timezone.make_aware(datetime(2026, 8, 22, 15, 47))
        self.assertFalse(
            compute_current_attendance_state(
                group=self.group,
                participant_kind="member",
                member_id=self.member.pk,
                now=after,
            )["is_checked_in"]
        )
        self.assertFalse(
            compute_current_attendance_state(
                group=self.group,
                participant_kind="member",
                member_id=member2.pk,
                now=after,
            )["is_checked_in"]
        )

    @override_settings(TIME_ZONE="UTC")
    def test_daily_boundary_function(self):
        boundary = compute_daily_reset_boundary(
            reset_time=time(15, 47),
            tz=self.tz,
            now=timezone.make_aware(datetime(2026, 8, 22, 16, 0)),
        )
        self.assertEqual(boundary, timezone.make_aware(datetime(2026, 8, 22, 15, 47)))

    @override_settings(TIME_ZONE="UTC")
    def test_rolling_one_hour_not_fresh_before_expiry(self):
        self.settings.attendance_reset_mode = AttendanceResetMode.ROLLING
        self.settings.attendance_reset_rolling_hours = 1
        self.settings.attendance_reset_rolling_minutes = 0
        self.settings.save()
        check_in_at = timezone.make_aware(datetime(2026, 8, 22, 13, 0))
        self._create_record(ActionType.CHECK_IN, check_in_at)
        records = list(
            ActionRecord.objects.filter(group=self.group, member=self.member).order_by("performed_at")
        )
        before = compute_effective_reset_boundary(
            kiosk_settings=self.settings,
            organization=self.org,
            participant_records=records,
            now=timezone.make_aware(datetime(2026, 8, 22, 13, 59)),
        )
        self.assertIsNone(before)
        after = compute_effective_reset_boundary(
            kiosk_settings=self.settings,
            organization=self.org,
            participant_records=records,
            now=timezone.make_aware(datetime(2026, 8, 22, 14, 0)),
        )
        self.assertEqual(after, check_in_at + timedelta(hours=1))

    @override_settings(TIME_ZONE="UTC")
    def test_rolling_overnight_participant_specific(self):
        self.settings.attendance_reset_mode = AttendanceResetMode.ROLLING
        self.settings.attendance_reset_rolling_hours = 1
        self.settings.attendance_reset_rolling_minutes = 0
        self.settings.save()
        check_in_at = timezone.make_aware(datetime(2026, 8, 22, 23, 30))
        self._create_record(ActionType.CHECK_IN, check_in_at)
        records = list(
            ActionRecord.objects.filter(group=self.group, member=self.member).order_by("performed_at")
        )
        boundary = compute_effective_reset_boundary(
            kiosk_settings=self.settings,
            organization=self.org,
            participant_records=records,
            now=timezone.make_aware(datetime(2026, 8, 23, 0, 30)),
        )
        self.assertEqual(boundary, check_in_at + timedelta(hours=1))

    @override_settings(TIME_ZONE="UTC")
    def test_rolling_break_and_checkout_do_not_extend_anchor(self):
        self.settings.attendance_reset_mode = AttendanceResetMode.ROLLING
        self.settings.attendance_reset_rolling_hours = 8
        self.settings.attendance_reset_rolling_minutes = 0
        self.settings.save()
        check_in_at = timezone.make_aware(datetime(2026, 8, 22, 9, 0))
        self._create_record(ActionType.CHECK_IN, check_in_at)
        self._create_record(ActionType.BREAK_START, check_in_at + timedelta(hours=3))
        self._create_record(ActionType.BREAK_END, check_in_at + timedelta(hours=3, minutes=30))
        self._create_record(ActionType.CHECK_OUT, check_in_at + timedelta(hours=7))
        records = list(
            ActionRecord.objects.filter(group=self.group, member=self.member).order_by("performed_at")
        )
        boundary = compute_effective_reset_boundary(
            kiosk_settings=self.settings,
            organization=self.org,
            participant_records=records,
            now=check_in_at + timedelta(hours=8),
        )
        self.assertEqual(boundary, check_in_at + timedelta(hours=8))

    @override_settings(TIME_ZONE="UTC")
    def test_rolling_custom_fifteen_minutes(self):
        self.settings.attendance_reset_mode = AttendanceResetMode.ROLLING
        self.settings.attendance_reset_rolling_hours = 0
        self.settings.attendance_reset_rolling_minutes = 15
        self.settings.save()
        check_in_at = timezone.make_aware(datetime(2026, 8, 22, 10, 0))
        self._create_record(ActionType.CHECK_IN, check_in_at)
        state = compute_current_attendance_state(
            group=self.group,
            participant_kind="member",
            member_id=self.member.pk,
            now=check_in_at + timedelta(minutes=15),
        )
        self.assertFalse(state["is_checked_in"])

    @override_settings(TIME_ZONE="UTC")
    def test_after_reset_break_count_does_not_leak(self):
        self.settings.attendance_reset_mode = AttendanceResetMode.ROLLING
        self.settings.attendance_reset_rolling_hours = 1
        self.settings.save()
        start = timezone.make_aware(datetime(2026, 8, 22, 8, 0))
        self._create_record(ActionType.CHECK_IN, start)
        self._create_record(ActionType.BREAK_START, start + timedelta(minutes=10))
        self._create_record(ActionType.BREAK_END, start + timedelta(minutes=20))
        self._create_record(ActionType.BREAK_START, start + timedelta(minutes=30))
        self._create_record(ActionType.BREAK_END, start + timedelta(minutes=40))
        state = compute_current_attendance_state(
            group=self.group,
            participant_kind="member",
            member_id=self.member.pk,
            now=start + timedelta(hours=1),
        )
        self.assertFalse(state["is_checked_in"])
        self.assertEqual(state["break_count"], 0)

    @override_settings(TIME_ZONE="UTC")
    def test_manual_reset_with_daily_schedule_unchanged(self):
        self.settings.attendance_reset_daily_time = time.min
        self.settings.save()
        self._create_record(ActionType.CHECK_IN, timezone.make_aware(datetime(2026, 8, 22, 8, 0)))
        manual_at = timezone.make_aware(datetime(2026, 8, 22, 14, 0))
        self.settings.manual_reset_at = manual_at
        self.settings.save()
        state = compute_current_attendance_state(
            group=self.group,
            participant_kind="member",
            member_id=self.member.pk,
            now=timezone.make_aware(datetime(2026, 8, 22, 15, 0)),
        )
        self.assertFalse(state["is_checked_in"])
        self.assertEqual(self.settings.attendance_reset_daily_time, time.min)


class AttendanceResetNowAPITests(TestCase):
    def setUp(self):
        self.password = "secure-password"
        self.owner = create_user("reset-now@example.com", password=self.password)
        self.other = create_user("other-reset@example.com", password=self.password)
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        Organization.objects.create_with_owner(owner=self.other)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Reset Now",
            check_in_enabled=True,
            check_out_enabled=True,
        )
        self.settings = configure_group_kiosk_for_launch(self.group)
        self.member = Member.objects.create_member(organization=self.org, name="Natsumi")
        GroupMembership.objects.create(
            organization=self.org,
            group=self.group,
            member=self.member,
            status=GroupMembershipStatus.ACTIVE,
        )
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=basic_auth(self.owner.email, self.password))
        ActionRecord.objects.create(
            organization=self.org,
            group=self.group,
            source_group_id=self.group.pk,
            participant_kind="member",
            member=self.member,
            action_type=ActionType.CHECK_IN,
            source=ActionSource.KIOSK,
            performed_at=timezone.now() - timedelta(hours=2),
            participant_name_snapshot="Natsumi",
            group_name_snapshot=self.group.name,
        )

    def test_reset_now_creates_manual_boundary(self):
        response = self.client.post(f"/api/groups/{self.group.pk}/kiosk-settings/reset-now/")
        self.assertEqual(response.status_code, 200)
        self.settings.refresh_from_db()
        self.assertIsNotNone(self.settings.manual_reset_at)
        state = compute_current_attendance_state(
            group=self.group,
            participant_kind="member",
            member_id=self.member.pk,
        )
        self.assertFalse(state["is_checked_in"])
        self.assertEqual(ActionRecord.objects.filter(group=self.group).count(), 1)

    def test_reset_now_preserves_scheduled_settings(self):
        self.settings.attendance_reset_mode = AttendanceResetMode.ROLLING
        self.settings.attendance_reset_rolling_hours = 12
        self.settings.attendance_reset_rolling_minutes = 30
        self.settings.save()
        response = self.client.post(f"/api/groups/{self.group.pk}/kiosk-settings/reset-now/")
        self.assertEqual(response.status_code, 200)
        self.settings.refresh_from_db()
        self.assertEqual(self.settings.attendance_reset_mode, AttendanceResetMode.ROLLING)
        self.assertEqual(self.settings.attendance_reset_rolling_hours, 12)
        self.assertEqual(self.settings.attendance_reset_rolling_minutes, 30)

    def test_reset_now_blocked_cross_tenant(self):
        other_client = APIClient()
        other_client.credentials(HTTP_AUTHORIZATION=basic_auth(self.other.email, self.password))
        response = other_client.post(f"/api/groups/{self.group.pk}/kiosk-settings/reset-now/")
        self.assertEqual(response.status_code, 404)

    def test_reset_now_unavailable_for_archived_group(self):
        self.group.status = GroupStatus.ARCHIVED
        self.group.save()
        response = self.client.post(f"/api/groups/{self.group.pk}/kiosk-settings/reset-now/")
        self.assertEqual(response.status_code, 404)


class AttendanceResetSettingsAPITests(TestCase):
    def setUp(self):
        self.password = "secure-password"
        self.owner = create_user("reset-settings@example.com", password=self.password)
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Settings Reset",
            check_in_enabled=True,
        )
        configure_group_kiosk_for_launch(self.group)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=basic_auth(self.owner.email, self.password))

    def test_get_includes_reset_fields(self):
        response = self.client.get(f"/api/groups/{self.group.pk}/kiosk-settings/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["attendance_reset_mode"], "daily")
        self.assertEqual(response.data["attendance_reset_daily_time"], "00:00:00")
        self.assertEqual(response.data["attendance_reset_rolling_hours"], 8)
        self.assertEqual(response.data["attendance_reset_rolling_minutes"], 0)
        self.assertIsNone(response.data["manual_reset_at"])

    def test_patch_rolling_custom_duration(self):
        response = self.client.patch(
            f"/api/groups/{self.group.pk}/kiosk-settings/",
            {
                "attendance_reset_mode": "rolling",
                "attendance_reset_rolling_hours": 1,
                "attendance_reset_rolling_minutes": 30,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["attendance_reset_mode"], "rolling")
        self.assertEqual(response.data["attendance_reset_rolling_hours"], 1)
        self.assertEqual(response.data["attendance_reset_rolling_minutes"], 30)

    def test_patch_rejects_zero_rolling_duration(self):
        response = self.client.patch(
            f"/api/groups/{self.group.pk}/kiosk-settings/",
            {
                "attendance_reset_mode": "rolling",
                "attendance_reset_rolling_hours": 0,
                "attendance_reset_rolling_minutes": 0,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
