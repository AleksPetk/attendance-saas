from unittest.mock import patch

from django.db.utils import OperationalError
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient


class HealthCheckTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health_endpoint_returns_ok(self):
        response = self.client.get(reverse("health-check"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"status": "ok"})
        self.assertEqual(list(response.data.keys()), ["status"])

    def test_health_endpoint_returns_503_when_database_unavailable(self):
        with patch("core.views.connection") as mock_connection:
            mock_connection.cursor.side_effect = OperationalError("hidden-db-host")
            response = self.client.get(reverse("health-check"))

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data, {"status": "degraded"})
        payload = str(response.data)
        self.assertNotIn("hidden-db-host", payload)
        self.assertNotIn("postgres", payload.lower())
