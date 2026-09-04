# Generated manually for owner account recovery.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0008_user_signup_billing_market"),
    ]

    operations = [
        migrations.CreateModel(
            name="OwnerAccountRecoveryChallenge",
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
                ("token_hash", models.CharField(db_index=True, max_length=64, unique=True)),
                ("backup_email", models.EmailField(max_length=254)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField()),
                ("email_confirmed_at", models.DateTimeField(blank=True, null=True)),
                ("two_factor_confirmed_at", models.DateTimeField(blank=True, null=True)),
                ("pending_new_email", models.EmailField(blank=True, max_length=254, null=True)),
                ("pending_password_applied", models.BooleanField(default=False)),
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "primary_verify_token_hash",
                    models.CharField(blank=True, default="", max_length=64),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="account_recovery_challenges",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="OwnerAccountRecoveryEvent",
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
                ("event_type", models.CharField(max_length=64)),
                ("backup_email", models.EmailField(blank=True, default="", max_length=254)),
                ("detail", models.CharField(blank=True, default="", max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="account_recovery_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="owneraccountrecoverychallenge",
            index=models.Index(
                fields=["user", "created_at"],
                name="accounts_ow_user_id_7d3a2a_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="owneraccountrecoverychallenge",
            index=models.Index(
                fields=["expires_at"],
                name="accounts_ow_expires_6c8f1b_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="owneraccountrecoveryevent",
            index=models.Index(
                fields=["user", "created_at"],
                name="accounts_ow_user_id_9f4c11_idx",
            ),
        ),
    ]
