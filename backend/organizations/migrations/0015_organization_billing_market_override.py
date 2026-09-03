from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("organizations", "0014_workspacetutorialmodulecompletion"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="billing_market_override",
            field=models.CharField(
                choices=[
                    ("auto", "Auto"),
                    ("global", "Global"),
                    ("jp", "Japan"),
                ],
                db_index=True,
                default="auto",
                help_text=(
                    "Platform-admin billing market override. Auto currently resolves "
                    "to Global; customers cannot change this field."
                ),
                max_length=10,
            ),
        ),
        migrations.AddConstraint(
            model_name="organization",
            constraint=models.CheckConstraint(
                condition=models.Q(billing_market_override__in=["auto", "global", "jp"]),
                name="organizations_billing_market_override_valid",
            ),
        ),
    ]
