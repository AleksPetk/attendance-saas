"""Add confirmation screen fields to KioskSettings and migrate legacy Group values."""

from django.db import migrations, models


def _map_return_seconds(raw):
    if raw in (1, 3, 5):
        return raw
    return 3


def migrate_legacy_confirmation(apps, schema_editor):
    KioskSettings = apps.get_model("kiosk_builder", "KioskSettings")
    for settings in KioskSettings.objects.select_related("group").iterator():
        group = settings.group
        changed = False

        if group.kiosk_success_message and not settings.confirmation_check_in_message:
            settings.confirmation_check_in_message = group.kiosk_success_message
            changed = True
        if group.kiosk_confirmation_message and not settings.confirmation_check_out_message:
            settings.confirmation_check_out_message = group.kiosk_confirmation_message
            changed = True

        mapped_delay = _map_return_seconds(group.kiosk_return_delay_seconds)
        if settings.confirmation_return_seconds != mapped_delay:
            settings.confirmation_return_seconds = mapped_delay
            changed = True

        if changed:
            settings.save(
                update_fields=[
                    "confirmation_check_in_message",
                    "confirmation_check_out_message",
                    "confirmation_return_seconds",
                ]
            )


class Migration(migrations.Migration):

    dependencies = [
        ("kiosk_builder", "0005_always_on_shell_footer_logo"),
    ]

    operations = [
        migrations.AddField(
            model_name="kiosksettings",
            name="confirmation_break_end_message",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="kiosksettings",
            name="confirmation_break_start_message",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="kiosksettings",
            name="confirmation_check_in_message",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="kiosksettings",
            name="confirmation_check_out_message",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="kiosksettings",
            name="confirmation_return_seconds",
            field=models.PositiveSmallIntegerField(default=3),
        ),
        migrations.AddField(
            model_name="kiosksettings",
            name="confirmation_template",
            field=models.CharField(
                choices=[
                    ("clean", "Clean"),
                    ("business", "Business"),
                    ("friendly", "Friendly"),
                    ("kids", "Kids"),
                    ("fitness", "Fitness"),
                    ("event", "Event"),
                    ("celebration", "Celebration"),
                    ("minimal", "Minimal"),
                ],
                default="clean",
                max_length=20,
            ),
        ),
        migrations.RunPython(migrate_legacy_confirmation, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="kiosksettings",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    (
                        "confirmation_template__in",
                        [
                            "clean",
                            "business",
                            "friendly",
                            "kids",
                            "fitness",
                            "event",
                            "celebration",
                            "minimal",
                        ],
                    )
                ),
                name="kiosk_settings_confirmation_template_valid",
            ),
        ),
        migrations.AddConstraint(
            model_name="kiosksettings",
            constraint=models.CheckConstraint(
                condition=models.Q(("confirmation_return_seconds__in", [1, 3, 5])),
                name="kiosk_settings_confirmation_return_seconds_valid",
            ),
        ),
    ]
