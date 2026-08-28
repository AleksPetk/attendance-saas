from django.db import migrations, models


TEMPLATE_CHOICES = [
    ("normal", "Normal"),
    ("spring", "Spring"),
    ("summer", "Summer"),
    ("autumn", "Autumn"),
    ("winter", "Winter"),
]

TEMPLATE_KEYS = [key for key, _label in TEMPLATE_CHOICES]


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0006_platform_pricing_template_settings"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="platformpricingtemplatesettings",
            name="core_platformpricingtemplatesettings_template_valid",
        ),
        migrations.AlterField(
            model_name="platformpricingtemplatesettings",
            name="active_template",
            field=models.CharField(
                choices=TEMPLATE_CHOICES,
                default="normal",
                help_text="Presentation only. Normal is the safe default.",
                max_length=24,
            ),
        ),
        migrations.AddConstraint(
            model_name="platformpricingtemplatesettings",
            constraint=models.CheckConstraint(
                condition=models.Q(active_template__in=TEMPLATE_KEYS),
                name="core_platformpricingtemplatesettings_template_valid",
            ),
        ),
    ]
