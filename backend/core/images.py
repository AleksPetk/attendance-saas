from io import BytesIO
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_IMAGE_DIMENSION = 1200
JPEG_QUALITY = 85

LOGO_MAX_DIMENSION = 512
LOGO_QUALITY = 90

BACKGROUND_MAX_DIMENSION = 2048
BACKGROUND_QUALITY = 80

# Match existing kiosk upload UX (JPEG/PNG/GIF/WebP) and harden decoding.
ALLOWED_UPLOAD_IMAGE_FORMATS = ("JPEG", "PNG", "WEBP", "GIF")
MAX_UPLOAD_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


def _uploaded_byte_size(uploaded_file) -> int:
    size = getattr(uploaded_file, "size", None)
    if isinstance(size, int) and size >= 0:
        return size
    pos = uploaded_file.tell()
    uploaded_file.seek(0, 2)
    measured = uploaded_file.tell()
    uploaded_file.seek(pos)
    return int(measured)


def open_uploaded_image(uploaded_file):
    """
    Open a user upload with format allowlist + size checks.

    Callers must close the returned image (preferably via context manager).
    """
    size = _uploaded_byte_size(uploaded_file)
    if size > MAX_UPLOAD_IMAGE_BYTES:
        raise ValidationError(
            f"Image must be under {MAX_UPLOAD_IMAGE_BYTES // (1024 * 1024)} MB."
        )
    if size <= 0:
        raise ValidationError("Unsupported or corrupted image.")

    uploaded_file.seek(0)
    try:
        image = Image.open(uploaded_file, formats=list(ALLOWED_UPLOAD_IMAGE_FORMATS))
        image.load()
    except UnidentifiedImageError as exc:
        raise ValidationError("Unsupported or corrupted image.") from exc
    except OSError as exc:
        raise ValidationError("Unsupported or corrupted image.") from exc

    fmt = (image.format or "").upper()
    if fmt not in ALLOWED_UPLOAD_IMAGE_FORMATS:
        image.close()
        raise ValidationError(f"Unsupported image format '{fmt or 'unknown'}'.")

    # Do not silently accept multi-frame/animated uploads as a single frame.
    n_frames = int(getattr(image, "n_frames", 1) or 1)
    if n_frames > 1:
        image.close()
        raise ValidationError("Animated images are not supported.")

    return image


def optimize_uploaded_image(uploaded_file, *, stem="photo"):
    """
    Resize and recompress an uploaded image for local profile use.

    Stores a reasonably sized JPEG rather than a raw phone-camera original.
    Exact production optimization specs remain undecided; this is a local
    development implementation of the approved media-optimization direction.
    """
    with open_uploaded_image(uploaded_file) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode in ("RGBA", "LA"):
            background = Image.new("RGB", image.size, (255, 255, 255))
            alpha = image.getchannel("A") if "A" in image.getbands() else None
            background.paste(image, mask=alpha)
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")
        image.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION))
        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)

    filename = f"{Path(stem).stem}.jpg"
    return ContentFile(buffer.getvalue(), name=filename)


def optimize_kiosk_logo(uploaded_file, *, stem="logo"):
    """
    Optimize a kiosk header logo.  Preserves transparency by saving as PNG
    when the source has an alpha channel; otherwise saves as JPEG.
    """
    with open_uploaded_image(uploaded_file) as image:
        image = ImageOps.exif_transpose(image)
        has_alpha = image.mode in ("RGBA", "LA", "PA") or (
            image.mode == "P" and "transparency" in image.info
        )
        if has_alpha:
            image = image.convert("RGBA")
            image.thumbnail((LOGO_MAX_DIMENSION, LOGO_MAX_DIMENSION))
            buffer = BytesIO()
            image.save(buffer, format="PNG", optimize=True)
            filename = f"{Path(stem).stem}.png"
        else:
            if image.mode != "RGB":
                image = image.convert("RGB")
            image.thumbnail((LOGO_MAX_DIMENSION, LOGO_MAX_DIMENSION))
            buffer = BytesIO()
            image.save(buffer, format="JPEG", quality=LOGO_QUALITY, optimize=True)
            filename = f"{Path(stem).stem}.jpg"

    return ContentFile(buffer.getvalue(), name=filename)


def optimize_kiosk_background(uploaded_file, *, stem="background"):
    """
    Optimize a kiosk main-section background image.  Aggressively compressed
    JPEG for lightweight kiosk loading.  Transparency is flattened since
    backgrounds always fill the section.
    """
    with open_uploaded_image(uploaded_file) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode in ("RGBA", "LA"):
            bg = Image.new("RGB", image.size, (255, 255, 255))
            alpha = image.getchannel("A") if "A" in image.getbands() else None
            bg.paste(image, mask=alpha)
            image = bg
        elif image.mode != "RGB":
            image = image.convert("RGB")
        image.thumbnail((BACKGROUND_MAX_DIMENSION, BACKGROUND_MAX_DIMENSION))
        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=BACKGROUND_QUALITY, optimize=True)

    filename = f"{Path(stem).stem}.jpg"
    return ContentFile(buffer.getvalue(), name=filename)


def is_uncommitted_file(field_file):
    return bool(field_file) and not getattr(field_file, "_committed", True)
