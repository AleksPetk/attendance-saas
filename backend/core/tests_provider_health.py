from io import BytesIO
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from billing.fake_provider import get_fake_provider
from core.mail import (
    RESEND_API_URL,
    RESEND_DOMAINS_URL,
    RESEND_USER_AGENT,
    EmailConfigurationError,
    ResendEmailProvider,
)


def _http_error(url, code, body):
    return HTTPError(
        url,
        code,
        "Error",
        hdrs=None,
        fp=BytesIO(body),
    )


TEST_STATUS_PROBE_TOKEN = "test-status-probe-token"


@override_settings(STATUS_PROBE_TOKEN=TEST_STATUS_PROBE_TOKEN)
class EmailHealthEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _probe_get(self, url):
        return self.client.get(
            url,
            HTTP_X_STATUS_PROBE_TOKEN=TEST_STATUS_PROBE_TOKEN,
        )

    @override_settings(RESEND_API_KEY="")
    def test_unconfigured_resend_is_unconfigured_not_operational(self):
        response = self._probe_get(reverse("health-email"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"status": "unconfigured"})

    @override_settings(RESEND_API_KEY="re_test_secret_key", RESEND_TIMEOUT_SECONDS=5)
    def test_resend_health_uses_get_domains_and_does_not_send(self):
        mock_response = MagicMock()
        mock_response.read.return_value = b'{"data":[]}'
        mock_response.getcode.return_value = 200
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = False
        captured = {}

        def fake_urlopen(request, timeout=None):
            captured["url"] = request.full_url
            captured["method"] = request.get_method()
            captured["user_agent"] = request.get_header("User-agent")
            captured["data"] = request.data
            return mock_response

        with patch("core.mail.urllib.request.urlopen", side_effect=fake_urlopen):
            with patch.object(ResendEmailProvider, "send") as send_mock:
                response = self._probe_get(reverse("health-email"))
                send_mock.assert_not_called()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"status": "ok"})
        self.assertEqual(captured["method"], "GET")
        self.assertEqual(captured["url"], RESEND_DOMAINS_URL)
        self.assertEqual(captured["user_agent"], RESEND_USER_AGENT)
        self.assertIsNone(captured["data"])
        self.assertNotIn("re_test_secret_key", str(response.data))

    @override_settings(RESEND_API_KEY="re_test_secret_key", RESEND_TIMEOUT_SECONDS=5)
    def test_sending_only_key_domains_401_is_not_an_outage(self):
        """GET /domains 401 restricted_api_key + invalid POST 422 => healthy, no mail."""
        calls = []

        def fake_urlopen(request, timeout=None):
            calls.append(
                {
                    "url": request.full_url,
                    "method": request.get_method(),
                    "data": request.data,
                    "user_agent": request.get_header("User-agent"),
                }
            )
            if request.full_url == RESEND_DOMAINS_URL:
                raise _http_error(
                    RESEND_DOMAINS_URL,
                    401,
                    b'{"name":"restricted_api_key","message":"This API key is restricted to only send emails."}',
                )
            raise _http_error(RESEND_API_URL, 422, b'{"name":"validation_error"}')

        with patch("core.mail.urllib.request.urlopen", side_effect=fake_urlopen):
            with patch.object(ResendEmailProvider, "send") as send_mock:
                response = self._probe_get(reverse("health-email"))
                send_mock.assert_not_called()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"status": "ok"})
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0]["url"], RESEND_DOMAINS_URL)
        self.assertEqual(calls[0]["method"], "GET")
        self.assertEqual(calls[1]["url"], RESEND_API_URL)
        self.assertEqual(calls[1]["method"], "POST")
        self.assertEqual(calls[1]["data"], b"{}")
        self.assertEqual(calls[1]["user_agent"], RESEND_USER_AGENT)
        payload = str(response.data)
        self.assertNotIn("restricted_api_key", payload)
        self.assertNotIn("re_test_secret_key", payload)
        self.assertNotIn("@", payload)

    @override_settings(RESEND_API_KEY="re_test_secret_key")
    def test_send_auth_probe_without_reliable_signal_is_unknown(self):
        def fake_urlopen(request, timeout=None):
            if request.full_url == RESEND_DOMAINS_URL:
                raise _http_error(RESEND_DOMAINS_URL, 401, b'{"name":"restricted_api_key"}')
            raise _http_error(RESEND_API_URL, 409, b'{"name":"application_error"}')

        with patch("core.mail.urllib.request.urlopen", side_effect=fake_urlopen):
            response = self._probe_get(reverse("health-email"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"status": "unknown"})
        self.assertNotIn("application_error", str(response.data))

    @override_settings(RESEND_API_KEY="re_test_secret_key")
    def test_resend_unreachable_returns_error_without_raw_body(self):
        def fake_urlopen(request, timeout=None):
            raise URLError("raw-resend-timeout-secret")

        with patch("core.mail.urllib.request.urlopen", side_effect=fake_urlopen):
            response = self._probe_get(reverse("health-email"))

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data, {"status": "error"})
        self.assertNotIn("raw-resend-timeout-secret", str(response.data))

    @override_settings(RESEND_API_KEY="re_test_secret_key")
    def test_confirmed_send_auth_failure_is_error_without_raw_body(self):
        def fake_urlopen(request, timeout=None):
            if request.full_url == RESEND_DOMAINS_URL:
                raise _http_error(RESEND_DOMAINS_URL, 401, b'{"name":"restricted_api_key"}')
            raise _http_error(
                RESEND_API_URL,
                401,
                b'{"message":"invalid_api_key_leak"}',
            )

        with patch("core.mail.urllib.request.urlopen", side_effect=fake_urlopen):
            response = self._probe_get(reverse("health-email"))

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data, {"status": "error"})
        self.assertNotIn("invalid_api_key_leak", str(response.data))

    @override_settings(RESEND_API_KEY="re_test_secret_key")
    def test_resend_server_error_on_domains_is_failure(self):
        def fake_urlopen(request, timeout=None):
            raise _http_error(RESEND_DOMAINS_URL, 503, b'{"message":"upstream-secret"}')

        with patch("core.mail.urllib.request.urlopen", side_effect=fake_urlopen):
            response = self._probe_get(reverse("health-email"))

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data, {"status": "error"})
        self.assertNotIn("upstream-secret", str(response.data))

    @override_settings(RESEND_API_KEY="")
    def test_check_health_raises_when_unconfigured(self):
        with self.assertRaises(EmailConfigurationError):
            ResendEmailProvider().check_health()


@override_settings(
    STATUS_PROBE_TOKEN=TEST_STATUS_PROBE_TOKEN,
    BILLING_PROVIDER="fake",
    STRIPE_SECRET_KEY="sk_test_fake",
    STRIPE_PRICE_PLUS_MONTHLY="price_plus_monthly",
    STRIPE_PRICE_PLUS_YEARLY="price_plus_yearly",
    STRIPE_PRICE_BUSINESS_MONTHLY="price_business_monthly",
    STRIPE_PRICE_BUSINESS_YEARLY="price_business_yearly",
)
class StripeHealthEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        get_fake_provider().reset()

    def _probe_get(self, url):
        return self.client.get(
            url,
            HTTP_X_STATUS_PROBE_TOKEN=TEST_STATUS_PROBE_TOKEN,
        )

    @override_settings(STRIPE_SECRET_KEY="")
    def test_unconfigured_stripe_is_unconfigured(self):
        response = self._probe_get(reverse("health-stripe"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"status": "unconfigured"})

    def test_fake_provider_health_is_read_only_ok(self):
        provider = get_fake_provider()
        checkouts_before = len(provider.checkouts)
        customers_before = len(provider.customers)
        invoices_before = sum(len(rows) for rows in provider.invoices.values())

        response = self._probe_get(reverse("health-stripe"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"status": "ok"})
        self.assertEqual(len(provider.health_calls), 1)
        self.assertEqual(provider.health_calls[0]["method"], "balance.retrieve")
        self.assertEqual(len(provider.checkouts), checkouts_before)
        self.assertEqual(len(provider.customers), customers_before)
        self.assertEqual(
            sum(len(rows) for rows in provider.invoices.values()),
            invoices_before,
        )

    def test_stripe_provider_failure_is_generic(self):
        provider = get_fake_provider()
        provider.fail_next_health = True
        response = self._probe_get(reverse("health-stripe"))
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data, {"status": "error"})
        self.assertNotIn("Stripe", str(response.data))
        self.assertNotIn("sk_test", str(response.data))
