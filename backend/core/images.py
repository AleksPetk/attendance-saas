from io import BytesIO
from pathlib import Path

from django.core.files.base import ContentFile
from PIL import Image, ImageOps

MAX_IMAGE_DIMENSION = 1200
JPEG_QUALITY = 85

LOGO_MAX_DIMENSION = 512
LOGO_QUALITY = 90

BACKGROUND_MAX_DIMENSION = 2048
BACKGROUND_QUALITY = 80


def optimize_uploaded_image(uploaded_file, *, stem="photo"):
    """
    Resize and recompress an uploaded image for local profile use.

    Stores a reasonably sized JPEG rather than a raw phone-camera original.
    Exact production optimization specs remain undecided; this is a local
    development implementation of the approved media-optimization direction.
    """
    uploaded_file.seek(0)
    with Image.open(uploaded_file) as image:
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
    uploaded_file.seek(0)
    with Image.open(uploaded_file) as image:
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
    uploaded_file.seek(0)
    with Image.open(uploaded_file) as image:
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
