"""
Data migration: create a KioskDesign for every existing active Group,
mapping classic/modern kiosk_theme to a corresponding default config.

kiosk_title is copied into the header title text.  Behavioral fields
(kiosk_mode, kiosk_enabled, etc.) remain on Group.
"""

from django.db import migrations


def _default_text_effects():
    return {"shadow": False, "outline": False}


def _base_config(header_title=""):
    return {
        "version": 1,
        "header": {
            "enabled": True,
            "height": 0.12,
            "background": {"mode": "solid", "color": "#2563EB", "color2": None, "gradient_angle": 90},
            "logo": None,
            "title": {
                "text": header_title,
                "x": 0.50, "y": 0.50,
                "font": "inter", "size_rem": 1.5,
                "color": "#FFFFFF",
                "effects": _default_text_effects(),
            },
        },
        "main": {
            "background": {"mode": "solid", "color": "#FFFFFF", "color2": None, "gradient_angle": 180},
            "image_transform": {"focal_x": 0.5, "focal_y": 0.5, "zoom": 1.0},
            "overlay": 0.0,
            "layout_preset": "centered",
            "title": {
                "text": "", "font": "inter", "size_rem": 2.0,
                "color": "#111827", "effects": _default_text_effects(),
            },
            "button_preset": "rounded",
            "input_preset": "outlined",
            "card_preset": "elevated",
        },
        "footer": {
            "enabled": False,
            "height": 0.06,
            "background": {"mode": "solid", "color": "#1E293B", "color2": None, "gradient_angle": 90},
            "text": {
                "lines": [], "alignment": "center",
                "font": "inter", "size_rem": 0.875,
                "color": "#94A3B8", "effects": _default_text_effects(),
            },
        },
    }


def forwards(apps, schema_editor):
    Group = apps.get_model("groups", "Group")
    KioskDesign = apps.get_model("kiosk_builder", "KioskDesign")

    for group in Group.objects.filter(status="active").select_related("organization"):
        if KioskDesign.objects.filter(group=group).exists():
            continue
        title = (group.kiosk_title or group.name or "")
        theme = getattr(group, "kiosk_theme", "classic") or "classic"
        config = _base_config(header_title=title)

        if theme == "modern":
            config["header"]["background"]["color"] = "#0F172A"
            config["header"]["title"]["color"] = "#F8FAFC"
            config["main"]["background"]["color"] = "#1E293B"
            config["main"]["title"]["color"] = "#F1F5F9"
            config["footer"]["background"]["color"] = "#020617"
            config["footer"]["text"]["color"] = "#64748B"
        else:
            config["header"]["background"]["color"] = "#3B82F6"
            config["main"]["background"]["color"] = "#F8FAFC"
            config["main"]["title"]["color"] = "#1E293B"

        KioskDesign.objects.create(
            organization=group.organization,
            group=group,
            config=config,
        )


def backwards(apps, schema_editor):
    KioskDesign = apps.get_model("kiosk_builder", "KioskDesign")
    KioskDesign.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("kiosk_builder", "0001_initial"),
        ("groups", "0003_group_kiosk_confirmation_message_group_kiosk_enabled_and_more"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
