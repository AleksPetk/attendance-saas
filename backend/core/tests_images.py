"""Focused upload hardening tests for core.images."""

from __future__ import annotations

from io import BytesIO

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image

from core.images import (
    ALLOWED_UPLOAD_IMAGE_FORMATS,
    MAX_UPLOAD_IMAGE_BYTES,
    open_uploaded_image,
    optimize_kiosk_background,
    optimize_kiosk_logo,
    optimize_uploaded_image,
)


def _image_bytes(*, fmt="JPEG", mode="RGB", size=(32, 32), color=(10, 20, 30), **save_kwargs):
    buffer = BytesIO()
    image = Image.new(mode, size, color)
    image.save(buffer, format=fmt, **save_kwargs)
    return buffer.getvalue()


def _upload(name, raw, content_type):
    return SimpleUploadedFile(name, raw, content_type=content_type)


class OpenUploadedImageTests(TestCase):
    def test_accepts_jpeg_png_webp_and_gif(self):
        cases = [
            ("a.jpg", "JPEG", "image/jpeg", "RGB", (1, 2, 3)),
            ("a.png", "PNG", "image/png", "RGBA", (1, 2, 3, 255)),
            ("a.webp", "WEBP", "image/webp", "RGB", (4, 5, 6)),
            ("a.gif", "GIF", "image/gif", "RGB", (7, 8, 9)),
        ]
        for name, fmt, content_type, mode, color in cases:
            with self.subTest(fmt=fmt):
                raw = _image_bytes(fmt=fmt, mode=mode, color=color)
                uploaded = _upload(name, raw, content_type)
                with open_uploaded_image(uploaded) as image:
                    self.assertIn(image.format, ALLOWED_UPLOAD_IMAGE_FORMATS)

    def test_rejects_bmp_tiff_and_fake_jpeg_payload(self):
        bmp = _image_bytes(fmt="BMP")
        with self.assertRaises(ValidationError):
            open_uploaded_image(_upload("x.bmp", bmp, "image/bmp"))

        tiff = _image_bytes(fmt="TIFF")
        with self.assertRaises(ValidationError):
            open_uploaded_image(_upload("x.tif", tiff, "image/tiff"))

        with self.assertRaises(ValidationError):
            open_uploaded_image(
                _upload("spoof.jpg", b"not-an-image", "image/jpeg")
            )

    def test_rejects_oversized_upload_before_decode(self):
        huge = b"x" * (MAX_UPLOAD_IMAGE_BYTES + 1)
        with self.assertRaises(ValidationError) as caught:
            open_uploaded_image(_upload("huge.jpg", huge, "image/jpeg"))
        self.assertIn("under 10 MB", str(caught.exception))

    def test_rejects_animated_gif(self):
        buffer = BytesIO()
        frame1 = Image.new("RGB", (8, 8), (255, 0, 0))
        frame2 = Image.new("RGB", (8, 8), (0, 255, 0))
        frame1.save(
            buffer,
            format="GIF",
            save_all=True,
            append_images=[frame2],
            duration=100,
            loop=0,
        )
        with self.assertRaises(ValidationError) as caught:
            open_uploaded_image(
                _upload("anim.gif", buffer.getvalue(), "image/gif")
            )
        self.assertIn("Animated", str(caught.exception))


class OptimizeUploadedImageTests(TestCase):
    def test_member_photo_path_normalizes_to_jpeg(self):
        raw = _image_bytes(fmt="PNG", mode="RGBA", color=(255, 0, 0, 128))
        result = optimize_uploaded_image(
            _upload("photo.png", raw, "image/png"),
            stem="42",
        )
        self.assertTrue(result.name.endswith(".jpg"))
        with Image.open(BytesIO(result.read())) as image:
            self.assertEqual(image.format, "JPEG")
            self.assertEqual(image.mode, "RGB")

    def test_rejects_unsupported_format_for_member_photo(self):
        raw = _image_bytes(fmt="BMP")
        with self.assertRaises(ValidationError):
            optimize_uploaded_image(_upload("photo.bmp", raw, "image/bmp"))


class OptimizeKioskMediaTests(TestCase):
    def test_logo_and_background_accept_allowed_formats(self):
        jpeg = _upload("logo.jpg", _image_bytes(fmt="JPEG"), "image/jpeg")
        png = _upload(
            "logo.png",
            _image_bytes(fmt="PNG", mode="RGBA", color=(0, 0, 0, 0)),
            "image/png",
        )
        webp = _upload("logo.webp", _image_bytes(fmt="WEBP"), "image/webp")
        gif = _upload("logo.gif", _image_bytes(fmt="GIF"), "image/gif")

        self.assertTrue(optimize_kiosk_logo(jpeg).name.endswith(".jpg"))
        self.assertTrue(optimize_kiosk_logo(png).name.endswith(".png"))
        self.assertTrue(optimize_kiosk_logo(webp).name.endswith(".jpg"))
        self.assertTrue(optimize_kiosk_logo(gif).name.endswith(".jpg"))

        bg = _upload("bg.png", _image_bytes(fmt="PNG"), "image/png")
        self.assertTrue(optimize_kiosk_background(bg).name.endswith(".jpg"))

    def test_kiosk_paths_reject_tiff(self):
        raw = _image_bytes(fmt="TIFF")
        uploaded = _upload("x.tif", raw, "image/tiff")
        with self.assertRaises(ValidationError):
            optimize_kiosk_logo(uploaded)
        uploaded.seek(0)
        with self.assertRaises(ValidationError):
            optimize_kiosk_background(uploaded)
