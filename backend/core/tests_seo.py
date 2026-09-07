from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, override_settings

from core.seo import ManagerNoIndexMiddleware, manager_robots_txt


@override_settings(
    ALLOWED_HOSTS=["manager.checkstation.app", "workspace.checkstation.app"],
    MANAGER_HOST="manager.checkstation.app",
)
class ManagerSeoTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def test_manager_responses_receive_noindex_header(self):
        request = self.factory.get("/admin/", HTTP_HOST="manager.checkstation.app")
        response = ManagerNoIndexMiddleware(lambda _request: HttpResponse("admin"))(request)
        self.assertEqual(response["X-Robots-Tag"], "noindex, nofollow")

    def test_workspace_responses_are_not_changed_by_manager_middleware(self):
        request = self.factory.get("/api/health/", HTTP_HOST="workspace.checkstation.app")
        response = ManagerNoIndexMiddleware(lambda _request: HttpResponse("ok"))(request)
        self.assertNotIn("X-Robots-Tag", response)

    def test_manager_robots_disallows_all(self):
        request = self.factory.get("/robots.txt", HTTP_HOST="manager.checkstation.app")
        response = manager_robots_txt(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"User-agent: *\nDisallow: /\n")

    def test_manager_robots_is_not_exposed_on_workspace(self):
        request = self.factory.get("/robots.txt", HTTP_HOST="workspace.checkstation.app")
        response = manager_robots_txt(request)
        self.assertEqual(response.status_code, 404)
