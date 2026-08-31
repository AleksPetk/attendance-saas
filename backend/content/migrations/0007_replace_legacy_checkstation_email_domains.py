from django.db import migrations
from django.db.models import Q
from django.utils import timezone


LEGACY_PERSONAL_DOMAIN = "aleks" + "petk.com"
LEGACY_CONTACT = f"contact@checkstation.{LEGACY_PERSONAL_DOMAIN}"
CURRENT_CONTACT = "contact@checkstation.app"
LEGACY_ACCOUNTS = f"accounts@checkstation.{LEGACY_PERSONAL_DOMAIN}"
CURRENT_ACCOUNTS = "accounts@checkstation.app"


def replace_legacy_email_domains(apps, schema_editor):
    Document = apps.get_model("content", "Document")
    documents = Document.objects.filter(
        Q(body_markdown__contains=LEGACY_CONTACT)
        | Q(body_markdown__contains=LEGACY_ACCOUNTS)
    ).only("pk", "body_markdown")
    changed_at = timezone.now()
    for document in documents.iterator():
        updated_body = document.body_markdown.replace(
            LEGACY_CONTACT,
            CURRENT_CONTACT,
        ).replace(
            LEGACY_ACCOUNTS,
            CURRENT_ACCOUNTS,
        )
        if updated_body != document.body_markdown:
            Document.objects.filter(pk=document.pk).update(
                body_markdown=updated_body,
                updated_at=changed_at,
            )


class Migration(migrations.Migration):
    dependencies = [("content", "0006_announcements")]

    operations = [
        migrations.RunPython(
            replace_legacy_email_domains,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
