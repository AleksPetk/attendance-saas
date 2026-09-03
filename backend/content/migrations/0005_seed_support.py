from django.db import migrations


def seed_support_and_privacy(apps, schema_editor):
    Document = apps.get_model("content", "Document")
    from content.seed import seed_documents, SEED_DIR

    seed_documents(overwrite=False, apps=apps)
    privacy = Document.objects.filter(slug="privacy-policy").first()
    if privacy is not None:
        privacy.body_markdown = (SEED_DIR / "privacy_policy.md").read_text(encoding="utf-8")
        privacy.version = "1.1"
        privacy.save(update_fields=["body_markdown", "version", "updated_at"])


def noop(apps, schema_editor):
    return


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0004_faq_groups_billing"),
    ]

    operations = [
        migrations.RunPython(seed_support_and_privacy, noop),
    ]
