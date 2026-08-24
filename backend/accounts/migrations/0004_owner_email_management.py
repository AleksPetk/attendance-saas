from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_platform_totp"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="backup_email",
            field=models.EmailField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="backup_email_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="pending_backup_email",
            field=models.EmailField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="backup_email_verification_last_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="pending_primary_email",
            field=models.EmailField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="pending_primary_email_requested_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="primary_email_change_last_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
