# Generated manually for removing platform advertising settings.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0014_alter_platformpromotionmodechange_new_value_and_more"),
    ]

    operations = [
        migrations.DeleteModel(
            name="PlatformAdvertisingSettings",
        ),
    ]
