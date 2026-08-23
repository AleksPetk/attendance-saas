"""
Tests for the Kiosk Builder Phase 1 — model, config validation, API,
media lifecycle, tenant isolation, and permanent deletion integration.
"""

import copy
import json
import os
import shutil
import tempfile
from io import BytesIO
from pathlib import Path
from unittest import mock

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from groups.models import Group, KioskTheme
from kiosk_builder.config_schema import (
    CURRENT_CONFIG_VERSION,
    ConfigValidationError,
    default_config,
    default_config_for_classic,
    default_config_for_modern,
    validate_config,
)
from kiosk_builder.models import KioskDesign
from kiosk_builder.presets import PRESET_CATALOG, is_valid_preset

TEMP_MEDIA = tempfile.mkdtemp()


def _create_test_image(*, width=100, height=100, color=(255, 0, 0), mode="RGB", fmt="JPEG"):
    image = Image.new(mode, (width, height), color)
    buffer = BytesIO()
    image.save(buffer, format=fmt)
    buffer.seek(0)
    return buffer


def _uploaded_image(name="test.jpg", **kwargs):
    buf = _create_test_image(**kwargs)
    return SimpleUploadedFile(name, buf.read(), content_type="image/jpeg")


def _uploaded_png_with_alpha(name="logo.png"):
    buf = _create_test_image(mode="RGBA", fmt="PNG", color=(255, 0, 0, 128))
    return SimpleUploadedFile(name, buf.read(), content_type="image/png")


# ─── Config Validation Tests ───


class ConfigSchemaTests(TestCase):
    def test_valid_default_config(self):
        config = default_config()
        normalized, errors = validate_config(config)
        self.assertEqual(errors, [])
        self.assertEqual(normalized["version"], CURRENT_CONFIG_VERSION)

    def test_wrong_version_rejected(self):
        config = default_config()
        config["version"] = 99
        _, errors = validate_config(config)
        self.assertTrue(any("version" in e for e in errors))

    def test_unknown_layout_preset_rejected(self):
        config = default_config()
        config["main"]["layout_preset"] = "nonexistent"
        _, errors = validate_config(config)
        self.assertTrue(any("layout_preset" in e for e in errors))

    def test_input_template_defaults_to_clean(self):
        config = default_config()
        normalized, errors = validate_config(config)
        self.assertEqual(errors, [])
        self.assertEqual(normalized["main"]["input_template"], "clean")

    def test_input_template_derived_from_legacy_presets(self):
        config = default_config()
        del config["main"]["input_template"]
        config["main"]["layout_preset"] = "large_touch"
        config["main"]["button_preset"] = "rounded"
        config["main"]["input_preset"] = "outlined"
        normalized, errors = validate_config(config)
        self.assertEqual(errors, [])
        self.assertEqual(normalized["main"]["input_template"], "large_touch")
        # Card-oriented layouts are preserved when template is only derived.
        self.assertEqual(normalized["main"]["layout_preset"], "large_touch")

    def test_card_layout_preserved_with_derived_template(self):
        config = default_config()
        del config["main"]["input_template"]
        config["main"]["layout_preset"] = "photo_cards"
        config["main"]["card_preset"] = "bordered"
        normalized, errors = validate_config(config)
        self.assertEqual(errors, [])
        self.assertEqual(normalized["main"]["layout_preset"], "photo_cards")
        self.assertIn(normalized["main"]["input_template"], PRESET_CATALOG["input_templates"])

    def test_header_alignment_defaults_to_left(self):
        config = default_config()
        config["header"].pop("alignment", None)
        config["header"]["title"].pop("x", None)
        config["header"]["title"].pop("y", None)
        normalized, errors = validate_config(config)
        self.assertEqual(errors, [])
        self.assertEqual(normalized["header"]["alignment"], "left")
        self.assertNotIn("x", normalized["header"]["title"])
        self.assertNotIn("y", normalized["header"]["title"])

    def test_header_alignment_derived_from_legacy_title_x(self):
        config = default_config()
        config["header"].pop("alignment", None)
        config["header"]["title"]["x"] = 0.9
        config["header"]["title"]["y"] = 0.5
        normalized, errors = validate_config(config)
        self.assertEqual(errors, [])
        self.assertEqual(normalized["header"]["alignment"], "right")

    def test_header_logo_size_only(self):
        config = default_config()
        config["header"]["logo"] = {"x": 0.1, "y": 0.2, "width": 0.2, "height": 0.8}
        normalized, errors = validate_config(config)
        self.assertEqual(errors, [])
        self.assertEqual(normalized["header"]["logo"], {"size": 0.8})
        self.assertEqual(normalized["header"]["alignment"], "left")

    def test_header_alignment_explicit(self):
        config = default_config()
        config["header"]["alignment"] = "center"
        normalized, errors = validate_config(config)
        self.assertEqual(errors, [])
        self.assertEqual(normalized["header"]["alignment"], "center")

    def test_main_title_alignment_normalized(self):
        config = default_config()
        config["main"]["title"]["alignment"] = "right"
        normalized, errors = validate_config(config)
        self.assertEqual(errors, [])
        self.assertEqual(normalized["main"]["title"]["alignment"], "right")

    def test_main_title_alignment_defaults_to_center(self):
        config = default_config()
        config["main"]["title"].pop("alignment", None)
        normalized, errors = validate_config(config)
        self.assertEqual(errors, [])
        self.assertEqual(normalized["main"]["title"]["alignment"], "center")

    def test_unknown_input_template_falls_back(self):
        config = default_config()
        config["main"]["input_template"] = "neon_disco"
        normalized, errors = validate_config(config)
        self.assertTrue(any("input_template" in e for e in errors))
        self.assertEqual(normalized["main"]["input_template"], "clean")

    def test_invalid_color_rejected(self):
        config = default_config()
        config["header"]["background"]["color"] = "not-a-color"
        _, errors = validate_config(config)
        self.assertTrue(any("color" in e for e in errors))

    def test_invalid_gradient_angle_clamped(self):
        config = default_config()
        config["header"]["background"]["gradient_angle"] = 9999
        normalized, errors = validate_config(config)
        self.assertEqual(normalized["header"]["background"]["gradient_angle"], 360)

    def test_multiline_header_title_rejected(self):
        config = default_config()
        config["header"]["title"]["text"] = "line1\nline2"
        _, errors = validate_config(config)
        self.assertTrue(any("multiline" in e for e in errors))

    def test_footer_multiline_normalized_to_one_line(self):
        config = default_config()
        config["footer"]["text"]["lines"] = ["a", "b", "c", "d"]
        normalized, errors = validate_config(config)
        self.assertEqual(errors, [])
        self.assertEqual(normalized["footer"]["text"]["lines"], ["a"])

    def test_footer_line_with_breaks_rejected(self):
        config = default_config()
        config["footer"]["text"]["lines"] = ["hello\nworld"]
        _, errors = validate_config(config)
        self.assertTrue(any("single line" in e for e in errors))

    def test_legacy_enabled_false_forced_true(self):
        config = default_config()
        config["header"]["enabled"] = False
        config["footer"]["enabled"] = False
        normalized, errors = validate_config(config)
        self.assertEqual(errors, [])
        self.assertTrue(normalized["header"]["enabled"])
        self.assertTrue(normalized["footer"]["enabled"])

    def test_footer_logo_alignment(self):
        config = default_config()
        config["footer"]["logo"] = {"alignment": "right", "size": 0.9}
        normalized, errors = validate_config(config)
        self.assertEqual(errors, [])
        self.assertEqual(normalized["footer"]["logo"]["alignment"], "right")
        self.assertEqual(normalized["footer"]["logo"]["size"], 0.9)

    def test_legacy_header_title_xy_stripped(self):
        config = default_config()
        config["header"].pop("alignment", None)
        config["header"]["title"]["x"] = 2.5
        config["header"]["title"]["y"] = -0.5
        normalized, errors = validate_config(config)
        self.assertEqual(errors, [])
        self.assertNotIn("x", normalized["header"]["title"])
        self.assertNotIn("y", normalized["header"]["title"])
        # Out-of-range x still participates in alignment derivation before strip.
        self.assertEqual(normalized["header"]["alignment"], "right")

    def test_invalid_image_transform_zoom(self):
        config = default_config()
        config["main"]["image_transform"]["zoom"] = 0.5
        normalized, _ = validate_config(config)
        self.assertEqual(normalized["main"]["image_transform"]["zoom"], 1.0)

    def test_invalid_overlay_value(self):
        config = default_config()
        config["main"]["overlay"] = 5.0
        normalized, _ = validate_config(config)
        self.assertEqual(normalized["main"]["overlay"], 1.0)

    def test_unknown_button_preset_rejected(self):
        config = default_config()
        config["main"]["button_preset"] = "nonexistent"
        _, errors = validate_config(config)
        self.assertTrue(any("button_preset" in e for e in errors))

    def test_unknown_font_rejected(self):
        config = default_config()
        config["header"]["title"]["font"] = "comic_sans"
        _, errors = validate_config(config)
        self.assertTrue(any("font" in e for e in errors))

    def test_script_content_rejected(self):
        config = default_config()
        config["header"]["title"]["text"] = '<script>alert("xss")</script>'
        _, errors = validate_config(config)
        self.assertTrue(any("disallowed" in e for e in errors))

    def test_classic_theme_config(self):
        config = default_config_for_classic("My Title")
        normalized, errors = validate_config(config)
        self.assertEqual(errors, [])
        self.assertEqual(normalized["header"]["title"]["text"], "My Title")
        self.assertEqual(normalized["header"]["background"]["color"], "#3B82F6")

    def test_modern_theme_config(self):
        config = default_config_for_modern("Dark Title")
        normalized, errors = validate_config(config)
        self.assertEqual(errors, [])
        self.assertEqual(normalized["header"]["background"]["color"], "#0F172A")

    def test_non_dict_config_rejected(self):
        _, errors = validate_config("not a dict")
        self.assertTrue(any("JSON object" in e for e in errors))


class PresetTests(TestCase):
    def test_valid_preset(self):
        self.assertTrue(is_valid_preset("main_layouts", "centered"))

    def test_invalid_preset(self):
        self.assertFalse(is_valid_preset("main_layouts", "nonexistent"))

    def test_invalid_category(self):
        self.assertFalse(is_valid_preset("nonexistent_category", "centered"))

    def test_catalog_has_all_categories(self):
        self.assertIn("main_layouts", PRESET_CATALOG)
        self.assertIn("button_styles", PRESET_CATALOG)
        self.assertIn("input_styles", PRESET_CATALOG)
        self.assertIn("card_styles", PRESET_CATALOG)
        self.assertIn("fonts", PRESET_CATALOG)


# ─── Model Tests ───


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class KioskDesignModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from organizations.models import Organization
        from django.contrib.auth import get_user_model

        User = get_user_model()
        cls.user = User.objects.create_user(email="owner@test.com", password="testpass123")
        cls.org = Organization.objects.create(owner=cls.user)
        cls.group = Group.objects.create_group(organization=cls.org, name="Group A")

    def test_create_design_with_defaults(self):
        design = KioskDesign.objects.create(
            organization=self.org,
            group=self.group,
        )
        self.assertEqual(design.config["version"], CURRENT_CONFIG_VERSION)
        self.assertEqual(design.group, self.group)

    def test_tenant_mismatch_rejected(self):
        from organizations.models import Organization
        from django.contrib.auth import get_user_model

        User = get_user_model()
        user2 = User.objects.create_user(email="other@test.com", password="pass123")
        org2 = Organization.objects.create(owner=user2)
        with self.assertRaises(ValidationError):
            KioskDesign.objects.create(
                organization=org2,
                group=self.group,
            )

    def test_invalid_config_rejected(self):
        with self.assertRaises(ValidationError):
            KioskDesign.objects.create(
                organization=self.org,
                group=self.group,
                config={"version": 99, "header": "bad"},
            )

    def test_unique_design_per_group(self):
        KioskDesign.objects.create(organization=self.org, group=self.group)
        with self.assertRaises(Exception):
            KioskDesign.objects.create(organization=self.org, group=self.group)

    def test_group_is_required(self):
        with self.assertRaises(ValidationError):
            KioskDesign.objects.create(organization=self.org)


# ─── API Tests ───


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class KioskDesignAPITests(TestCase):
    def setUp(self):
        from organizations.models import Organization
        from django.contrib.auth import get_user_model

        User = get_user_model()
        self.user = User.objects.create_user(email="apiowner@test.com", password="pass123")
        self.user.email_verified = True
        self.user.save()
        self.org = Organization.objects.create(owner=self.user)
        self.group = Group.objects.create_group(organization=self.org, name="API Group")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = f"/api/groups/{self.group.pk}/kiosk-design/"

    def test_get_auto_creates_design(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        self.assertIn("config", resp.data)
        self.assertEqual(resp.data["config"]["version"], CURRENT_CONFIG_VERSION)

    def test_put_updates_config(self):
        self.client.get(self.url)
        config = default_config()
        config["header"]["title"]["text"] = "Updated Title"
        resp = self.client.put(
            self.url,
            data={"config": json.dumps(config)},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["config"]["header"]["title"]["text"], "Updated Title")

    def test_put_invalid_config_rejected(self):
        self.client.get(self.url)
        bad_config = {"version": 99, "header": "bad"}
        resp = self.client.put(
            self.url,
            data={"config": json.dumps(bad_config)},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)

    def test_cross_tenant_access_denied(self):
        from organizations.models import Organization
        from django.contrib.auth import get_user_model

        User = get_user_model()
        user2 = User.objects.create_user(email="other-api@test.com", password="pass123")
        user2.email_verified = True
        user2.save()
        org2 = Organization.objects.create(owner=user2)
        client2 = APIClient()
        client2.force_authenticate(user=user2)
        resp = client2.get(self.url)
        self.assertEqual(resp.status_code, 404)

    def test_cross_tenant_write_denied(self):
        from organizations.models import Organization
        from django.contrib.auth import get_user_model

        User = get_user_model()
        user2 = User.objects.create_user(email="other-write@test.com", password="pass123")
        user2.email_verified = True
        user2.save()
        org2 = Organization.objects.create(owner=user2)
        client2 = APIClient()
        client2.force_authenticate(user=user2)
        resp = client2.put(
            self.url,
            data={"config": json.dumps(default_config())},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 404)

    def test_logo_upload_and_replacement(self):
        self.client.get(self.url)
        logo1 = _uploaded_image(name="logo1.jpg")
        resp = self.client.put(
            self.url,
            data={"config": json.dumps(default_config()), "header_logo": logo1},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIsNotNone(resp.data["header_logo_url"])
        design = KioskDesign.objects.get(group=self.group)
        first_name = design.header_logo.name
        self.assertTrue(default_storage.exists(first_name))

        logo2 = _uploaded_image(name="logo2.jpg")
        resp2 = self.client.put(
            self.url,
            data={"config": json.dumps(default_config()), "header_logo": logo2},
            format="multipart",
        )
        self.assertEqual(resp2.status_code, 200)
        design.refresh_from_db()
        self.assertNotEqual(design.header_logo.name, first_name)
        self.assertTrue(default_storage.exists(design.header_logo.name))
        self.assertFalse(default_storage.exists(first_name))
        self.assertIsNotNone(resp2.data["header_logo_url"])

    def test_logo_removal(self):
        self.client.get(self.url)
        logo = _uploaded_image(name="logo.jpg")
        self.client.put(
            self.url,
            data={"config": json.dumps(default_config()), "header_logo": logo},
            format="multipart",
        )
        resp = self.client.put(
            self.url,
            data={"config": json.dumps(default_config()), "remove_header_logo": "true"},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data["header_logo_url"])

    def test_footer_logo_independent_of_header(self):
        self.client.get(self.url)
        header = _uploaded_image(name="header.jpg")
        footer = _uploaded_image(name="footer.jpg")
        resp = self.client.put(
            self.url,
            data={
                "config": json.dumps(default_config()),
                "header_logo": header,
                "footer_logo": footer,
            },
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIsNotNone(resp.data["header_logo_url"])
        self.assertIsNotNone(resp.data["footer_logo_url"])
        self.assertNotEqual(resp.data["header_logo_url"], resp.data["footer_logo_url"])

        resp2 = self.client.put(
            self.url,
            data={"config": json.dumps(default_config()), "remove_footer_logo": "true"},
            format="multipart",
        )
        self.assertEqual(resp2.status_code, 200)
        self.assertIsNone(resp2.data["footer_logo_url"])
        self.assertIsNotNone(resp2.data["header_logo_url"])

    def test_background_upload(self):
        self.client.get(self.url)
        bg = _uploaded_image(name="bg.jpg", width=800, height=600)
        resp = self.client.put(
            self.url,
            data={"config": json.dumps(default_config()), "main_background_image": bg},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIsNotNone(resp.data["main_background_image_url"])

    def test_invalid_file_rejected(self):
        self.client.get(self.url)
        bad = SimpleUploadedFile("bad.txt", b"not an image", content_type="text/plain")
        resp = self.client.put(
            self.url,
            data={"config": json.dumps(default_config()), "header_logo": bad},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)

    def test_preset_list_endpoint(self):
        resp = self.client.get("/api/kiosk-presets/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("main_layouts", resp.data)
        self.assertIn("button_styles", resp.data)
        self.assertIn("fonts", resp.data)


# ─── Media Optimization Tests ───


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class ImageOptimizationTests(TestCase):
    def test_logo_preserves_transparency(self):
        from core.images import optimize_kiosk_logo
        buf = _create_test_image(mode="RGBA", fmt="PNG", color=(255, 0, 0, 128))
        uploaded = SimpleUploadedFile("logo.png", buf.read(), content_type="image/png")
        result = optimize_kiosk_logo(uploaded)
        self.assertTrue(result.name.endswith(".png"))

    def test_logo_opaque_becomes_jpeg(self):
        from core.images import optimize_kiosk_logo
        buf = _create_test_image(mode="RGB", fmt="JPEG")
        uploaded = SimpleUploadedFile("logo.jpg", buf.read(), content_type="image/jpeg")
        result = optimize_kiosk_logo(uploaded)
        self.assertTrue(result.name.endswith(".jpg"))

    def test_background_always_jpeg(self):
        from core.images import optimize_kiosk_background
        buf = _create_test_image(mode="RGBA", fmt="PNG", color=(0, 0, 255, 128))
        uploaded = SimpleUploadedFile("bg.png", buf.read(), content_type="image/png")
        result = optimize_kiosk_background(uploaded)
        self.assertTrue(result.name.endswith(".jpg"))

    def test_background_resized(self):
        from core.images import optimize_kiosk_background, BACKGROUND_MAX_DIMENSION
        buf = _create_test_image(width=4000, height=3000)
        uploaded = SimpleUploadedFile("big.jpg", buf.read(), content_type="image/jpeg")
        result = optimize_kiosk_background(uploaded)
        with Image.open(BytesIO(result.read())) as img:
            self.assertLessEqual(max(img.size), BACKGROUND_MAX_DIMENSION)


# ─── Permanent Deletion Tests ───


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class PermanentDeletionTests(TestCase):
    def setUp(self):
        from organizations.models import Organization
        from django.contrib.auth import get_user_model

        User = get_user_model()
        self.user = User.objects.create_user(email="delowner@test.com", password="pass123")
        self.org = Organization.objects.create(owner=self.user)
        self.group = Group.objects.create_group(organization=self.org, name="Del Group")
        self.design = KioskDesign.objects.create(
            organization=self.org, group=self.group,
        )

    def test_permanent_deletion_removes_kiosk_designs(self):
        from accounts.deletion import permanently_delete_customer_account
        permanently_delete_customer_account(self.user)
        self.assertEqual(KioskDesign.objects.filter(organization_id=self.org.pk).count(), 0)

    def test_permanent_deletion_removes_kiosk_media_dir(self):
        from accounts.deletion import permanently_delete_customer_account
        media_dir = Path(TEMP_MEDIA) / f"kiosks/{self.org.pk}"
        media_dir.mkdir(parents=True, exist_ok=True)
        (media_dir / "test.txt").write_text("test")
        permanently_delete_customer_account(self.user)
        self.assertFalse(media_dir.exists())

    def test_missing_media_file_doesnt_crash(self):
        from accounts.deletion import permanently_delete_customer_account
        permanently_delete_customer_account(self.user)


# ─── Kiosk Runtime API Design Data ───


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class KioskRuntimeDesignTests(TestCase):
    def setUp(self):
        from organizations.models import Organization
        from django.contrib.auth import get_user_model
        from kiosk_builder.testing import configure_group_kiosk_for_launch

        User = get_user_model()
        self.user = User.objects.create_user(email="runtime@test.com", password="pass123")
        self.user.email_verified = True
        self.user.save()
        self.org = Organization.objects.create(owner=self.user)
        self.group = Group.objects.create_group(
            organization=self.org, name="Runtime Group",
            kiosk_mode="member_list",
            check_in_enabled=True, check_out_enabled=False,
        )
        KioskDesign.objects.create(organization=self.org, group=self.group)
        configure_group_kiosk_for_launch(self.group)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_kiosk_start_includes_visual_design(self):
        resp = self.client.get(f"/api/groups/{self.group.pk}/kiosk/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("visual_design", resp.data)
        self.assertIn("config", resp.data["visual_design"])
        self.assertEqual(
            resp.data["visual_design"]["config"]["version"],
            CURRENT_CONFIG_VERSION,
        )

    def test_kiosk_start_creates_design_when_missing(self):
        from organizations.models import Organization
        from django.contrib.auth import get_user_model
        from kiosk_builder.testing import configure_group_kiosk_for_launch

        User = get_user_model()
        user2 = User.objects.create_user(email="nodesign@test.com", password="pass123")
        user2.email_verified = True
        user2.save()
        org2 = Organization.objects.create(owner=user2)
        group2 = Group.objects.create_group(
            organization=org2, name="No Design Group",
            kiosk_mode="member_list",
            check_in_enabled=True, check_out_enabled=False,
        )
        KioskDesign.objects.filter(group=group2).delete()
        configure_group_kiosk_for_launch(group2)
        client2 = APIClient()
        client2.force_authenticate(user=user2)
        resp = client2.get(f"/api/groups/{group2.pk}/kiosk/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("visual_design", resp.data)
        self.assertTrue(KioskDesign.objects.filter(group=group2).exists())
