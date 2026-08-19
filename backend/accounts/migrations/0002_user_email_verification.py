from django.db import migrations, models
from django.utils import timezone


def mark_existing_users_verified(apps, schema_editor):
    """
    Existing rows predate customer email verification. Mark them verified so
    local platform/dev accounts are not locked out after this migration.
    New registrations still default to unverified.
    """
    User = apps.get_model("accounts", "User")
    User.objects.filter(email_verified=False).update(
        email_verified=True,
        email_verified_at=timezone.now(),
    )


def noop_reverse(apps, schema_editor):
    return None


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="email_verified",
            field=models.BooleanField(
                default=False,
                help_text="Whether the paying customer has confirmed this email address.",
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="email_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="email_verification_last_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="password_reset_last_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(mark_existing_users_verified, noop_reverse),
    ]
