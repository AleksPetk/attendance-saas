# Generated manually for ActionRecord historical Class / group_type backfill.

from django.db import migrations


def backfill_group_type_snapshot(apps, schema_editor):
    """
    Fill group_type_snapshot from the live Group when still linked.

    Class fields are intentionally NOT backfilled from current membership:
    current Class can differ from Class-at-action-time, so inventing would
    corrupt historical Attendance Reports. Legacy Structured rows without
    Class snapshots display as "Unknown Class".
    """
    ActionRecord = apps.get_model("attendance", "ActionRecord")
    Group = apps.get_model("groups", "Group")
    group_types = dict(Group.objects.values_list("pk", "group_type"))
    to_update = []
    for record in ActionRecord.objects.filter(group_id__isnull=False).iterator():
        if record.group_type_snapshot:
            continue
        group_type = group_types.get(record.group_id)
        if not group_type:
            continue
        record.group_type_snapshot = group_type
        to_update.append(record)
        if len(to_update) >= 500:
            ActionRecord.objects.bulk_update(to_update, ["group_type_snapshot"])
            to_update = []
    if to_update:
        ActionRecord.objects.bulk_update(to_update, ["group_type_snapshot"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0005_actionrecord_class_snapshot"),
    ]

    operations = [
        migrations.RunPython(backfill_group_type_snapshot, noop_reverse),
    ]
