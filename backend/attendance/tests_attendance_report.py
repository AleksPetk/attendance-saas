import base64
import datetime

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from attendance.models import ActionRecord, ActionSource, ActionType
from groups.deletion import permanently_delete_group
from groups.models import Group, GroupStatus
from members.models import Member
from organizations.models import Organization

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True, **extra_fields):
    user = User.objects.create_user(email=email, password=password, **extra_fields)
    if verified:
        user.mark_email_verified()
    return user


def basic_auth_header(identity, password):
    token = base64.b64encode(f"{identity}:{password}".encode()).decode()
    return f"Basic {token}"


class AttendanceReportApiTests(TestCase):
    def setUp(self):
        self.owner = create_user("report-owner@example.com")
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.other_owner = create_user("report-other@example.com")
        self.other_org = Organization.objects.create_with_owner(owner=self.other_owner)

        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header(self.owner.email, "secure-password")
        )
        self.other_client = APIClient()
        self.other_client.credentials(
            HTTP_AUTHORIZATION=basic_auth_header(self.other_owner.email, "secure-password")
        )

        self.group = Group.objects.create_group(
            organization=self.org,
            name="SELS Kids",
            check_in_enabled=True,
            check_out_enabled=True,
            breaks_enabled=True,
            max_breaks=2,
        )
        self.member_aleks = Member.objects.create(
            organization=self.org,
            name="Aleks",
            email="aleks@example.com",
        )
        self.member_nami = Member.objects.create(
            organization=self.org,
            name="Nami",
            email="nami@example.com",
        )

    def _record(self, *, member, action_type, performed_at, group=None, **extra):
        group = group or self.group
        return ActionRecord.objects.create(
            organization=self.org,
            group=group,
            source_group_id=group.pk,
            participant_kind="member",
            member=member,
            action_type=action_type,
            source=ActionSource.KIOSK,
            performed_at=performed_at,
            participant_name_snapshot=member.name,
            participant_email_snapshot=member.email,
            group_name_snapshot=group.name,
            **extra,
        )

    def test_source_group_id_set_on_create_and_survives_permanent_delete(self):
        now = timezone.now()
        record = self._record(
            member=self.member_aleks,
            action_type=ActionType.CHECK_IN,
            performed_at=now,
        )
        self.assertEqual(record.source_group_id, self.group.pk)

        self.group.status = GroupStatus.ARCHIVED
        self.group.save(update_fields=["status", "archived_at", "updated_at"])
        group_id = self.group.pk
        permanently_delete_group(self.group)

        record.refresh_from_db()
        self.assertIsNone(record.group_id)
        self.assertEqual(record.source_group_id, group_id)
        self.assertEqual(record.group_name_snapshot, "SELS Kids")

    def test_report_groups_includes_active_archived_and_deleted(self):
        archived = Group.objects.create_group(organization=self.org, name="Archived Club")
        archived.status = GroupStatus.ARCHIVED
        archived.save(update_fields=["status", "archived_at", "updated_at"])

        doomed = Group.objects.create_group(organization=self.org, name="Old Gym")
        self._record(
            member=self.member_aleks,
            action_type=ActionType.CHECK_IN,
            performed_at=timezone.now(),
            group=doomed,
        )
        doomed.status = GroupStatus.ARCHIVED
        doomed.save(update_fields=["status", "archived_at", "updated_at"])
        doomed_id = doomed.pk
        permanently_delete_group(doomed)

        resp = self.client.get("/api/history/report-groups/")
        self.assertEqual(resp.status_code, 200)
        items = resp.data["items"]
        by_id = {item["source_group_id"]: item for item in items}

        self.assertEqual(by_id[self.group.pk]["status"], GroupStatus.ACTIVE)
        self.assertEqual(by_id[self.group.pk]["name"], "SELS Kids")
        self.assertEqual(by_id[archived.pk]["status"], GroupStatus.ARCHIVED)
        self.assertEqual(by_id[doomed_id]["status"], "deleted")
        self.assertEqual(by_id[doomed_id]["name"], "Old Gym")

    def test_attendance_report_participant_day_grain_and_column_rules(self):
        day = timezone.now().replace(hour=12, minute=0, second=0, microsecond=0)
        # Aleks: first check-in, multiple breaks, last check-out
        self._record(
            member=self.member_aleks,
            action_type=ActionType.CHECK_IN,
            performed_at=day.replace(hour=9, minute=1),
        )
        self._record(
            member=self.member_aleks,
            action_type=ActionType.CHECK_IN,
            performed_at=day.replace(hour=9, minute=30),
        )
        self._record(
            member=self.member_aleks,
            action_type=ActionType.BREAK_START,
            performed_at=day.replace(hour=12, minute=0),
        )
        self._record(
            member=self.member_aleks,
            action_type=ActionType.BREAK_END,
            performed_at=day.replace(hour=12, minute=30),
        )
        self._record(
            member=self.member_aleks,
            action_type=ActionType.BREAK_START,
            performed_at=day.replace(hour=15, minute=10),
        )
        self._record(
            member=self.member_aleks,
            action_type=ActionType.CHECK_OUT,
            performed_at=day.replace(hour=16, minute=0),
        )
        self._record(
            member=self.member_aleks,
            action_type=ActionType.CHECK_OUT,
            performed_at=day.replace(hour=17, minute=30),
        )
        # Nami: check-in + check-out only (no break)
        self._record(
            member=self.member_nami,
            action_type=ActionType.CHECK_IN,
            performed_at=day.replace(hour=9, minute=5),
        )
        self._record(
            member=self.member_nami,
            action_type=ActionType.CHECK_OUT,
            performed_at=day.replace(hour=17, minute=25),
        )

        resp = self.client.get(
            "/api/history/attendance-report/",
            {
                "source_group_id": self.group.pk,
                "preset": "today",
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertEqual(data["group_name"], "SELS Kids")
        self.assertEqual(data["group_status"], GroupStatus.ACTIVE)
        self.assertEqual(data["source_group_id"], self.group.pk)
        self.assertEqual(
            [c["key"] for c in data["columns"]],
            ["check_in", "break", "check_out"],
        )
        self.assertEqual(len(data["sections"]), 1)
        rows_by_name = {row["name"]: row for row in data["sections"][0]["rows"]}

        self.assertEqual(rows_by_name["Aleks"]["cells"]["check_in"], "09:01")
        self.assertEqual(rows_by_name["Aleks"]["cells"]["break"], "12:00, 15:10")
        self.assertEqual(rows_by_name["Aleks"]["cells"]["check_out"], "17:30")
        self.assertEqual(rows_by_name["Nami"]["cells"]["check_in"], "09:05")
        self.assertIsNone(rows_by_name["Nami"]["cells"]["break"])
        self.assertEqual(rows_by_name["Nami"]["cells"]["check_out"], "17:25")

    def test_columns_follow_history_not_current_group_settings(self):
        # Group currently has check-out enabled, but history only has check-in.
        day = timezone.now().replace(hour=10, minute=0, second=0, microsecond=0)
        self._record(
            member=self.member_aleks,
            action_type=ActionType.CHECK_IN,
            performed_at=day,
        )
        self.group.check_out_enabled = True
        self.group.breaks_enabled = True
        self.group.save(update_fields=["check_out_enabled", "breaks_enabled", "updated_at"])

        resp = self.client.get(
            "/api/history/attendance-report/",
            {"source_group_id": self.group.pk, "preset": "today"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([c["key"] for c in resp.data["columns"]], ["check_in"])

    def test_custom_range_and_newest_days_first(self):
        older = timezone.now() - datetime.timedelta(days=3)
        newer = timezone.now() - datetime.timedelta(days=1)
        self._record(
            member=self.member_aleks,
            action_type=ActionType.CHECK_IN,
            performed_at=older.replace(hour=9, minute=0),
        )
        self._record(
            member=self.member_nami,
            action_type=ActionType.CHECK_IN,
            performed_at=newer.replace(hour=9, minute=0),
        )

        date_from = older.date().isoformat()
        date_to = newer.date().isoformat()
        resp = self.client.get(
            "/api/history/attendance-report/",
            {
                "source_group_id": self.group.pk,
                "preset": "custom",
                "date_from": date_from,
                "date_to": date_to,
            },
        )
        self.assertEqual(resp.status_code, 200)
        dates = [section["date"] for section in resp.data["sections"]]
        self.assertEqual(dates, sorted(dates, reverse=True))
        self.assertEqual(resp.data["date_from"], date_from)
        self.assertEqual(resp.data["date_to"], date_to)

    def test_deleted_group_still_reportable(self):
        self._record(
            member=self.member_aleks,
            action_type=ActionType.CHECK_IN,
            performed_at=timezone.now().replace(hour=9, minute=0),
        )
        self.group.status = GroupStatus.ARCHIVED
        self.group.save(update_fields=["status", "archived_at", "updated_at"])
        group_id = self.group.pk
        permanently_delete_group(self.group)

        resp = self.client.get(
            "/api/history/attendance-report/",
            {"source_group_id": group_id, "preset": "today"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["group_status"], "deleted")
        self.assertEqual(resp.data["group_name"], "SELS Kids")
        self.assertEqual(len(resp.data["sections"][0]["rows"]), 1)

    def test_tenant_isolation(self):
        self._record(
            member=self.member_aleks,
            action_type=ActionType.CHECK_IN,
            performed_at=timezone.now(),
        )
        resp = self.other_client.get(
            "/api/history/attendance-report/",
            {"source_group_id": self.group.pk, "preset": "today"},
        )
        self.assertEqual(resp.status_code, 404)

        groups_resp = self.other_client.get("/api/history/report-groups/")
        self.assertEqual(groups_resp.status_code, 200)
        self.assertEqual(groups_resp.data["items"], [])

    def test_requires_group_and_custom_dates(self):
        missing_group = self.client.get(
            "/api/history/attendance-report/",
            {"preset": "today"},
        )
        self.assertEqual(missing_group.status_code, 400)

        missing_dates = self.client.get(
            "/api/history/attendance-report/",
            {"source_group_id": self.group.pk, "preset": "custom"},
        )
        self.assertEqual(missing_dates.status_code, 400)

    def test_activity_log_unchanged(self):
        self._record(
            member=self.member_aleks,
            action_type=ActionType.CHECK_IN,
            performed_at=timezone.now(),
        )
        resp = self.client.get("/api/history/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("items", resp.data)
        self.assertEqual(len(resp.data["items"]), 1)
        self.assertEqual(resp.data["items"][0]["action"], ActionType.CHECK_IN)

    def test_today_uses_browser_timezone_not_utc_yesterday(self):
        """
        UTC 2026-08-22 23:51 == Asia/Tokyo 2026-08-23 08:51.

        Without timezone=, UTC 'today' is 22 Aug. With timezone=Asia/Tokyo,
        Today must be 23 Aug even when only 22 Aug has records.
        """
        from datetime import datetime
        from unittest.mock import patch
        from zoneinfo import ZoneInfo

        utc = ZoneInfo("UTC")
        tokyo = ZoneInfo("Asia/Tokyo")
        now_utc = datetime(2026, 8, 22, 23, 51, tzinfo=utc)

        # Local 22 Aug 12:00 JST == 22 Aug 03:00 UTC
        record_22 = datetime(2026, 8, 22, 3, 0, tzinfo=utc)
        self._record(
            member=self.member_aleks,
            action_type=ActionType.CHECK_IN,
            performed_at=record_22,
        )

        with patch("django.utils.timezone.now", return_value=now_utc):
            utc_resp = self.client.get(
                "/api/history/attendance-report/",
                {"source_group_id": self.group.pk, "preset": "today"},
            )
            tokyo_resp = self.client.get(
                "/api/history/attendance-report/",
                {
                    "source_group_id": self.group.pk,
                    "preset": "today",
                    "timezone": "Asia/Tokyo",
                },
            )

        self.assertEqual(utc_resp.status_code, 200)
        self.assertEqual(utc_resp.data["date_from"], "2026-08-22")
        self.assertEqual(utc_resp.data["date_to"], "2026-08-22")
        self.assertEqual(len(utc_resp.data["sections"]), 1)

        self.assertEqual(tokyo_resp.status_code, 200)
        self.assertEqual(tokyo_resp.data["date_from"], "2026-08-23")
        self.assertEqual(tokyo_resp.data["date_to"], "2026-08-23")
        self.assertEqual(tokyo_resp.data["date_label"], "23 August 2026")
        self.assertEqual(tokyo_resp.data["sections"], [])
        self.assertEqual(now_utc.astimezone(tokyo).date().isoformat(), "2026-08-23")

    def test_today_includes_local_day_records_and_excludes_previous_local_day(self):
        from datetime import datetime
        from unittest.mock import patch
        from zoneinfo import ZoneInfo

        utc = ZoneInfo("UTC")
        now_utc = datetime(2026, 8, 22, 23, 51, tzinfo=utc)

        # Local 23 Aug 00:05 JST == 22 Aug 15:05 UTC
        included = datetime(2026, 8, 22, 15, 5, tzinfo=utc)
        # Local 22 Aug 23:55 JST == 22 Aug 14:55 UTC
        excluded = datetime(2026, 8, 22, 14, 55, tzinfo=utc)

        self._record(
            member=self.member_aleks,
            action_type=ActionType.CHECK_IN,
            performed_at=included,
        )
        self._record(
            member=self.member_nami,
            action_type=ActionType.CHECK_IN,
            performed_at=excluded,
        )

        with patch("django.utils.timezone.now", return_value=now_utc):
            resp = self.client.get(
                "/api/history/attendance-report/",
                {
                    "source_group_id": self.group.pk,
                    "preset": "today",
                    "timezone": "Asia/Tokyo",
                },
            )

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["date_from"], "2026-08-23")
        self.assertEqual(resp.data["date_to"], "2026-08-23")
        self.assertEqual(len(resp.data["sections"]), 1)
        self.assertEqual(resp.data["sections"][0]["date"], "2026-08-23")
        names = [row["name"] for row in resp.data["sections"][0]["rows"]]
        self.assertEqual(names, ["Aleks"])
        self.assertEqual(resp.data["sections"][0]["rows"][0]["cells"]["check_in"], "00:05")

    def test_invalid_timezone_rejected(self):
        resp = self.client.get(
            "/api/history/attendance-report/",
            {
                "source_group_id": self.group.pk,
                "preset": "today",
                "timezone": "Not/A_Real_Zone",
            },
        )
        self.assertEqual(resp.status_code, 400)
