from collections import defaultdict

from django.db import migrations, models


def inspect_staff_email_data(apps, schema_editor):
    WorkspaceStaffAccount = apps.get_model("organizations", "WorkspaceStaffAccount")

    issues = []

    admins_without_email = WorkspaceStaffAccount.objects.filter(role="admin", email="")
    if admins_without_email.exists():
        issues.append(
            f"Found {admins_without_email.count()} workspace admin account(s) without email."
        )
        for account in admins_without_email[:20]:
            issues.append(
                f"  id={account.pk} organization_id={account.organization_id} "
                f"username={account.username!r}"
            )

    grouped = defaultdict(list)
    for account in WorkspaceStaffAccount.objects.exclude(email="").iterator():
        grouped[(account.organization_id, account.email.strip().lower())].append(account.pk)

    duplicate_groups = {key: ids for key, ids in grouped.items() if len(ids) > 1}
    if duplicate_groups:
        issues.append(
            f"Found {len(duplicate_groups)} duplicate non-empty email group(s) within workspaces."
        )
        for (organization_id, email), ids in list(duplicate_groups.items())[:20]:
            issues.append(
                f"  organization_id={organization_id} email={email!r} account_ids={ids}"
            )

    if issues:
        raise RuntimeError(
            "Cannot apply workspace staff email constraints until existing data is fixed:\n"
            + "\n".join(issues)
        )


class Migration(migrations.Migration):

    dependencies = [
        ("organizations", "0006_workspace_id_and_per_workspace_usernames"),
    ]

    operations = [
        migrations.RunPython(inspect_staff_email_data, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="workspacestaffaccount",
            constraint=models.CheckConstraint(
                condition=models.Q(("role", "staff"))
                | models.Q(("email__gt", "")),
                name="organizations_staff_admin_requires_email",
            ),
        ),
    ]
