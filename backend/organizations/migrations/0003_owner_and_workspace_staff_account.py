import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("organizations", "0002_remove_organizationmembership"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="owner",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="owned_organization",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.CreateModel(
            name="WorkspaceStaffAccount",
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
                ("username", models.CharField(max_length=150)),
                ("email", models.EmailField(blank=True, default="", max_length=254)),
                ("password", models.CharField(max_length=128)),
                (
                    "role",
                    models.CharField(
                        choices=[("admin", "Admin"), ("staff", "Staff")],
                        max_length=20,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[("active", "Active"), ("inactive", "Inactive")],
                        default="active",
                        max_length=20,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deactivated_at", models.DateTimeField(blank=True, null=True)),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="staff_accounts",
                        to="organizations.organization",
                    ),
                ),
            ],
            options={
                "ordering": ["organization_id", "username"],
                "indexes": [
                    models.Index(
                        fields=["organization", "status"],
                        name="organizatio_organiz_8a1d2e_idx",
                    )
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("organization", "username"),
                        name="unique_staff_username_per_organization",
                    ),
                    models.UniqueConstraint(
                        condition=models.Q(("email__gt", "")),
                        fields=("organization", "email"),
                        name="unique_staff_email_per_organization",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("role__in", ["admin", "staff"])),
                        name="organizations_staff_role_valid",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("status__in", ["active", "inactive"])),
                        name="organizations_staff_status_valid",
                    ),
                ],
            },
        ),
    ]
