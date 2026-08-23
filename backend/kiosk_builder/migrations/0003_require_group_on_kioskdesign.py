from django.db import migrations, models
import django.db.models.deletion


def delete_orphan_designs(apps, schema_editor):
    KioskDesign = apps.get_model("kiosk_builder", "KioskDesign")
    KioskDesign.objects.filter(group__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("kiosk_builder", "0002_migrate_existing_themes"),
    ]

    operations = [
        migrations.RunPython(delete_orphan_designs, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="kioskdesign",
            name="unique_kiosk_design_per_group",
        ),
        migrations.AlterField(
            model_name="kioskdesign",
            name="group",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="kiosk_design",
                to="groups.group",
            ),
        ),
    ]
