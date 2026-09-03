from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0010_update_global_yearly_prices"),
    ]

    operations = [
        migrations.AddField(
            model_name="announcement",
            name="language",
            field=models.CharField(
                choices=[("en", "English"), ("ja", "Japanese")],
                db_index=True,
                default="en",
                help_text="Admin metadata only. Language does not affect delivery eligibility.",
                max_length=5,
                verbose_name="Language",
            ),
        ),
        migrations.AddField(
            model_name="announcement",
            name="market",
            field=models.CharField(
                choices=[
                    ("all", "All Markets"),
                    ("global", "Global"),
                    ("jp", "Japan"),
                ],
                db_index=True,
                default="all",
                help_text="Additional billing-market filter applied after audience targeting.",
                max_length=10,
                verbose_name="Market",
            ),
        ),
    ]
