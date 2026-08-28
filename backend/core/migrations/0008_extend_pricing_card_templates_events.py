from django.db import migrations, models


TEMPLATE_CHOICES = [
    ("normal", "Normal"),
    ("spring", "Spring"),
    ("summer", "Summer"),
    ("autumn", "Autumn"),
    ("winter", "Winter"),
    ("halloween", "Halloween"),
    ("christmas_new_year", "Christmas & New Year"),
    ("black_friday", "Black Friday"),
]

TEMPLATE_KEYS = [key for key, _label in TEMPLATE_CHOICES]


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0007_extend_pricing_card_templates"),
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
