# Generated manually for Apple IAP appAccountToken binding.

from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0010_purchase_source_google_and_provider_details"),
    ]

    operations = [
        migrations.AddField(
            model_name="workspacesubscription",
            name="apple_app_account_token",
            field=models.CharField(
                blank=True,
                db_index=True,
                default="",
                help_text=(
                    "Stable UUID used as StoreKit appAccountToken for this workspace. "
                    "Generated before the first Apple purchase."
                ),
                max_length=36,
            ),
        ),
        migrations.AddConstraint(
            model_name="workspacesubscription",
            constraint=models.UniqueConstraint(
                condition=~Q(apple_app_account_token=""),
                fields=("apple_app_account_token",),
                name="billing_ws_apple_app_account_token_uniq",
            ),
        ),
    ]
