from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("billing", "0004_workspace_builtin_trial")]

    operations = [
        migrations.AlterField(
            model_name="workspacesubscription",
            name="currency",
            field=models.CharField(
                default="usd",
                help_text="Provider billing currency (usd or jpy), stored lowercase.",
                max_length=3,
            ),
        ),
    ]
