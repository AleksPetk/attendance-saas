import django.db.models.deletion
import django.db.models.functions.text
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("groups", "0017_group_email_outbox"),
        ("organizations", "0015_organization_billing_market_override"),
    ]

    operations = [
        migrations.CreateModel(
            name="SavedEmailSender",
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
                ("name", models.CharField(max_length=80)),
                (
                    "provider",
                    models.CharField(
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
                ("smtp_host", models.CharField(blank=True, default="", max_length=255)),
                ("smtp_port", models.PositiveIntegerField(blank=True, null=True)),
                (
                    "smtp_security",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("ssl", "SSL/TLS"),
                            ("starttls", "STARTTLS"),
                            ("none", "None"),
                        ],
                        default="",
                        max_length=20,
                    ),
                ),
                (
                    "smtp_username",
                    models.CharField(blank=True, default="", max_length=255),
                ),
                ("smtp_password_encrypted", models.TextField(blank=True, default="")),
                ("from_email", models.EmailField(blank=True, default="", max_length=254)),
                ("from_name", models.CharField(blank=True, default="", max_length=150)),
                ("provider_settings", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="saved_email_senders",
                        to="organizations.organization",
                    ),
                ),
            ],
            options={
                "ordering": ["name", "id"],
            },
        ),
        migrations.AddIndex(
            model_name="savedemailsender",
            index=models.Index(
                fields=["organization", "name"],
                name="saved_sender_org_name_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="savedemailsender",
            constraint=models.UniqueConstraint(
                django.db.models.functions.text.Lower("name"),
                models.F("organization"),
                name="unique_saved_email_sender_name_per_organization",
            ),
        ),
        migrations.AddConstraint(
            model_name="savedemailsender",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("provider__in", ["custom_smtp", "gmail", "microsoft", "yahoo"])
                ),
                name="groups_saved_email_sender_provider_valid",
            ),
        ),
        migrations.AddConstraint(
            model_name="savedemailsender",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("smtp_security", ""),
                    ("smtp_security__in", ["ssl", "starttls", "none"]),
                    _connector="OR",
                ),
                name="groups_saved_email_sender_smtp_security_valid",
            ),
        ),
    ]
