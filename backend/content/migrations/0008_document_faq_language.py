import logging

from django.db import migrations, models

logger = logging.getLogger(__name__)

DEFAULT_LOCALE = "en"


def forwards_set_language(apps, schema_editor):
    Document = apps.get_model("content", "Document")
    FaqEntry = apps.get_model("content", "FaqEntry")
    Document.objects.filter(language="").update(language=DEFAULT_LOCALE)
    FaqEntry.objects.filter(language="").update(language=DEFAULT_LOCALE)


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0007_replace_legacy_checkstation_email_domains"),
    ]

    operations = [
        migrations.AddField(
            model_name="document",
            name="language",
            field=models.CharField(
                choices=[("en", "English"), ("ja", "Japanese")],
                db_index=True,
                default="en",
                max_length=5,
            ),
        ),
        migrations.AddField(
            model_name="faqentry",
            name="language",
            field=models.CharField(
                choices=[("en", "English"), ("ja", "Japanese")],
                db_index=True,
                default="en",
                max_length=5,
            ),
        ),
        migrations.RunPython(forwards_set_language, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="document",
            name="slug",
            field=models.SlugField(
                help_text="Stable public identifier, for example privacy-policy.",
                max_length=80,
            ),
        ),
        migrations.AlterField(
            model_name="faqentry",
            name="slug",
            field=models.SlugField(
                help_text="Stable public identifier, for example what-is-a-member.",
                max_length=80,
            ),
        ),
        migrations.AddConstraint(
            model_name="document",
            constraint=models.UniqueConstraint(
                fields=("slug", "language"),
                name="document_slug_language_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="faqentry",
            constraint=models.UniqueConstraint(
                fields=("slug", "language"),
                name="faqentry_slug_language_uniq",
            ),
        ),
    ]
