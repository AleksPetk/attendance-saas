import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def seed_singleton(apps, schema_editor):
    model = apps.get_model("core", "PlatformPricingTemplateSettings")
    model.objects.get_or_create(pk=1, defaults={"active_template": "normal"})


def unseed_singleton(apps, schema_editor):
    model = apps.get_model("core", "PlatformPricingTemplateSettings")
    model.objects.filter(pk=1).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0005_checkstation_account_blocked_and_admin_audit"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformPricingTemplateSettings",
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
                    "active_template",
                    models.CharField(
                        choices=[("normal", "Normal"), ("autumn", "Autumn")],
                        default="normal",
                        help_text="Presentation only. Normal is the safe default.",
                        max_length=24,
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
                "verbose_name": "Price Templates",
                "verbose_name_plural": "Price Templates",
            },
        ),
        migrations.AddConstraint(
            model_name="platformpricingtemplatesettings",
            constraint=models.CheckConstraint(
                condition=models.Q(("id", 1)),
                name="core_platformpricingtemplatesettings_singleton_pk",
            ),
        ),
        migrations.AddConstraint(
            model_name="platformpricingtemplatesettings",
            constraint=models.CheckConstraint(
                condition=models.Q(("active_template__in", ["normal", "autumn"])),
                name="core_platformpricingtemplatesettings_template_valid",
            ),
        ),
        migrations.RunPython(seed_singleton, unseed_singleton),
    ]
