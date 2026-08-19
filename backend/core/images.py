from io import BytesIO
from pathlib import Path

from django.core.files.base import ContentFile
from PIL import Image, ImageOps

MAX_IMAGE_DIMENSION = 1200
JPEG_QUALITY = 85


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


def is_uncommitted_file(field_file):
    return bool(field_file) and not getattr(field_file, "_committed", True)
