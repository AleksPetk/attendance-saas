from django.db import migrations


def seed_getting_started_and_kiosk_setup(apps, schema_editor):
    Document = apps.get_model("content", "Document")
    from content.seed import SEED_DIR, seed_documents

    seed_documents(overwrite=False, apps=apps)
    home = Document.objects.filter(slug="documentation").first()
    if home is not None:
        home.body_markdown = (SEED_DIR / "documentation.md").read_text(encoding="utf-8")
        home.version = "1.1"
        home.save(update_fields=["body_markdown", "version"])


def noop(apps, schema_editor):
    return


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0002_seed_documents"),
    ]

    operations = [
        migrations.RunPython(seed_getting_started_and_kiosk_setup, noop),
    ]
