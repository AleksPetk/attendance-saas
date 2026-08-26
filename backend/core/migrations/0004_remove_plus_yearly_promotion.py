from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0003_promotion_groups"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="platformpromotionsettings",
            name="plus_yearly_enabled",
        ),
        migrations.AlterField(
            model_name="platformpromotionmodechange",
            name="group",
            field=models.CharField(
                choices=[
                    ("new_basic", "New / Basic"),
                    ("plus_monthly", "Plus Monthly"),
                    ("business_monthly", "Business Monthly"),
                    ("plus_yearly", "Plus Yearly (retired)"),
                ],
                default="new_basic",
                max_length=32,
            ),
        ),
    ]
