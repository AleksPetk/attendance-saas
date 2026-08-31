import base64

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from attendance.models import ActionRecord, ActionSource, ActionType
from groups.models import Group, GroupMembership, GroupOnlyParticipant, GroupStatus
from members.models import Member
from organizations.models import (
    Organization,
    OrganizationPlan,
    WorkspaceStaffAccount,
    WorkspaceStaffRole,
)
from organizations.staff_group_access import set_staff_group_access

User = get_user_model()


def auth_header(identity, password):
    token = base64.b64encode(f"{identity}:{password}".encode()).decode()
    return f"Basic {token}"


class AttendanceReportModeTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="modes@example.com", password="secure-password")
        self.owner.mark_email_verified()
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.org.plan = OrganizationPlan.PLUS
        self.org.save(update_fields=["plan"])
        self.group_a = Group.objects.create_group(organization=self.org, name="Club")
        self.group_b = Group.objects.create_group(organization=self.org, name="Café")
        self.member = Member.objects.create(organization=self.org, name="Jasmine")
        self.other_member = Member.objects.create(organization=self.org, name="Morgan")
        self.membership_a = GroupMembership.objects.create(
            organization=self.org,
            group=self.group_a,
            member=self.member,
        )
        self.membership_b = GroupMembership.objects.create(
            organization=self.org,
            group=self.group_b,
            member=self.member,
        )
        self.other_membership = GroupMembership.objects.create(
            organization=self.org,
            group=self.group_b,
            member=self.other_member,
        )
        self.visitor = GroupOnlyParticipant.objects.create(
            organization=self.org,
            group=self.group_a,
            name="Guest",
        )
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=auth_header(self.owner.email, "secure-password"))
        self._record(self.group_a, member=self.member, name="Jasmine")
        self._record(self.group_b, member=self.member, name="Jasmine")
        self._record(self.group_a, visitor=self.visitor, name="Guest")

    def _record(self, group, *, name, member=None, visitor=None):
        return ActionRecord.objects.create(
            organization=self.org,
            group=group,
            source_group_id=group.pk,
            participant_kind="member" if member else "group_only_participant",
            member=member,
            group_only_participant=visitor,
            action_type=ActionType.CHECK_IN,
            source=ActionSource.KIOSK,
            performed_at=timezone.now(),
            participant_name_snapshot=name,
            participant_check_in_identifier_snapshot=(
                self.membership_a.group_participant_code
                if member and group == self.group_a
                else visitor.group_participant_code if visitor else ""
            ),
            group_name_snapshot=group.name,
            group_type_snapshot=group.group_type,
        )

    def _report(self, **params):
        return self.client.get(
            "/api/history/attendance-report/",
            {"preset": "today", **params},
        )

    def test_member_mode_all_and_specific_group(self):
        all_groups = self._report(report_by="member", member_id=self.member.pk)
        self.assertEqual(all_groups.status_code, 200)
        self.assertTrue(all_groups.data["show_group_column"])
        names = {
            row["group_name"]
            for section in all_groups.data["sections"]
            for row in section["rows"]
        }
        self.assertEqual(names, {"Club", "Café"})

        specific = self._report(
            report_by="member",
            member_id=self.member.pk,
            source_group_id=self.group_a.pk,
        )
        self.assertEqual(specific.status_code, 200)
        self.assertFalse(specific.data["show_group_column"])
        self.assertEqual(specific.data["group_name"], "Club")

    def test_member_group_options_only_include_real_relationships(self):
        response = self.client.get(
            "/api/history/attendance-report/options/",
            {"member_id": self.other_member.pk},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["source_group_id"] for item in response.data["member_groups"]],
            [self.group_b.pk],
        )

    def test_group_mode_all_and_each_canonical_participant_kind(self):
        all_people = self._report(report_by="group", source_group_id=self.group_a.pk)
        self.assertEqual(all_people.status_code, 200)
        self.assertEqual(
            {row["name"] for section in all_people.data["sections"] for row in section["rows"]},
            {"Jasmine", "Guest"},
        )

        member = self._report(
            report_by="group",
            source_group_id=self.group_a.pk,
            participant_kind="member",
            participant_id=self.membership_a.pk,
        )
        self.assertEqual(member.status_code, 200)
        self.assertEqual(member.data["participant"]["id"], self.membership_a.pk)
        self.assertEqual(member.data["sections"][0]["rows"][0]["name"], "Jasmine")

        visitor = self._report(
            report_by="group",
            source_group_id=self.group_a.pk,
            participant_kind="group_only_participant",
            participant_id=self.visitor.pk,
        )
        self.assertEqual(visitor.status_code, 200)
        self.assertEqual(visitor.data["sections"][0]["rows"][0]["name"], "Guest")

    def test_group_options_use_active_group_specific_identities(self):
        response = self.client.get(
            "/api/history/attendance-report/options/",
            {"source_group_id": self.group_a.pk},
        )
        identities = {(item["kind"], item["id"]) for item in response.data["participants"]}
        self.assertEqual(
            identities,
            {("member", self.membership_a.pk), ("group_only_participant", self.visitor.pk)},
        )

    def test_archived_current_state_does_not_hide_immutable_history(self):
        self.membership_a.deactivate()
        self.visitor.archive()
        self.group_a.status = GroupStatus.ARCHIVED
        self.group_a.save(update_fields=["status", "archived_at", "updated_at"])
        response = self._report(report_by="group", source_group_id=self.group_a.pk)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            {row["name"] for section in response.data["sections"] for row in section["rows"]},
            {"Jasmine", "Guest"},
        )

    def test_staff_member_mode_and_options_are_assigned_group_scoped(self):
        staff = WorkspaceStaffAccount.objects.create_account(
            organization=self.org,
            username="staffer",
            password="staff-password",
            role=WorkspaceStaffRole.STAFF,
        )
        set_staff_group_access(
            staff_account=staff,
            organization=self.org,
            group_ids=[self.group_a.pk],
        )
        staff_client = APIClient()
        login = staff_client.post(
            "/api/auth/staff-login/",
            {
                "workspace_id": self.org.workspace_id,
                "username": "staffer",
                "password": "staff-password",
            },
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        report = staff_client.get(
            "/api/history/attendance-report/",
            {"report_by": "member", "member_id": self.member.pk, "preset": "today"},
        )
        self.assertEqual(report.status_code, 200)
        self.assertEqual(
            {row["group_name"] for section in report.data["sections"] for row in section["rows"]},
            {"Club"},
        )
        forbidden = staff_client.get(
            "/api/history/attendance-report/",
            {
                "report_by": "member",
                "member_id": self.member.pk,
                "source_group_id": self.group_b.pk,
                "preset": "today",
            },
        )
        self.assertEqual(forbidden.status_code, 404)

    def test_export_uses_identical_member_filters_and_context(self):
        screen = self._report(
            report_by="member",
            member_id=self.member.pk,
            source_group_id=self.group_a.pk,
        )
        export = self.client.get(
            "/api/history/attendance-report/export/",
            {
                "report_by": "member",
                "member_id": self.member.pk,
                "source_group_id": self.group_a.pk,
                "preset": "today",
                "export_format": "csv",
            },
        )
        self.assertEqual(export.status_code, 200)
        body = export.content.decode("utf-8-sig")
        self.assertIn("Member: Jasmine", body)
        self.assertIn("Group: Club", body)
        for section in screen.data["sections"]:
            for row in section["rows"]:
                self.assertIn(row["name"], body)

    def test_member_mode_rejects_another_workspace_member(self):
        other_owner = User.objects.create_user(email="other-modes@example.com", password="secure-password")
        other_owner.mark_email_verified()
        other_org = Organization.objects.create_with_owner(owner=other_owner)
        other_member = Member.objects.create(organization=other_org, name="Private Person")
        report = self._report(report_by="member", member_id=other_member.pk)
        options = self.client.get(
            "/api/history/attendance-report/options/",
            {"member_id": other_member.pk},
        )
        self.assertEqual(report.status_code, 404)
        self.assertEqual(options.status_code, 404)
