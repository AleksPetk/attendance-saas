from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [("organizations", "0013_workspace_tutorial_state")]

    operations = [
        migrations.CreateModel(
            name="WorkspaceTutorialModuleCompletion",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("module_id", models.SlugField(max_length=80)),
                ("completed_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="tutorial_module_completions",
                        to="organizations.organization",
                    ),
                ),
            ],
            options={"ordering": ("module_id",)},
        ),
        migrations.AddConstraint(
            model_name="workspacetutorialmodulecompletion",
            constraint=models.UniqueConstraint(
                fields=("organization", "module_id"),
                name="organizations_tutorial_module_completion_unique",
            ),
        ),
    ]
