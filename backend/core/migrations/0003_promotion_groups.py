# Refactor single global promotion mode into four eligibility groups.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def migrate_legacy_mode(apps, schema_editor):
    PlatformPromotionSettings = apps.get_model("core", "PlatformPromotionSettings")
    PlatformPromotionModeChange = apps.get_model(
        "core", "PlatformPromotionModeChange"
    )
    mapping = {
        "off": "off",
        "normal_discount": "normal",
        "big_discount": "big",
        "normal": "normal",
        "big": "big",
    }
    for row in PlatformPromotionSettings.objects.all():
        legacy = getattr(row, "mode", None) or "off"
        row.new_basic_mode = mapping.get(legacy, "off")
        row.plus_monthly_enabled = False
        row.plus_yearly_enabled = False
        row.business_monthly_enabled = False
        row.save(
            update_fields=[
                "new_basic_mode",
                "plus_monthly_enabled",
                "plus_yearly_enabled",
                "business_monthly_enabled",
            ]
        )
    for change in PlatformPromotionModeChange.objects.all():
        old_raw = getattr(change, "old_mode", "") or ""
        new_raw = getattr(change, "new_mode", "") or ""
        change.group = "new_basic"
        change.old_value = mapping.get(old_raw, old_raw or "off")
        change.new_value = mapping.get(new_raw, new_raw or "off")
        change.save(update_fields=["group", "old_value", "new_value"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0002_platform_promotion_settings"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="platformpromotionsettings",
            name="new_basic_mode",
            field=models.CharField(
                choices=[
                    ("off", "OFF"),
                    ("normal", "NORMAL"),
                    ("big", "BIG"),
                ],
                default="off",
                help_text=(
                    "Group 1: acquisition offers for public visitors and "
                    "Basic workspaces."
                ),
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="platformpromotionsettings",
            name="plus_monthly_enabled",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Group 2: retention/upgrade offers for Plus Monthly "
                    "subscribers."
                ),
            ),
        ),
        migrations.AddField(
            model_name="platformpromotionsettings",
            name="plus_yearly_enabled",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Group 3: prorated upgrade offer for Plus Yearly "
                    "subscribers."
                ),
            ),
        ),
        migrations.AddField(
            model_name="platformpromotionsettings",
            name="business_monthly_enabled",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Group 4: yearly switch offer for Business Monthly "
                    "subscribers."
                ),
            ),
        ),
        migrations.AddField(
            model_name="platformpromotionmodechange",
            name="group",
            field=models.CharField(
                choices=[
                    ("new_basic", "New / Basic"),
                    ("plus_monthly", "Plus Monthly"),
                    ("plus_yearly", "Plus Yearly"),
                    ("business_monthly", "Business Monthly"),
                ],
                default="new_basic",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="platformpromotionmodechange",
            name="old_value",
            field=models.CharField(default="", max_length=32),
        ),
        migrations.AddField(
            model_name="platformpromotionmodechange",
            name="new_value",
            field=models.CharField(default="", max_length=32),
        ),
        migrations.RunPython(migrate_legacy_mode, noop_reverse),
        migrations.RemoveConstraint(
            model_name="platformpromotionsettings",
            name="core_platformpromotionsettings_mode_valid",
        ),
        migrations.RemoveField(
            model_name="platformpromotionsettings",
            name="mode",
        ),
        migrations.RemoveField(
            model_name="platformpromotionmodechange",
            name="old_mode",
        ),
        migrations.RemoveField(
            model_name="platformpromotionmodechange",
            name="new_mode",
        ),
        migrations.AddConstraint(
            model_name="platformpromotionsettings",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("new_basic_mode__in", ["off", "normal", "big"])
                ),
                name="core_platformpromotionsettings_new_basic_mode_valid",
            ),
        ),
        migrations.AlterModelOptions(
            name="platformpromotionsettings",
            options={
                "verbose_name": "Promotions",
                "verbose_name_plural": "Promotions",
            },
        ),
        migrations.AlterModelOptions(
            name="platformpromotionmodechange",
            options={
                "ordering": ("-changed_at", "-id"),
                "verbose_name": "Promotion setting change",
                "verbose_name_plural": "Promotion setting changes",
            },
        ),
    ]
