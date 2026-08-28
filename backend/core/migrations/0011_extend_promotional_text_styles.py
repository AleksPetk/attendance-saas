from django.db import migrations, models


STYLE_CHOICES = [
    ("normal", "Normal"),
    ("spring", "Spring"),
    ("summer", "Summer"),
    ("autumn", "Autumn"),
    ("winter", "Winter"),
    ("halloween", "Halloween"),
    ("christmas_new_year", "Christmas & New Year"),
    ("black_friday", "Black Friday"),
    ("luxury_gold", "Luxury Gold"),
    ("cyberpunk", "Cyberpunk"),
    ("retro_sale", "Retro Sale"),
    ("dark_fantasy", "Dark Fantasy"),
    ("editorial", "Editorial"),
    ("impact_sale", "Impact Sale"),
    ("arcade", "Arcade"),
]

STYLE_KEYS = [key for key, _label in STYLE_CHOICES]


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0010_promotional_text_styles"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="platformpromotionaltextsettings",
            name="core_platformpromotionaltextsettings_style_valid",
        ),
        migrations.AlterField(
            model_name="platformpromotionaltextsettings",
            name="text_style",
            field=models.CharField(
                choices=STYLE_CHOICES,
                default="normal",
                help_text=(
                    "Presentation only. This is independent from Pricing Card "
                    "Templates."
                ),
                max_length=32,
                verbose_name="Text Style",
            ),
        ),
        migrations.AddConstraint(
            model_name="platformpromotionaltextsettings",
            constraint=models.CheckConstraint(
                condition=models.Q(text_style__in=STYLE_KEYS),
                name="core_platformpromotionaltextsettings_style_valid",
            ),
        ),
    ]
