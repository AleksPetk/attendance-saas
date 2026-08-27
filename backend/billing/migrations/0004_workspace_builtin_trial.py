from django.db import migrations, models
import django.db.models.deletion


def backfill_existing_workspaces_ineligible(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    WorkspaceBuiltinTrial = apps.get_model("billing", "WorkspaceBuiltinTrial")
    existing_ids = set(
        WorkspaceBuiltinTrial.objects.values_list("organization_id", flat=True)
    )
    rows = []
    for org_id in Organization.objects.values_list("pk", flat=True):
        if org_id in existing_ids:
            continue
        rows.append(
            WorkspaceBuiltinTrial(
                organization_id=org_id,
                consumed=True,
                started_at=None,
                ends_at=None,
                expired_at=None,
            )
        )
    if rows:
        WorkspaceBuiltinTrial.objects.bulk_create(rows, batch_size=500)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0003_pending_interval"),
        ("organizations", "0012_checkstation_account_blocked_and_admin_audit"),
    ]

    operations = [
        migrations.CreateModel(
            name="WorkspaceBuiltinTrial",
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
                (
                    "started_at",
                    models.DateTimeField(
                        blank=True,
                        help_text="When Business entitlement was granted. Null if never granted.",
                        null=True,
                    ),
                ),
                (
                    "ends_at",
                    models.DateTimeField(
                        blank=True,
                        help_text="When built-in Business entitlement ends. Null if never granted.",
                        null=True,
                    ),
                ),
                (
                    "consumed",
                    models.BooleanField(
                        default=True,
                        help_text=(
                            "True after grant or ineligible backfill. "
                            "Never set back to False."
                        ),
                    ),
                ),
                (
                    "expired_at",
                    models.DateTimeField(
                        blank=True,
                        help_text=(
                            "When post-trial entitlement (Basic or paid) was applied."
                        ),
                        null=True,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "organization",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="builtin_trial",
                        to="organizations.organization",
                    ),
                ),
            ],
            options={
                "verbose_name": "Built-in Business trial",
                "verbose_name_plural": "Built-in Business trials",
            },
        ),
        migrations.AddConstraint(
            model_name="workspacebuiltintrial",
            constraint=models.CheckConstraint(
                condition=models.Q(("consumed", True)),
                name="billing_workspacebuiltintrial_consumed_once",
            ),
        ),
        migrations.AddConstraint(
            model_name="workspacebuiltintrial",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    models.Q(("ends_at__isnull", True), ("started_at__isnull", True)),
                    models.Q(
                        ("ends_at__gt", models.F("started_at")),
                        ("ends_at__isnull", False),
                        ("started_at__isnull", False),
                    ),
                    _connector="OR",
                ),
                name="billing_workspacebuiltintrial_window_valid",
            ),
        ),
        migrations.AddIndex(
            model_name="workspacebuiltintrial",
            index=models.Index(
                fields=["ends_at", "expired_at"],
                name="billing_wor_ends_at_b8e4a1_idx",
            ),
        ),
        migrations.RunPython(backfill_existing_workspaces_ineligible, noop),
    ]
