from django.db import migrations, models
from django.db.models import F


def backfill_source_group_id(apps, schema_editor):
    ActionRecord = apps.get_model("attendance", "ActionRecord")
    ActionRecord.objects.filter(group_id__isnull=False, source_group_id__isnull=True).update(
        source_group_id=F("group_id")
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0003_group_product_cleanup"),
    ]

    operations = [
        migrations.AddField(
            model_name="actionrecord",
            name="source_group_id",
            field=models.PositiveIntegerField(
                blank=True,
                db_index=True,
                help_text=(
                    "Immutable Group primary key at record creation. Survives permanent "
                    "Group deletion so attendance reports can still select that Group."
                ),
                null=True,
            ),
        ),
        migrations.AddIndex(
            model_name="actionrecord",
            index=models.Index(
                fields=["organization", "source_group_id", "performed_at"],
                name="attendance__organiz_srcgrp_idx",
            ),
        ),
        migrations.RunPython(backfill_source_group_id, noop_reverse),
    ]
