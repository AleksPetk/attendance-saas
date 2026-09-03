from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0011_extend_promotional_text_styles"),
    ]

    operations = [
        migrations.AlterField(
            model_name="platformadminaction",
            name="action_type",
            field=models.CharField(
                choices=[
                    ("checkstation_account_on", "CheckStation Account ON"),
                    ("checkstation_account_off", "CheckStation Account OFF"),
                    ("checkstation_plan_change", "CheckStation plan change"),
                    ("billing_market_override_change", "Billing market override change"),
                    ("organization_block", "Block organization"),
                    ("organization_unblock", "Unblock organization"),
                    ("organization_permanent_delete", "Permanently delete organization"),
                    ("user_permanent_delete", "Permanently delete user"),
                ],
                db_index=True,
                max_length=64,
            ),
        ),
    ]
