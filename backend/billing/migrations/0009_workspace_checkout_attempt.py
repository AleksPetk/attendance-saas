from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0008_pending_checkout_session"),
        ("organizations", "0015_organization_billing_market_override"),
    ]

    operations = [
        migrations.CreateModel(
            name="WorkspaceCheckoutAttempt",
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
                ("attempt_id", models.UUIDField(editable=False, unique=True)),
                (
                    "idempotency_key",
                    models.CharField(editable=False, max_length=255, unique=True),
                ),
                ("plan_key", models.CharField(max_length=20)),
                ("interval", models.CharField(max_length=20)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Claimed; Stripe result not persisted"),
                            ("open", "Stripe Checkout Session open"),
                            ("completed", "Stripe Checkout Session completed"),
                            ("expired", "Stripe Checkout Session expired"),
                            ("replaced", "Superseded by a newer attempt"),
                        ],
                        db_index=True,
                        default="pending",
                        max_length=20,
                    ),
                ),
                (
                    "stripe_session_id",
                    models.CharField(blank=True, default="", max_length=255),
                ),
                ("checkout_url", models.TextField(blank=True, default="")),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="checkout_attempts",
                        to="organizations.organization",
                    ),
                ),
            ],
            options={
                "verbose_name": "Workspace checkout attempt",
                "verbose_name_plural": "Workspace checkout attempts",
            },
        ),
        migrations.AddConstraint(
            model_name="workspacecheckoutattempt",
            constraint=models.UniqueConstraint(
                condition=models.Q(("status__in", ["pending", "open"])),
                fields=("organization",),
                name="billing_one_active_checkout_attempt",
            ),
        ),
        migrations.AddConstraint(
            model_name="workspacecheckoutattempt",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    (
                        "status__in",
                        ["pending", "open", "completed", "expired", "replaced"],
                    )
                ),
                name="billing_checkoutattempt_status_valid",
            ),
        ),
        migrations.AddIndex(
            model_name="workspacecheckoutattempt",
            index=models.Index(
                fields=["organization", "status"],
                name="billing_co_org_status_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="workspacecheckoutattempt",
            index=models.Index(
                fields=["stripe_session_id"],
                name="billing_co_session_idx",
            ),
        ),
        migrations.RemoveField(
            model_name="workspacesubscription",
            name="pending_checkout_expires_at",
        ),
        migrations.RemoveField(
            model_name="workspacesubscription",
            name="pending_checkout_idempotency_key",
        ),
        migrations.RemoveField(
            model_name="workspacesubscription",
            name="pending_checkout_interval",
        ),
        migrations.RemoveField(
            model_name="workspacesubscription",
            name="pending_checkout_plan",
        ),
        migrations.RemoveField(
            model_name="workspacesubscription",
            name="pending_checkout_session_id",
        ),
        migrations.RemoveField(
            model_name="workspacesubscription",
            name="pending_checkout_url",
        ),
    ]
