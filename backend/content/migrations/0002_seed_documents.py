from django.db import migrations


def seed_canonical_documents(apps, schema_editor):
    from content.seed import seed_documents

    seed_documents(overwrite=False)


def noop(apps, schema_editor):
    return


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0001_initial_document"),
    ]

    operations = [
        migrations.RunPython(seed_canonical_documents, noop),
    ]
