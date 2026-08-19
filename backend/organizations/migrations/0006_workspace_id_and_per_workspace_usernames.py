import secrets

from django.db import migrations, models

WORKSPACE_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
WORKSPACE_ID_LENGTH = 6
WORKSPACE_ID_PATTERN = rf"^[{WORKSPACE_ID_ALPHABET}]{{{WORKSPACE_ID_LENGTH}}}$"


def generate_workspace_id():
    return "".join(
        secrets.choice(WORKSPACE_ID_ALPHABET) for _ in range(WORKSPACE_ID_LENGTH)
    )


def fill_workspace_ids(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    used = set(
        Organization.objects.exclude(workspace_id="")
        .values_list("workspace_id", flat=True)
    )
    for organization in Organization.objects.all():
        if organization.workspace_id:
            continue
        for _ in range(32):
            candidate = generate_workspace_id()
            if candidate not in used:
                organization.workspace_id = candidate
                organization.save(update_fields=["workspace_id"])
                used.add(candidate)
                break
        else:
            raise RuntimeError("Could not generate a unique Workspace ID.")


class Migration(migrations.Migration):

    dependencies = [
        ("organizations", "0005_unique_staff_username_global"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="workspace_id",
            field=models.CharField(default="", editable=False, max_length=6),
            preserve_default=False,
        ),
        migrations.RunPython(fill_workspace_ids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="organization",
            name="workspace_id",
            field=models.CharField(
                editable=False,
                help_text="System-generated immutable Workspace ID. Used for workspace staff/admin login, not by the paying owner.",
                max_length=6,
                unique=True,
            ),
        ),
        migrations.AddConstraint(
            model_name="organization",
            constraint=models.CheckConstraint(
                condition=models.Q(workspace_id__regex=WORKSPACE_ID_PATTERN),
                name="organizations_workspace_id_format",
            ),
        ),
        migrations.RenameField(
            model_name="organization",
            old_name="name",
            new_name="internal_label",
        ),
        migrations.AlterField(
            model_name="organization",
            name="internal_label",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Optional admin/support label. Not a customer-facing workspace name.",
                max_length=150,
            ),
        ),
        migrations.AlterModelOptions(
            name="organization",
            options={"ordering": ["workspace_id"]},
        ),
        migrations.AlterField(
            model_name="workspacestaffaccount",
            name="username",
            field=models.CharField(
                help_text="Login username unique within this workspace only.",
                max_length=150,
            ),
        ),
        migrations.AddConstraint(
            model_name="workspacestaffaccount",
            constraint=models.UniqueConstraint(
                fields=("organization", "username"),
                name="unique_staff_username_per_organization",
            ),
        ),
    ]
