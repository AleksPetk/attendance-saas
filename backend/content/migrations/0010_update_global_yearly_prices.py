from django.db import migrations
from django.utils import timezone


DOCUMENT_REPLACEMENTS = {
    "terms-of-use": (
        ("$99.90", "$99.99"),
        ("$149.90", "$149.99"),
        (
            "Yearly prices equal ten times the monthly list price.",
            "Yearly prices provide approximately two months of savings compared "
            "with paying monthly for 12 months.",
        ),
        (
            "年額価格は月額リスト価格の 10 倍。",
            "年額価格は、月額で 12 か月支払う場合と比べて約 2 か月分お得です。",
        ),
    ),
    "billing-plans": (
        (
            "Yearly list price is **10 × monthly** (two months effectively "
            "included in the annual price).",
            "Yearly list pricing provides approximately two months of savings "
            "compared with paying monthly for 12 months.",
        ),
        (
            "年額リスト価格は **月額 × 10**（実質 2 か月分が年額に含まれる）。",
            "年額リスト価格は、月額で 12 か月支払う場合と比べて約 2 か月分お得です。",
        ),
    ),
}

FAQ_REPLACEMENTS = (
    (
        "Yearly is 10 × monthly.",
        "Yearly pricing saves approximately two months compared with paying "
        "monthly for 12 months.",
    ),
    (
        "年額は月額 × 10。",
        "年額は月額で 12 か月支払う場合と比べて約 2 か月分お得。",
    ),
)


def update_global_yearly_prices(apps, schema_editor):
    Document = apps.get_model("content", "Document")
    FaqEntry = apps.get_model("content", "FaqEntry")
    changed_at = timezone.now()

    for document in Document.objects.filter(slug__in=DOCUMENT_REPLACEMENTS).iterator():
        body = document.body_markdown
        for old, new in DOCUMENT_REPLACEMENTS[document.slug]:
            body = body.replace(old, new)
        if body != document.body_markdown:
            Document.objects.filter(pk=document.pk).update(
                body_markdown=body,
                updated_at=changed_at,
            )

    for entry in FaqEntry.objects.filter(slug="current-plan-prices").iterator():
        answer = entry.answer_markdown
        for old, new in FAQ_REPLACEMENTS:
            answer = answer.replace(old, new)
        if answer != entry.answer_markdown:
            FaqEntry.objects.filter(pk=entry.pk).update(
                answer_markdown=answer,
                updated_at=changed_at,
            )


class Migration(migrations.Migration):
    dependencies = [("content", "0009_seed_japanese_content")]

    operations = [
        migrations.RunPython(
            update_global_yearly_prices,
            reverse_code=migrations.RunPython.noop,
        )
    ]
