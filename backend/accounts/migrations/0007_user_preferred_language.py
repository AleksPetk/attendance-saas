from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0006_owner_auth_provider_links"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="preferred_language",
            field=models.CharField(
                choices=[("en", "English"), ("ja", "Japanese")],
                default="en",
                help_text=(
                    "Owner UI language (en or ja). Independent of billing market, "
                    "currency, and timezone."
                ),
                max_length=8,
            ),
        ),
    ]
