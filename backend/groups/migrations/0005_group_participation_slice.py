import random

from django.db import migrations, models


def _assign_codes(model, apps, group_field="group"):
    Model = apps.get_model("groups", model)
    Group = apps.get_model("groups", "Group")
    for instance in Model.objects.filter(group_participant_code="").iterator():
        group = Group.objects.filter(pk=getattr(instance, f"{group_field}_id")).first()
        if not group:
            continue
        for _ in range(64):
            suffix = random.randint(1000, 9999)
            code = f"G{group.pk}-{suffix}"
            if not Model.objects.filter(
                **{f"{group_field}_id": group.pk},
                group_participant_code=code,
            ).exists():
                instance.group_participant_code = code
                instance.save(update_fields=["group_participant_code"])
                break


def backfill_participation_data(apps, schema_editor):
    GroupMembership = apps.get_model("groups", "GroupMembership")
    for membership in GroupMembership.objects.all().iterator():
        updates = []
        if not membership.participation_email and membership.override_email:
            membership.participation_email = membership.override_email.strip().lower()
            updates.append("participation_email")
        if updates:
            membership.save(update_fields=updates)
    _assign_codes("GroupMembership", apps)
    _assign_codes("GroupOnlyParticipant", apps)


class Migration(migrations.Migration):
    dependencies = [
        ("groups", "0004_group_product_cleanup"),
    ]

    operations = [
        migrations.AddField(
            model_name="groupmembership",
            name="group_participant_code",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddField(
            model_name="groupmembership",
            name="participation_email",
            field=models.EmailField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="groupmembership",
            name="participation_pin",
            field=models.CharField(blank=True, default="", max_length=12),
        ),
        migrations.AddField(
            model_name="grouponlyparticipant",
            name="group_participant_code",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddField(
            model_name="grouponlyparticipant",
            name="participation_pin",
            field=models.CharField(blank=True, default="", max_length=12),
        ),
        migrations.AddConstraint(
            model_name="groupmembership",
            constraint=models.UniqueConstraint(
                condition=models.Q(("group_participant_code", ""), _negated=True),
                fields=("group", "group_participant_code"),
                name="unique_group_membership_participant_code",
            ),
        ),
        migrations.AddConstraint(
            model_name="grouponlyparticipant",
            constraint=models.UniqueConstraint(
                condition=models.Q(("group_participant_code", ""), _negated=True),
                fields=("group", "group_participant_code"),
                name="unique_group_only_participant_code",
            ),
        ),
        migrations.AlterField(
            model_name="group",
            name="require_email",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "When enabled, every operational Group participant must have a "
                    "Group-specific participation email."
                ),
            ),
        ),
        migrations.AlterField(
            model_name="group",
            name="require_pin",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "When enabled, every operational Group participant must have a "
                    "Group-specific participation PIN (attendance check-in code)."
                ),
            ),
        ),
        migrations.RunPython(backfill_participation_data, migrations.RunPython.noop),
    ]
