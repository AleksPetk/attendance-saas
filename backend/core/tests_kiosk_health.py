from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from attendance.kiosk_lock import SESSION_KIOSK_GROUP_ID, SESSION_KIOSK_LOCKED
from attendance.models import ActionRecord
from groups.models import Group
from kiosk_builder.models import KioskDesign, KioskSettings
from members.models import Member
from organizations.models import Organization

from accounts.models import User


class KioskHealthEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="kiosk-health@example.com",
            password="secure-password",
        )
        self.organization = Organization.objects.create_with_owner(owner=self.user)
        self.group = Group.objects.create_group(
            organization=self.organization,
            name="Health Probe Group",
        )
        Member.objects.create(
            organization=self.organization,
            name="Must Not Appear",
        )

    def test_kiosk_health_is_ok_and_minimal(self):
        response = self.client.get(reverse("health-kiosk"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"status": "ok"})
        self.assertEqual(list(response.data.keys()), ["status"])
        payload = str(response.data)
        self.assertNotIn("Must Not Appear", payload)
        self.assertNotIn(str(self.group.pk), payload)
        self.assertNotIn(self.group.name, payload)

    def test_kiosk_health_does_not_mutate_attendance_or_lock_session(self):
        actions_before = ActionRecord.objects.count()
        settings_before = KioskSettings.objects.count()
        designs_before = KioskDesign.objects.count()
        groups_before = Group.objects.count()

        response = self.client.get(reverse("health-kiosk"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.assertEqual(ActionRecord.objects.count(), actions_before)
        self.assertEqual(KioskSettings.objects.count(), settings_before)
        self.assertEqual(KioskDesign.objects.count(), designs_before)
        self.assertEqual(Group.objects.count(), groups_before)
        session = self.client.session
        self.assertFalse(session.get(SESSION_KIOSK_LOCKED))
        self.assertIsNone(session.get(SESSION_KIOSK_GROUP_ID))

    def test_kiosk_health_allowed_without_authentication(self):
        response = self.client.get("/api/health/kiosk/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
