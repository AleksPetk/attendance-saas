# Generated manually for Phase 4 webhook claim + webhook lookup indexes.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0005_workspace_subscription_currency_help"),
    ]

    operations = [
        migrations.AddField(
            model_name="providerevent",
            name="processing_started_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="providerevent",
            name="status",
            field=models.CharField(
                choices=[
                    ("received", "Received"),
                    ("processing", "Processing"),
                    ("processed", "Processed"),
                    ("ignored", "Ignored"),
                    ("failed", "Failed"),
                ],
                default="received",
                max_length=20,
            ),
        ),
        migrations.AddIndex(
            model_name="workspacesubscription",
            index=models.Index(
                fields=["external_customer_id"],
                name="billing_ws_ext_cust_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="workspacesubscription",
            index=models.Index(
                fields=["external_subscription_id"],
                name="billing_ws_ext_sub_idx",
            ),
        ),
    ]
