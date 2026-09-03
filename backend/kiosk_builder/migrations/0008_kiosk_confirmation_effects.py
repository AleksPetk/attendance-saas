from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("kiosk_builder", "0007_attendance_reset"),
    ]

    operations = [
        migrations.AddField(
            model_name="kiosksettings",
            name="confirmation_sound_enabled",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="kiosksettings",
            name="confirmation_vibration_enabled",
            field=models.BooleanField(default=False),
        ),
    ]
