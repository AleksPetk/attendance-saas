# Generated manually for Group product cleanup history preservation.

import django.db.models.deletion
from django.db import migrations, models


def fill_group_name_snapshots(apps, schema_editor):
    ActionRecord = apps.get_model("attendance", "ActionRecord")
    for record in ActionRecord.objects.select_related("group").iterator():
        if record.group_name_snapshot:
            continue
        name = record.group.name if record.group_id else ""
        if name:
            ActionRecord.objects.filter(pk=record.pk).update(group_name_snapshot=name)


def noop_reverse(apps, schema_editor):
    return None


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0002_member_archive_permanent_delete"),
        ("groups", "0004_group_product_cleanup"),
    ]

    operations = [
        migrations.AddField(
            model_name="actionrecord",
            name="group_name_snapshot",
            field=models.CharField(blank=True, default="", max_length=150),
        ),
        migrations.AlterField(
            model_name="actionrecord",
            name="group",
            field=models.ForeignKey(
                blank=True,
                help_text=(
                    "Live Group link. SET_NULL when a Group is permanently deleted "
                    "so snapshot fields remain the historical identity."
                ),
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="action_records",
                to="groups.group",
            ),
        ),
        migrations.AlterField(
            model_name="actionrecord",
            name="group_only_participant",
            field=models.ForeignKey(
                blank=True,
                help_text=(
                    "Live Group-only participant link. SET_NULL when that person is "
                    "removed with a permanently deleted Group."
                ),
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="action_records",
                to="groups.grouponlyparticipant",
            ),
        ),
        migrations.RunPython(fill_group_name_snapshots, noop_reverse),
    ]
