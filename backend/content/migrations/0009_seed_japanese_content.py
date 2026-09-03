"""Seed Japanese docs and FAQ after language field migration."""

from django.db import migrations

from content.seed import seed_documents, seed_faq_entries


def forwards_seed_japanese(apps, schema_editor):
    seed_documents(languages=("ja",), apps=apps)
    seed_faq_entries(languages=("ja",), apps=apps)


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0008_document_faq_language"),
    ]

    operations = [
        migrations.RunPython(forwards_seed_japanese, migrations.RunPython.noop),
    ]
