from django.db import migrations, models
from django.utils import timezone
import django.db.models.deletion


def mark_existing_workspaces_completed(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    TutorialState = apps.get_model("organizations", "WorkspaceTutorialState")
    migrated_at = timezone.now()
    rows = [
        TutorialState(
            organization_id=organization_id,
            tutorial_id="workspace-introduction",
            version=1,
            status="completed",
            completed_at=migrated_at,
        )
        for organization_id in Organization.objects.values_list("id", flat=True)
    ]
    TutorialState.objects.bulk_create(rows, batch_size=500, ignore_conflicts=True)


class Migration(migrations.Migration):
    dependencies = [("organizations", "0012_checkstation_account_blocked_and_admin_audit")]

    operations = [
        migrations.CreateModel(
            name="WorkspaceTutorialState",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("tutorial_id", models.CharField(default="workspace-introduction", max_length=80)),
                ("version", models.PositiveSmallIntegerField(default=1)),
                ("status", models.CharField(choices=[("not_started", "Not started"), ("in_progress", "In progress"), ("completed", "Completed"), ("skipped", "Skipped")], db_index=True, default="not_started", max_length=20)),
                ("last_module", models.CharField(blank=True, default="", max_length=80)),
                ("last_step", models.CharField(blank=True, default="", max_length=80)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("skipped_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="tutorial_state", to="organizations.organization")),
            ],
        ),
        migrations.AddConstraint(
            model_name="workspacetutorialstate",
            constraint=models.CheckConstraint(condition=models.Q(("status__in", ["not_started", "in_progress", "completed", "skipped"])), name="organizations_tutorial_status_valid"),
        ),
        migrations.RunPython(mark_existing_workspaces_completed, migrations.RunPython.noop),
    ]
