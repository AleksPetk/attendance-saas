from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0011_workspace_apple_app_account_token"),
    ]

    operations = [
        migrations.AddField(
            model_name="workspacecheckoutattempt",
            name="coupon_id",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="workspacecheckoutattempt",
            name="market",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
    ]
