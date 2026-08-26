# Generated manually for global CheckStation promotion mode.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def seed_singleton(apps, schema_editor):
    PlatformPromotionSettings = apps.get_model("core", "PlatformPromotionSettings")
    PlatformPromotionSettings.objects.get_or_create(
        pk=1,
        defaults={"mode": "off"},
    )


def unseed_singleton(apps, schema_editor):
    PlatformPromotionSettings = apps.get_model("core", "PlatformPromotionSettings")
    PlatformPromotionModeChange = apps.get_model(
        "core", "PlatformPromotionModeChange"
    )
    PlatformPromotionModeChange.objects.all().delete()
    PlatformPromotionSettings.objects.filter(pk=1).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0001_platform_advertising_settings"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformPromotionSettings",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "mode",
                    models.CharField(
                        choices=[
                            ("off", "OFF"),
                            ("normal_discount", "Normal Discount"),
                            ("big_discount", "Big Discount"),
                        ],
                        default="off",
                        help_text=(
                            "Global promotional pricing mode for all clients. "
                            "Permanent catalog prices remain unchanged."
                        ),
                        max_length=32,
                    ),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "changed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Promotion Mode",
                "verbose_name_plural": "Promotion Mode",
            },
        ),
        migrations.AddConstraint(
            model_name="platformpromotionsettings",
            constraint=models.CheckConstraint(
                condition=models.Q(("pk", 1)),
                name="core_platformpromotionsettings_singleton_pk",
            ),
        ),
        migrations.AddConstraint(
            model_name="platformpromotionsettings",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    (
                        "mode__in",
                        ["off", "normal_discount", "big_discount"],
                    )
                ),
                name="core_platformpromotionsettings_mode_valid",
            ),
        ),
        migrations.CreateModel(
            name="PlatformPromotionModeChange",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("old_mode", models.CharField(max_length=32)),
                ("new_mode", models.CharField(max_length=32)),
                ("changed_at", models.DateTimeField(auto_now_add=True)),
                (
                    "changed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Promotion mode change",
                "verbose_name_plural": "Promotion mode changes",
                "ordering": ("-changed_at", "-id"),
            },
        ),
        migrations.RunPython(seed_singleton, unseed_singleton),
    ]
