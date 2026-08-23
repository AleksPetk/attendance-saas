"""
Regression tests for KioskDesign media persistence across save/refetch cycles.

Canonical media source of truth:
- Header logo → KioskDesign.header_logo (ImageField)
- Footer logo → KioskDesign.footer_logo (ImageField)
- Main background → KioskDesign.main_background_image (ImageField)
Config JSON stores placement/size only — never blob or media URLs.
"""

import json
import tempfile
from io import BytesIO
from pathlib import Path

from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from groups.models import Group
from kiosk_builder.config_schema import default_config
from kiosk_builder.models import KioskDesign
from kiosk_builder.testing import configure_group_kiosk_for_launch
from organizations.models import Organization

TEMP_MEDIA = tempfile.mkdtemp()


def _uploaded_image(name="logo.jpg", color=(20, 120, 200), size=(64, 64)):
    buffer = BytesIO()
    Image.new("RGB", size, color).save(buffer, format="JPEG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/jpeg")


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class KioskDesignMediaPersistenceTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="kiosk-media-persist@example.com",
            password="password12345",
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.org = Organization.objects.create_with_owner(
            owner=self.owner,
            internal_label="Kiosk Media Org",
        )
        self.group = Group.objects.create_group(
            organization=self.org,
            name="Media Persist Group",
            check_in_enabled=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)
        self.url = f"/api/groups/{self.group.id}/kiosk-design/"
        self.client.get(self.url)

    def _put(self, **extra):
        data = {"config": json.dumps(default_config())}
        data.update(extra)
        return self.client.put(self.url, data=data, format="multipart")

    def test_header_logo_survives_refetch(self):
        resp = self._put(header_logo=_uploaded_image("header.jpg"))
        self.assertEqual(resp.status_code, 200)
        url1 = resp.data["header_logo_url"]
        self.assertTrue(url1)
        design = KioskDesign.objects.get(group=self.group)
        self.assertTrue(default_storage.exists(design.header_logo.name))

        again = self.client.get(self.url)
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.data["header_logo_url"], url1)
        design.refresh_from_db()
        self.assertTrue(default_storage.exists(design.header_logo.name))

    def test_footer_logo_survives_refetch(self):
        resp = self._put(footer_logo=_uploaded_image("footer.jpg", color=(200, 40, 40)))
        self.assertEqual(resp.status_code, 200)
        url1 = resp.data["footer_logo_url"]
        again = self.client.get(self.url)
        self.assertEqual(again.data["footer_logo_url"], url1)
        design = KioskDesign.objects.get(group=self.group)
        self.assertTrue(default_storage.exists(design.footer_logo.name))

    def test_unrelated_color_save_keeps_media(self):
        first = self._put(
            header_logo=_uploaded_image("h.jpg"),
            footer_logo=_uploaded_image("f.jpg", color=(10, 200, 10)),
            main_background_image=_uploaded_image(
                "bg.jpg", color=(90, 90, 90), size=(320, 180)
            ),
        )
        self.assertEqual(first.status_code, 200)
        header_url = first.data["header_logo_url"]
        footer_url = first.data["footer_logo_url"]
        bg_url = first.data["main_background_image_url"]
        design = KioskDesign.objects.get(group=self.group)
        header_name = design.header_logo.name
        footer_name = design.footer_logo.name
        bg_name = design.main_background_image.name

        cfg = default_config()
        cfg["header"]["background"]["color"] = "#112233"
        color_save = self.client.put(
            self.url,
            data={"config": json.dumps(cfg)},
            format="multipart",
        )
        self.assertEqual(color_save.status_code, 200)
        self.assertEqual(color_save.data["header_logo_url"], header_url)
        self.assertEqual(color_save.data["footer_logo_url"], footer_url)
        self.assertEqual(color_save.data["main_background_image_url"], bg_url)

        design.refresh_from_db()
        self.assertEqual(design.header_logo.name, header_name)
        self.assertEqual(design.footer_logo.name, footer_name)
        self.assertEqual(design.main_background_image.name, bg_name)
        self.assertTrue(default_storage.exists(header_name))
        self.assertTrue(default_storage.exists(footer_name))
        self.assertTrue(default_storage.exists(bg_name))
        self.assertEqual(design.config["header"]["background"]["color"], "#112233")

    def test_repeated_get_does_not_mutate_media(self):
        self._put(header_logo=_uploaded_image("h.jpg"), footer_logo=_uploaded_image("f.jpg"))
        a = self.client.get(self.url).data
        b = self.client.get(self.url).data
        self.assertEqual(a["header_logo_url"], b["header_logo_url"])
        self.assertEqual(a["footer_logo_url"], b["footer_logo_url"])
        design = KioskDesign.objects.get(group=self.group)
        self.assertTrue(default_storage.exists(design.header_logo.name))
        self.assertTrue(default_storage.exists(design.footer_logo.name))

    def test_replace_header_keeps_footer_and_new_file(self):
        first = self._put(
            header_logo=_uploaded_image("h1.jpg"),
            footer_logo=_uploaded_image("f1.jpg", color=(1, 2, 3)),
        )
        design = KioskDesign.objects.get(group=self.group)
        old_header = design.header_logo.name
        footer_name = design.footer_logo.name

        second = self._put(header_logo=_uploaded_image("h2.jpg", color=(9, 9, 9)))
        self.assertEqual(second.status_code, 200)
        design.refresh_from_db()
        self.assertNotEqual(design.header_logo.name, old_header)
        self.assertTrue(default_storage.exists(design.header_logo.name))
        self.assertFalse(default_storage.exists(old_header))
        self.assertEqual(design.footer_logo.name, footer_name)
        self.assertTrue(default_storage.exists(footer_name))
        self.assertIsNotNone(second.data["header_logo_url"])
        self.assertIsNotNone(second.data["footer_logo_url"])

    def test_upload_paths_are_unique_not_fixed_filenames(self):
        self._put(header_logo=_uploaded_image("h.jpg"))
        design = KioskDesign.objects.get(group=self.group)
        name = Path(design.header_logo.name).name
        self.assertNotEqual(name, "logo.png")
        self.assertTrue(name.startswith("logo_"))

    def test_live_payload_stable_across_requests(self):
        configure_group_kiosk_for_launch(self.group)
        self._put(
            header_logo=_uploaded_image("h.jpg"),
            footer_logo=_uploaded_image("f.jpg", color=(50, 50, 50)),
        )
        start_url = f"/api/groups/{self.group.id}/kiosk/"
        a = self.client.get(start_url).data["visual_design"]
        b = self.client.get(start_url).data["visual_design"]
        self.assertEqual(a["header_logo_url"], b["header_logo_url"])
        self.assertEqual(a["footer_logo_url"], b["footer_logo_url"])
        self.assertTrue(a["header_logo_url"])
        self.assertTrue(a["footer_logo_url"])

    def test_ensure_group_kiosk_design_does_not_reset_media(self):
        from kiosk_builder.models import ensure_group_kiosk_design

        self._put(header_logo=_uploaded_image("h.jpg"))
        design = KioskDesign.objects.get(group=self.group)
        name = design.header_logo.name
        again = ensure_group_kiosk_design(self.group)
        self.assertEqual(again.pk, design.pk)
        self.assertEqual(again.header_logo.name, name)
        self.assertTrue(default_storage.exists(name))

    def test_config_normalization_does_not_erase_media(self):
        self._put(header_logo=_uploaded_image("h.jpg"))
        design = KioskDesign.objects.get(group=self.group)
        name = design.header_logo.name
        cfg = default_config()
        cfg["header"]["logo"] = {"x": 0.1, "y": 0.0, "width": 0.2, "height": 0.8}
        resp = self.client.put(
            self.url,
            data={"config": json.dumps(cfg)},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200)
        design.refresh_from_db()
        self.assertEqual(design.header_logo.name, name)
        self.assertTrue(default_storage.exists(name))
        self.assertEqual(design.config["header"]["logo"], {"size": 0.8})

    def test_logout_login_lifecycle_leaves_media_fields_unchanged(self):
        """Auth cycle must not recreate design or clear ImageField names."""
        from kiosk_builder.models import ensure_group_kiosk_design

        configure_group_kiosk_for_launch(self.group)
        self._put(
            header_logo=_uploaded_image("h.jpg"),
            footer_logo=_uploaded_image("f.jpg", color=(10, 10, 10)),
        )
        design = KioskDesign.objects.get(group=self.group)
        header_name = design.header_logo.name
        footer_name = design.footer_logo.name
        start_url = f"/api/groups/{self.group.id}/kiosk/"
        before = self.client.get(start_url).data["visual_design"]

        logout = self.client.post("/api/auth/logout/")
        self.assertIn(logout.status_code, (200, 204))
        login = self.client.post(
            "/api/auth/login/",
            {"email": self.owner.email, "password": "password12345"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        self.client.force_authenticate(user=self.owner)

        ensure_group_kiosk_design(self.group)
        after = self.client.get(start_url).data["visual_design"]
        design.refresh_from_db()
        self.assertEqual(design.header_logo.name, header_name)
        self.assertEqual(design.footer_logo.name, footer_name)
        self.assertEqual(after["header_logo_url"], before["header_logo_url"])
        self.assertEqual(after["footer_logo_url"], before["footer_logo_url"])
        self.assertTrue(default_storage.exists(header_name))
        self.assertTrue(default_storage.exists(footer_name))
