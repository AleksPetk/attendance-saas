# Generated manually for Phase 1 three-provider billing foundation.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0009_workspace_checkout_attempt"),
        ("organizations", "0015_organization_billing_market_override"),
    ]

    operations = [
        migrations.CreateModel(
            name="AppleSubscriptionDetails",
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
                    "original_transaction_id",
                    models.CharField(blank=True, default="", max_length=255),
                ),
                ("product_id", models.CharField(blank=True, default="", max_length=255)),
                (
                    "environment",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("sandbox", "Sandbox"),
                            ("production", "Production"),
                        ],
                        default="",
                        max_length=20,
                    ),
                ),
                ("latest_expiration_at", models.DateTimeField(blank=True, null=True)),
                ("auto_renew", models.BooleanField(blank=True, null=True)),
                (
                    "app_account_token",
                    models.CharField(blank=True, default="", max_length=255),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Apple subscription details",
                "verbose_name_plural": "Apple subscription details",
            },
        ),
        migrations.CreateModel(
            name="GoogleSubscriptionDetails",
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
                    "purchase_token",
                    models.CharField(blank=True, default="", max_length=512),
                ),
                ("product_id", models.CharField(blank=True, default="", max_length=255)),
                (
                    "base_plan_id",
                    models.CharField(blank=True, default="", max_length=255),
                ),
                (
                    "package_name",
                    models.CharField(blank=True, default="", max_length=255),
                ),
                ("latest_expiration_at", models.DateTimeField(blank=True, null=True)),
                ("auto_renew", models.BooleanField(blank=True, null=True)),
                (
                    "linked_purchase_token",
                    models.CharField(blank=True, default="", max_length=512),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Google subscription details",
                "verbose_name_plural": "Google subscription details",
            },
        ),
        migrations.RemoveConstraint(
            model_name="workspacesubscription",
            name="billing_workspacesubscription_source_valid",
        ),
        migrations.AlterField(
            model_name="providerevent",
            name="provider",
            field=models.CharField(
                choices=[
                    ("stripe", "Stripe"),
                    ("apple", "Apple"),
                    ("google", "Google"),
                ],
                default="stripe",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="workspacesubscription",
            name="purchase_source",
            field=models.CharField(
                choices=[
                    ("none", "None"),
                    ("stripe", "Stripe"),
                    ("apple", "Apple"),
                    ("google", "Google"),
                ],
                db_index=True,
                default="none",
                max_length=20,
            ),
        ),
        migrations.AddConstraint(
            model_name="providerevent",
            constraint=models.CheckConstraint(
                condition=models.Q(("provider__in", ["stripe", "apple", "google"])),
                name="billing_providerevent_provider_valid",
            ),
        ),
        migrations.AddConstraint(
            model_name="workspacesubscription",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("purchase_source__in", ["none", "stripe", "apple", "google"])
                ),
                name="billing_workspacesubscription_source_valid",
            ),
        ),
        migrations.AddField(
            model_name="applesubscriptiondetails",
            name="billing",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="apple_details",
                to="billing.workspacesubscription",
            ),
        ),
        migrations.AddField(
            model_name="googlesubscriptiondetails",
            name="billing",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="google_details",
                to="billing.workspacesubscription",
            ),
        ),
        migrations.AddIndex(
            model_name="applesubscriptiondetails",
            index=models.Index(
                fields=["app_account_token"], name="billing_app_app_acc_730697_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="applesubscriptiondetails",
            index=models.Index(
                fields=["product_id"], name="billing_app_product_dabc65_idx"
            ),
        ),
        migrations.AddConstraint(
            model_name="applesubscriptiondetails",
            constraint=models.UniqueConstraint(
                condition=models.Q(("original_transaction_id", ""), _negated=True),
                fields=("original_transaction_id",),
                name="billing_apple_details_original_txn_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="applesubscriptiondetails",
            constraint=models.CheckConstraint(
                condition=models.Q(("environment", ""))
                | models.Q(("environment__in", ["sandbox", "production"])),
                name="billing_apple_details_environment_valid",
            ),
        ),
        migrations.AddIndex(
            model_name="googlesubscriptiondetails",
            index=models.Index(
                fields=["product_id"], name="billing_goo_product_5254b6_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="googlesubscriptiondetails",
            index=models.Index(
                fields=["package_name"], name="billing_goo_package_08ee08_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="googlesubscriptiondetails",
            index=models.Index(
                fields=["linked_purchase_token"],
                name="billing_goo_linked__a0ca46_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="googlesubscriptiondetails",
            constraint=models.UniqueConstraint(
                condition=models.Q(("purchase_token", ""), _negated=True),
                fields=("purchase_token",),
                name="billing_google_details_purchase_token_uniq",
            ),
        ),
    ]
