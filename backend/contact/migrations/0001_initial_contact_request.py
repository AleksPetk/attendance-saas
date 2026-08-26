from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="ContactRequest",
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
                ("public_ref", models.CharField(db_index=True, max_length=16, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("category_id", models.CharField(max_length=40)),
                ("subcategory_id", models.CharField(max_length=40)),
                ("category_label", models.CharField(max_length=80)),
                ("subcategory_label", models.CharField(max_length=80)),
                ("email", models.EmailField(max_length=254)),
                ("name", models.CharField(blank=True, max_length=80)),
                ("subject", models.CharField(max_length=120)),
                ("message", models.TextField()),
                (
                    "client_type",
                    models.CharField(
                        choices=[
                            ("public_web", "Public website"),
                            ("workspace_web", "Workspace"),
                            ("ios", "iOS"),
                            ("android", "Android"),
                            ("desktop", "Desktop"),
                        ],
                        default="public_web",
                        max_length=20,
                    ),
                ),
                ("page_path", models.CharField(blank=True, max_length=200)),
                ("locale", models.CharField(blank=True, max_length=16)),
                ("is_privacy_request", models.BooleanField(db_index=True, default=False)),
                (
                    "delivery_status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("sent", "Sent"),
                            ("failed", "Failed"),
                        ],
                        db_index=True,
                        default="pending",
                        max_length=16,
                    ),
                ),
                ("delivered_at", models.DateTimeField(blank=True, null=True)),
                ("delivery_error_code", models.CharField(blank=True, max_length=40)),
                (
                    "review_status",
                    models.CharField(
                        choices=[
                            ("new", "New"),
                            ("reviewed", "Reviewed"),
                            ("closed", "Closed"),
                        ],
                        db_index=True,
                        default="new",
                        max_length=16,
                    ),
                ),
            ],
            options={
                "verbose_name": "Contact request",
                "verbose_name_plural": "Contact requests",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddIndex(
            model_name="contactrequest",
            index=models.Index(
                fields=["category_id", "subcategory_id"],
                name="contact_con_categor_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="contactrequest",
            index=models.Index(fields=["email"], name="contact_con_email_idx"),
        ),
    ]
