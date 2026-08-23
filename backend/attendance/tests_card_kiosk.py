"""Tests for Card-mode kiosk identify/action flow."""

import base64

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from attendance.models import ActionRecord, ActionType
from groups.models import (
    Group,
    GroupMembership,
    GroupMembershipStatus,
    GroupOnlyParticipant,
    GroupOnlyParticipantStatus,
)
from members.models import Member, MemberStatus
from kiosk_builder.kiosk_settings_constants import KioskType
from kiosk_builder.testing import configure_group_kiosk_for_launch
from organizations.models import Organization

User = get_user_model()


def create_user(email, *, password="secure-password", verified=True):
    user = User.objects.create_user(email=email, password=password)
    if verified:
        user.mark_email_verified()
    return user


class CardKioskFlowTests(TestCase):
    def setUp(self):
        self.password = "secure-password"
        self.owner = create_user("card-kiosk-owner@example.com", password=self.password)
        self.org = Organization.objects.create_with_owner(owner=self.owner)
        self.client = APIClient()
        token = base64.b64encode(
            f"card-kiosk-owner@example.com:{self.password}".encode()
        ).decode()
        self.client.credentials(HTTP_AUTHORIZATION=f"Basic {token}")
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Card Flow",
            check_in_enabled=True,
            check_out_enabled=True,
            breaks_enabled=True,
            max_breaks=2,
            require_pin=False,
        )
        configure_group_kiosk_for_launch(
            self.group,
            mode=KioskType.CARD,
            use_pin=False,
        )
        self.member = Member.objects.create_member(
            organization=self.org,
            name="Nami",
        )
        self.membership = GroupMembership.objects.create(
            organization=self.org,
            group=self.group,
            member=self.member,
            status=GroupMembershipStatus.ACTIVE,
        )
        self.visitor = GroupOnlyParticipant.objects.create(
            organization=self.org,
            group=self.group,
            name="Visitor",
            status=GroupOnlyParticipantStatus.ACTIVE,
        )
        self.client.post(f"/api/groups/{self.group.pk}/kiosk/")

    def _identify_member(self, **extra):
        payload = {
            "participant_kind": "member",
            "membership_id": self.membership.id,
            **extra,
        }
        return self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/identify/",
            payload,
            format="json",
        )

    def _identify_visitor(self, **extra):
        payload = {
            "participant_kind": "group_only_participant",
            "group_only_participant_id": self.visitor.id,
            **extra,
        }
        return self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/identify/",
            payload,
            format="json",
        )

    def _perform(self, participant_kind, action, **ids):
        payload = {"participant_kind": participant_kind, "action": action, **ids}
        return self.client.post(
            f"/api/groups/{self.group.pk}/kiosk/perform/",
            payload,
            format="json",
        )

    def test_card_identify_without_pin_returns_check_in(self):
        resp = self._identify_member()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["code"], "ok")
        self.assertIn(ActionType.CHECK_IN, resp.data["allowed_actions"])

    def test_card_check_in_then_check_out_and_break_actions(self):
        identify = self._identify_member()
        self.assertIn(ActionType.CHECK_IN, identify.data["allowed_actions"])

        check_in = self._perform(
            "member",
            ActionType.CHECK_IN,
            membership_id=self.membership.id,
        )
        self.assertEqual(check_in.status_code, 200)

        again = self._identify_member()
        self.assertNotIn(ActionType.CHECK_IN, again.data["allowed_actions"])
        self.assertIn(ActionType.CHECK_OUT, again.data["allowed_actions"])
        self.assertIn(ActionType.BREAK_START, again.data["allowed_actions"])

    def test_card_on_break_offers_end_break(self):
        self._perform("member", ActionType.CHECK_IN, membership_id=self.membership.id)
        self._perform("member", ActionType.BREAK_START, membership_id=self.membership.id)

        resp = self._identify_member()
        self.assertIn(ActionType.BREAK_END, resp.data["allowed_actions"])
        self.assertNotIn(ActionType.BREAK_START, resp.data["allowed_actions"])

    def test_card_max_breaks_removes_start_break(self):
        self._perform("member", ActionType.CHECK_IN, membership_id=self.membership.id)
        self._perform("member", ActionType.BREAK_START, membership_id=self.membership.id)
        self._perform("member", ActionType.BREAK_END, membership_id=self.membership.id)
        self._perform("member", ActionType.BREAK_START, membership_id=self.membership.id)
        self._perform("member", ActionType.BREAK_END, membership_id=self.membership.id)

        resp = self._identify_member()
        self.assertIn(ActionType.CHECK_OUT, resp.data["allowed_actions"])
        self.assertNotIn(ActionType.BREAK_START, resp.data["allowed_actions"])

    def test_card_with_pin_wrong_pin_rejected_no_action_record(self):
        self.group.require_pin = True
        self.group.save()
        self.membership.set_participation_pin("1234")
        self.membership.save()
        self.visitor.set_participation_pin("5678")
        self.visitor.save()
        configure_group_kiosk_for_launch(
            self.group,
            mode=KioskType.CARD,
            use_pin=True,
        )
        self.client.post(f"/api/groups/{self.group.pk}/kiosk/")

        before = ActionRecord.objects.count()
        resp = self._identify_member(pin="9999")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data["code"], "invalid_pin")
        self.assertEqual(ActionRecord.objects.count(), before)

    def test_card_with_pin_correct_pin_identifies(self):
        self.group.require_pin = True
        self.group.save()
        self.membership.set_participation_pin("1234")
        self.membership.save()
        self.visitor.set_participation_pin("5678")
        self.visitor.save()
        configure_group_kiosk_for_launch(
            self.group,
            mode=KioskType.CARD,
            use_pin=True,
        )
        self.client.post(f"/api/groups/{self.group.pk}/kiosk/")

        resp = self._identify_member(pin="1234")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["code"], "ok")
        self.assertIn(ActionType.CHECK_IN, resp.data["allowed_actions"])

    def test_visitor_participation_pin_works(self):
        self.group.require_pin = True
        self.group.save()
        self.membership.set_participation_pin("1234")
        self.membership.save()
        self.visitor.set_participation_pin("5678")
        self.visitor.save()
        configure_group_kiosk_for_launch(
            self.group,
            mode=KioskType.CARD,
            use_pin=True,
        )
        self.client.post(f"/api/groups/{self.group.pk}/kiosk/")

        bad = self._identify_visitor(pin="0000")
        self.assertEqual(bad.status_code, 400)

        ok = self._identify_visitor(pin="5678")
        self.assertEqual(ok.status_code, 200)
        self.assertIn(ActionType.CHECK_IN, ok.data["allowed_actions"])

    def test_archived_member_not_in_card_list(self):
        self.member.status = MemberStatus.ARCHIVED
        self.member.save()

        start = self.client.get(f"/api/groups/{self.group.pk}/kiosk/")
        ids = [
            p.get("membership_id")
            for p in start.data["people"]
            if p["participant_kind"] == "member"
        ]
        self.assertNotIn(self.membership.id, ids)

        resp = self._identify_member()
        self.assertEqual(resp.status_code, 404)

    def test_inactive_membership_not_available(self):
        self.membership.deactivate()
        resp = self._identify_member()
        self.assertEqual(resp.status_code, 404)
