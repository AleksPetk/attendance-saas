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
]

STYLE_KEYS = [key for key, _label in STYLE_CHOICES]


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0009_platform_promotional_text_settings"),
    ]

    operations = [
        migrations.AlterField(
            model_name="platformpromotionaltextsettings",
            name="text",
            field=models.CharField(
                blank=True,
                default="",
                help_text=(
                    "Display text only. It does not change prices, discounts, "
                    "promotions, or Stripe coupons."
                ),
                max_length=280,
                verbose_name="Message",
            ),
        ),
        migrations.AddField(
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
