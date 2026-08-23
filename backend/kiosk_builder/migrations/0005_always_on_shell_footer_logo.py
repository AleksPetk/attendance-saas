# Generated manually for always-on Header/Main/Footer + footer_logo.

from django.db import migrations, models

import kiosk_builder.models


class Migration(migrations.Migration):

    dependencies = [
        ("kiosk_builder", "0004_kiosk_settings"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="kiosksettings",
            name="header_enabled",
        ),
        migrations.RemoveField(
            model_name="kiosksettings",
            name="footer_enabled",
        ),
        migrations.AddField(
            model_name="kioskdesign",
            name="footer_logo",
            field=models.ImageField(
                blank=True,
                upload_to=kiosk_builder.models.kiosk_footer_logo_upload_to,
            ),
        ),
    ]
