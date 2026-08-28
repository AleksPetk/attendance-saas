import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def seed_singleton(apps, schema_editor):
    model = apps.get_model("core", "PlatformPromotionalTextSettings")
    model.objects.get_or_create(
        pk=1,
        defaults={"enabled": False, "text": ""},
    )


def unseed_singleton(apps, schema_editor):
    model = apps.get_model("core", "PlatformPromotionalTextSettings")
    model.objects.filter(pk=1).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0008_extend_pricing_card_templates_events"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformPromotionalTextSettings",
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
                    "enabled",
                    models.BooleanField(
                        default=False,
                        help_text=(
                            "Show this display text on public and workspace "
                            "pricing areas."
                        ),
                    ),
                ),
                (
                    "text",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text=(
                            "Display text only. It does not change prices, "
                            "discounts, promotions, or Stripe coupons."
                        ),
                        max_length=280,
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
                "verbose_name": "Promotional Text",
                "verbose_name_plural": "Promotional Text",
            },
        ),
        migrations.AddConstraint(
            model_name="platformpromotionaltextsettings",
            constraint=models.CheckConstraint(
                condition=models.Q(("id", 1)),
                name="core_platformpromotionaltextsettings_singleton_pk",
            ),
        ),
        migrations.RunPython(seed_singleton, unseed_singleton),
    ]
