from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0007_rename_billing_wor_ends_at_b8e4a1_idx_billing_wor_ends_at_33b4bb_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="workspacesubscription",
            name="pending_checkout_expires_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="workspacesubscription",
            name="pending_checkout_idempotency_key",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="workspacesubscription",
            name="pending_checkout_interval",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddField(
            model_name="workspacesubscription",
            name="pending_checkout_plan",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddField(
            model_name="workspacesubscription",
            name="pending_checkout_session_id",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="workspacesubscription",
            name="pending_checkout_url",
            field=models.TextField(blank=True, default=""),
        ),
    ]
