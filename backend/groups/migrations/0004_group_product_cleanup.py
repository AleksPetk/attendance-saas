# Generated manually for Group product cleanup.

from django.db import migrations, models


def _member_list_allowed(check_in, check_out, breaks_enabled):
    if breaks_enabled:
        return False
    return (check_in and not check_out) or (check_out and not check_in)


def normalize_group_product_state(apps, schema_editor):
    from kiosk_builder.config_schema import (
        default_config_for_classic,
        default_config_for_modern,
    )

    Group = apps.get_model("groups", "Group")
    KioskDesign = apps.get_model("kiosk_builder", "KioskDesign")
    for group in Group.objects.all():
        changed = []
        if group.max_breaks is not None:
            if group.max_breaks < 1:
                group.max_breaks = 1
                changed.append("max_breaks")
            elif group.max_breaks > 3:
                group.max_breaks = 3
                changed.append("max_breaks")
        if group.breaks_enabled and group.max_breaks not in (1, 2, 3):
            group.max_breaks = 1
            changed.append("max_breaks")
        if group.kiosk_mode == "member_list" and not _member_list_allowed(
            group.check_in_enabled,
            group.check_out_enabled,
            group.breaks_enabled,
        ):
            group.kiosk_mode = "input"
            changed.append("kiosk_mode")
        if changed:
            group.save(update_fields=list(dict.fromkeys(changed)))
        if not KioskDesign.objects.filter(group_id=group.pk).exists():
            title = group.kiosk_title or group.name or ""
            theme = getattr(group, "kiosk_theme", "classic") or "classic"
            config = (
                default_config_for_modern(title)
                if theme == "modern"
                else default_config_for_classic(title)
            )
            KioskDesign.objects.create(
                organization_id=group.organization_id,
                group_id=group.pk,
                config=config,
            )


def noop_reverse(apps, schema_editor):
    return None


class Migration(migrations.Migration):

    dependencies = [
        ("groups", "0003_group_kiosk_confirmation_message_group_kiosk_enabled_and_more"),
        ("kiosk_builder", "0003_require_group_on_kioskdesign"),
    ]

    operations = [
        migrations.RunPython(normalize_group_product_state, noop_reverse),
        migrations.RemoveConstraint(
            model_name="group",
            name="groups_max_breaks_required_when_enabled",
        ),
        migrations.RemoveConstraint(
            model_name="group",
            name="groups_kiosk_mode_valid",
        ),
        migrations.RemoveField(
            model_name="group",
            name="kiosk_enabled",
        ),
        migrations.AlterField(
            model_name="group",
            name="require_email",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Deprecated compatibility field. Not a Group basic setting. "
                    "Kept until kiosk/participation identification is redesigned."
                ),
            ),
        ),
        migrations.AlterField(
            model_name="group",
            name="require_photo",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Deprecated compatibility field. Not a Group basic setting. "
                    "Kept until kiosk/participation identification is redesigned."
                ),
            ),
        ),
        migrations.AlterField(
            model_name="group",
            name="require_check_in_identifier",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Deprecated compatibility field. Not a Group basic setting. "
                    "Kept until kiosk/participation identification is redesigned."
                ),
            ),
        ),
        migrations.AlterField(
            model_name="group",
            name="require_pin",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Deprecated compatibility field used by current kiosk PIN checks. "
                    "Not a Group basic setting. Kept until kiosk identification is redesigned."
                ),
            ),
        ),
        migrations.AddConstraint(
            model_name="group",
            constraint=models.CheckConstraint(
                condition=models.Q(("breaks_enabled", False))
                | models.Q(("max_breaks__in", [1, 2, 3])),
                name="groups_max_breaks_required_when_enabled",
            ),
        ),
        migrations.AddConstraint(
            model_name="group",
            constraint=models.CheckConstraint(
                condition=models.Q(("kiosk_mode__in", ["member_list", "input"])),
                name="groups_kiosk_mode_valid",
            ),
        ),
    ]
