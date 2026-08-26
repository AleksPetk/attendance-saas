from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0002_provider_event"),
    ]

    operations = [
        migrations.AddField(
            model_name="workspacesubscription",
            name="pending_interval",
            field=models.CharField(
                blank=True,
                choices=[
                    ("none", "None"),
                    ("monthly", "Monthly"),
                    ("yearly", "Yearly"),
                ],
                default="",
                help_text="Scheduled destination billing interval. Applied only at effective_at.",
                max_length=20,
            ),
        ),
        migrations.RemoveConstraint(
            model_name="workspacesubscription",
            name="billing_workspacesubscription_pending_valid",
        ),
        migrations.AddConstraint(
            model_name="workspacesubscription",
            constraint=models.CheckConstraint(
                condition=models.Q(pending_plan="")
                | models.Q(
                    pending_plan__in=[
                        "plus",
                        "business",
                        "basic",
                    ]
                ),
                name="billing_workspacesubscription_pending_valid",
            ),
        ),
        migrations.AddConstraint(
            model_name="workspacesubscription",
            constraint=models.CheckConstraint(
                condition=models.Q(pending_interval="")
                | models.Q(pending_interval__in=["monthly", "yearly"]),
                name="billing_workspacesubscription_pending_interval_valid",
            ),
        ),
    ]
