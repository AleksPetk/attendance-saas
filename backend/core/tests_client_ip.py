"""Client IP resolution for rate limiting behind reverse proxies."""

from django.test import RequestFactory, TestCase, override_settings

from core.client_ip import get_client_ip


class ClientIpTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def test_uses_remote_addr_by_default(self):
        request = self.factory.get("/", REMOTE_ADDR="198.51.100.42")
        request.META["HTTP_X_FORWARDED_FOR"] = "203.0.113.1"
        self.assertEqual(get_client_ip(request), "198.51.100.42")

    @override_settings(USE_X_FORWARDED_FOR=True, TRUSTED_PROXY_IPS=["127.0.0.1"])
    def test_honors_forwarded_for_from_trusted_proxy(self):
        request = self.factory.get("/", REMOTE_ADDR="127.0.0.1")
        request.META["HTTP_X_FORWARDED_FOR"] = "203.0.113.9, 198.51.100.1"
        self.assertEqual(get_client_ip(request), "203.0.113.9")

    @override_settings(USE_X_FORWARDED_FOR=True, TRUSTED_PROXY_IPS=["127.0.0.1"])
    def test_ignores_forwarded_for_from_untrusted_peer(self):
        request = self.factory.get("/", REMOTE_ADDR="203.0.113.9")
        request.META["HTTP_X_FORWARDED_FOR"] = "1.2.3.4"
        self.assertEqual(get_client_ip(request), "203.0.113.9")
