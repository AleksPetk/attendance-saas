from django.db import migrations, models


def seed_groups_billing_faq(apps, schema_editor):
    from content.models import Document
    from content.seed import SEED_DIR, seed_documents, seed_faq_entries

    seed_documents(overwrite=False)
    seed_faq_entries(overwrite=False)

    home = Document.objects.filter(slug="documentation").first()
    if home is not None:
        home.body_markdown = (SEED_DIR / "documentation.md").read_text(encoding="utf-8")
        home.version = "1.2"
        home.save(update_fields=["body_markdown", "version"])

    for slug, filename, version in (
        ("getting-started", "getting_started.md", "1.1"),
        ("kiosk-setup", "kiosk_setup.md", "1.1"),
    ):
        doc = Document.objects.filter(slug=slug).first()
        if doc is None:
            continue
        body = (SEED_DIR / filename).read_text(encoding="utf-8")
        if "/groups-members" in (doc.body_markdown or "") and doc.body_markdown == body:
            continue
        if "not published yet" in (doc.body_markdown or "") or "/groups-members" not in (
            doc.body_markdown or ""
        ):
            doc.body_markdown = body
            doc.version = version
            doc.save(update_fields=["body_markdown", "version"])


def noop(apps, schema_editor):
    return


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0003_seed_getting_started_kiosk_setup"),
    ]

    operations = [
        migrations.CreateModel(
            name="FaqEntry",
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
                    "slug",
                    models.SlugField(
                        help_text="Stable public identifier, for example what-is-a-member.",
                        max_length=80,
                        unique=True,
                    ),
                ),
                ("question", models.CharField(max_length=240)),
                (
                    "answer_markdown",
                    models.TextField(
                        help_text="Canonical Markdown answer. Do not store raw HTML as the source.",
                    ),
                ),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("getting_started", "Getting Started"),
                            ("account_security", "Account & Security"),
                            ("members_groups", "Members & Groups"),
                            ("kiosk", "Kiosk"),
                            ("attendance", "Attendance & History"),
                            ("email", "Email & Notifications"),
                            ("staff", "Staff & Permissions"),
                            ("plans", "Plans & Billing"),
                            ("subscription_changes", "Subscription Changes"),
                            ("troubleshooting", "Troubleshooting"),
                            ("privacy", "Privacy & Data"),
                            ("general", "General"),
                        ],
                        db_index=True,
                        default="general",
                        max_length=32,
                    ),
                ),
                (
                    "keywords",
                    models.CharField(
                        blank=True,
                        help_text="Comma-separated search aliases, for example pin, exit code.",
                        max_length=400,
                    ),
                ),
                (
                    "related_document_slug",
                    models.SlugField(
                        blank=True,
                        help_text="Optional Docs slug such as kiosk-setup.",
                        max_length=80,
                    ),
                ),
                (
                    "featured",
                    models.BooleanField(
                        default=False,
                        help_text="Show among common questions when useful.",
                    ),
                ),
                ("sort_order", models.PositiveIntegerField(default=100)),
                (
                    "status",
                    models.CharField(
                        choices=[("draft", "Draft"), ("published", "Published")],
                        db_index=True,
                        default="draft",
                        max_length=16,
                    ),
                ),
                (
                    "is_public",
                    models.BooleanField(
                        default=True,
                        help_text="If off, the entry is never returned by the public API.",
                    ),
                ),
                ("published_at", models.DateTimeField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "admin_notes",
                    models.TextField(
                        blank=True,
                        help_text="Internal review notes. Never exposed by the public API.",
                    ),
                ),
            ],
            options={
                "verbose_name": "FAQ entry",
                "verbose_name_plural": "FAQ entries",
                "ordering": ("category", "sort_order", "question"),
            },
        ),
        migrations.RunPython(seed_groups_billing_faq, noop),
    ]
