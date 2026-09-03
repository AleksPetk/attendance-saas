"""Hash Class and participation PINs; remove plaintext storage."""

from django.contrib.auth.hashers import make_password
from django.db import migrations, models


def _looks_like_django_hash(value: str) -> bool:
    """Django hasher digests contain algorithm$ separators."""
    return bool(value) and "$" in value and len(value) > 20


def hash_plaintext_pins(apps, schema_editor):
    GroupSection = apps.get_model("groups", "GroupSection")
    GroupMembership = apps.get_model("groups", "GroupMembership")
    GroupOnlyParticipant = apps.get_model("groups", "GroupOnlyParticipant")

    for section in GroupSection.objects.exclude(class_pin="").iterator():
        raw = (section.class_pin or "").strip()
        if not raw:
            continue
        if _looks_like_django_hash(raw):
            section.class_pin_hash = raw
        else:
            section.class_pin_hash = make_password(raw)
        section.save(update_fields=["class_pin_hash"])

    for membership in GroupMembership.objects.all().iterator():
        plaintext = (membership.participation_pin or "").strip()
        legacy_hash = (membership.override_pin_hash or "").strip()
        if plaintext:
            if _looks_like_django_hash(plaintext):
                membership.participation_pin_hash = plaintext
            else:
                membership.participation_pin_hash = make_password(plaintext)
            membership.save(update_fields=["participation_pin_hash"])
        elif legacy_hash:
            membership.participation_pin_hash = legacy_hash
            membership.save(update_fields=["participation_pin_hash"])

    for participant in GroupOnlyParticipant.objects.all().iterator():
        plaintext = (participant.participation_pin or "").strip()
        if not plaintext:
            continue
        existing = (participant.pin_hash or "").strip()
        if existing:
            continue
        if _looks_like_django_hash(plaintext):
            participant.pin_hash = plaintext
        else:
            participant.pin_hash = make_password(plaintext)
        participant.save(update_fields=["pin_hash"])


def noop_reverse(apps, schema_editor):
    # Hashes are one-way; cannot restore plaintext.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("groups", "0015_group_plan_unlocked"),
    ]

    operations = [
        migrations.AddField(
            model_name="groupsection",
            name="class_pin_hash",
            field=models.CharField(
                blank=True,
                default="",
                help_text=(
                    "Django password hash of the Class PIN for Structured kiosk Class "
                    "entry when require_class_pin is enabled. Never store or return the "
                    "raw PIN."
                ),
                max_length=128,
            ),
        ),
        migrations.AddField(
            model_name="groupmembership",
            name="participation_pin_hash",
            field=models.CharField(
                blank=True,
                default="",
                help_text=(
                    "Django password hash of the Group participation PIN. "
                    "Never store or return the raw PIN."
                ),
                max_length=128,
            ),
        ),
        migrations.RunPython(hash_plaintext_pins, noop_reverse),
        migrations.RemoveField(
            model_name="groupsection",
            name="class_pin",
        ),
        migrations.RemoveField(
            model_name="groupmembership",
            name="participation_pin",
        ),
        migrations.RemoveField(
            model_name="groupmembership",
            name="override_pin_hash",
        ),
        migrations.RemoveField(
            model_name="grouponlyparticipant",
            name="participation_pin",
        ),
        migrations.AlterField(
            model_name="grouponlyparticipant",
            name="pin_hash",
            field=models.CharField(
                blank=True,
                default="",
                help_text=(
                    "Django password hash of the Group-only participant PIN. "
                    "Never store or return the raw PIN."
                ),
                max_length=128,
            ),
        ),
    ]
