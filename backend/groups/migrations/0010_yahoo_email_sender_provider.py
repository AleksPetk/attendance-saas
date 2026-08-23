# Generated manually for Yahoo Mail email sender provider.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("groups", "0009_microsoft_email_sender_provider"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="groupemailsender",
            name="groups_email_sender_provider_valid",
        ),
        migrations.AlterField(
            model_name="groupemailsender",
            name="provider",
            field=models.CharField(
                choices=[
                    ("custom_smtp", "Custom SMTP"),
                    ("gmail", "Gmail"),
                    ("microsoft", "Outlook / Microsoft 365"),
                    ("yahoo", "Yahoo Mail"),
                ],
                default="custom_smtp",
                max_length=40,
            ),
        ),
        migrations.AddConstraint(
            model_name="groupemailsender",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    (
                        "provider__in",
                        ["custom_smtp", "gmail", "microsoft", "yahoo"],
                    )
                ),
                name="groups_email_sender_provider_valid",
            ),
        ),
    ]
