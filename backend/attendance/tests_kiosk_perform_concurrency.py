"""Concurrent kiosk perform race hardening tests (PostgreSQL-capable)."""

from concurrent.futures import ThreadPoolExecutor, as_completed

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from attendance.models import ActionRecord, ActionType
from attendance.services import AttendanceValidationError, perform_action_record_from_kiosk
from groups.models import Group, GroupMembership, GroupOnlyParticipant, GroupType
from kiosk_builder.testing import configure_group_kiosk_for_launch
from members.models import Member
from organizations.models import Organization, OrganizationPlan

User = get_user_model()


def _create_user(email):
    user = User.objects.create_user(email=email, password="secure-password")
    user.mark_email_verified()
    return user


class ConcurrentKioskPerformTests(TransactionTestCase):
    def setUp(self):
        self.owner = _create_user("concurrent-kiosk-owner@example.com")
        self.organization = Organization.objects.create_with_owner(owner=self.owner)
        self.organization.plan = OrganizationPlan.BUSINESS
        self.organization.save(update_fields=["plan", "updated_at"])
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Concurrent Desk",
            group_type=GroupType.STANDARD,
            check_in_enabled=True,
            check_out_enabled=True,
        )
        configure_group_kiosk_for_launch(self.group, exit_code="1111")
        self.member = Member.objects.create(
            organization=self.organization,
            name="Race Member",
        )
        self.membership = GroupMembership.objects.create(
            organization=self.organization,
            group=self.group,
            member=self.member,
        )
        self.visitor = GroupOnlyParticipant.objects.create(
            organization=self.organization,
            group=self.group,
            name="Race Visitor",
        )

    def tearDown(self):
        connection.close()

    def _perform_member_check_in(self):
        try:
            perform_action_record_from_kiosk(
                group=self.group,
                participant_kind="member",
                action_type=ActionType.CHECK_IN,
                membership=self.membership,
                member=self.member,
            )
            return "ok"
        except AttendanceValidationError as exc:
            return getattr(exc, "default_code", None) or str(exc)

    def _perform_visitor_check_in(self):
        try:
            perform_action_record_from_kiosk(
                group=self.group,
                participant_kind="group_only_participant",
                action_type=ActionType.CHECK_IN,
                group_only_participant=self.visitor,
            )
            return "ok"
        except AttendanceValidationError as exc:
            return getattr(exc, "default_code", None) or str(exc)

    def test_two_simultaneous_member_check_ins_only_one_succeeds(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(self._perform_member_check_in) for _ in range(2)]
            results = [future.result(timeout=10) for future in as_completed(futures)]

        self.assertEqual(results.count("ok"), 1)
        self.assertEqual(results.count("invalid_action_for_state"), 1)
        self.assertEqual(
            ActionRecord.objects.filter(
                group=self.group,
                member=self.member,
                action_type=ActionType.CHECK_IN,
            ).count(),
            1,
        )

    def test_two_simultaneous_visitor_check_ins_only_one_succeeds(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(self._perform_visitor_check_in) for _ in range(2)]
            results = [future.result(timeout=10) for future in as_completed(futures)]

        self.assertEqual(results.count("ok"), 1)
        self.assertEqual(results.count("invalid_action_for_state"), 1)
        self.assertEqual(
            ActionRecord.objects.filter(
                group=self.group,
                group_only_participant=self.visitor,
                action_type=ActionType.CHECK_IN,
            ).count(),
            1,
        )

    def test_two_simultaneous_member_check_outs_only_one_succeeds(self):
        perform_action_record_from_kiosk(
            group=self.group,
            participant_kind="member",
            action_type=ActionType.CHECK_IN,
            membership=self.membership,
            member=self.member,
        )

        def check_out():
            try:
                perform_action_record_from_kiosk(
                    group=self.group,
                    participant_kind="member",
                    action_type=ActionType.CHECK_OUT,
                    membership=self.membership,
                    member=self.member,
                )
                return "ok"
            except AttendanceValidationError as exc:
                return getattr(exc, "default_code", None) or str(exc)

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(check_out) for _ in range(2)]
            results = [future.result(timeout=10) for future in as_completed(futures)]

        self.assertEqual(results.count("ok"), 1)
        self.assertEqual(results.count("invalid_action_for_state"), 1)
        self.assertEqual(
            ActionRecord.objects.filter(
                group=self.group,
                member=self.member,
                action_type=ActionType.CHECK_OUT,
            ).count(),
            1,
        )

    def test_simultaneous_check_in_and_check_out_serialize_consistently(self):
        """
        Mixed concurrent actions serialize on the membership lock.
        Outcomes may be (check-out only) or (check-out then check-in); never two
        concurrent successes of the same action type.
        """
        perform_action_record_from_kiosk(
            group=self.group,
            participant_kind="member",
            action_type=ActionType.CHECK_IN,
            membership=self.membership,
            member=self.member,
        )

        def run(action):
            try:
                perform_action_record_from_kiosk(
                    group=self.group,
                    participant_kind="member",
                    action_type=action,
                    membership=self.membership,
                    member=self.member,
                )
                return ("ok", action)
            except AttendanceValidationError as exc:
                return (getattr(exc, "default_code", None) or str(exc), action)

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [
                pool.submit(run, ActionType.CHECK_IN),
                pool.submit(run, ActionType.CHECK_OUT),
            ]
            results = [future.result(timeout=10) for future in as_completed(futures)]

        self.assertTrue(any(code == "ok" for code, _action in results))
        self.assertTrue(
            all(code in ("ok", "invalid_action_for_state") for code, _action in results)
        )
        ok_actions = [action for code, action in results if code == "ok"]
        # Same action must not succeed twice from the concurrent pair.
        self.assertEqual(len(ok_actions), len(set(ok_actions)))
        self.assertLessEqual(
            ActionRecord.objects.filter(
                group=self.group,
                member=self.member,
                action_type=ActionType.CHECK_OUT,
            ).count(),
            1,
        )

    def test_api_concurrent_check_in_only_one_action_record(self):
        client_a = APIClient()
        client_b = APIClient()
        for client in (client_a, client_b):
            login = client.post(
                "/api/auth/login/",
                {"email": self.owner.email, "password": "secure-password"},
                format="json",
            )
            self.assertEqual(login.status_code, 200)
            start = client.post(f"/api/groups/{self.group.pk}/kiosk/", {}, format="json")
            self.assertEqual(start.status_code, 200)

        payload = {
            "participant_kind": "member",
            "membership_id": self.membership.pk,
            "action": "check_in",
        }

        def hit(client):
            response = client.post(
                f"/api/groups/{self.group.pk}/kiosk/perform/",
                payload,
                format="json",
            )
            return response.status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(hit, client_a), pool.submit(hit, client_b)]
            statuses = [future.result(timeout=15) for future in as_completed(futures)]

        self.assertEqual(sorted(statuses).count(200) + sorted(statuses).count(400), 2)
        self.assertEqual(statuses.count(200), 1)
        self.assertEqual(
            ActionRecord.objects.filter(
                group=self.group,
                member=self.member,
                action_type=ActionType.CHECK_IN,
            ).count(),
            1,
        )
