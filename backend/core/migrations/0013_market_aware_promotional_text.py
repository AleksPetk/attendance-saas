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


class Migration(migrations.Migration):
    dependencies = [("core", "0012_platform_admin_billing_market_action")]

    operations = [
        migrations.AddField(
            model_name="platformpromotionaltextsettings",
            name="mode",
            field=models.CharField(
                choices=[("together", "Markets Together"), ("separate", "Markets Separate")],
                default="together",
                help_text="Choose one shared presentation or independent Global and Japan presentations.",
                max_length=12,
                verbose_name="Market Mode",
            ),
        ),
        migrations.AddField(
            model_name="platformpromotionaltextsettings",
            name="global_enabled",
            field=models.BooleanField(
                default=False,
                help_text="Show the Global display text in Global billing contexts.",
                verbose_name="Global Enabled",
            ),
        ),
        migrations.AddField(
            model_name="platformpromotionaltextsettings",
            name="global_text",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Display text for the Global billing market only.",
                max_length=280,
                verbose_name="Global Message",
            ),
        ),
        migrations.AddField(
            model_name="platformpromotionaltextsettings",
            name="global_text_style",
            field=models.CharField(
                choices=STYLE_CHOICES,
                default="normal",
                help_text="Presentation only. This is independent from Pricing Card Templates.",
                max_length=32,
                verbose_name="Global Text Style",
            ),
        ),
        migrations.AddField(
            model_name="platformpromotionaltextsettings",
            name="jp_enabled",
            field=models.BooleanField(
                default=False,
                help_text="Show the Japan display text in Japan billing contexts.",
                verbose_name="Japan Enabled",
            ),
        ),
        migrations.AddField(
            model_name="platformpromotionaltextsettings",
            name="jp_text",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Display text for the Japan billing market only.",
                max_length=280,
                verbose_name="Japan Message",
            ),
        ),
        migrations.AddField(
            model_name="platformpromotionaltextsettings",
            name="jp_text_style",
            field=models.CharField(
                choices=STYLE_CHOICES,
                default="normal",
                help_text="Presentation only. This is independent from Pricing Card Templates.",
                max_length=32,
                verbose_name="Japan Text Style",
            ),
        ),
        migrations.AddConstraint(
            model_name="platformpromotionaltextsettings",
            constraint=models.CheckConstraint(
                condition=models.Q(mode__in=("together", "separate")),
                name="core_promotionaltext_market_mode_valid",
            ),
        ),
        migrations.AddConstraint(
            model_name="platformpromotionaltextsettings",
            constraint=models.CheckConstraint(
                condition=models.Q(global_text_style__in=tuple(key for key, _label in STYLE_CHOICES)),
                name="core_promotionaltext_global_style_valid",
            ),
        ),
        migrations.AddConstraint(
            model_name="platformpromotionaltextsettings",
            constraint=models.CheckConstraint(
                condition=models.Q(jp_text_style__in=tuple(key for key, _label in STYLE_CHOICES)),
                name="core_promotionaltext_jp_style_valid",
            ),
        ),
    ]
