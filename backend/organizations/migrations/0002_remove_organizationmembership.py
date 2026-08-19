from django.db import migrations


def wipe_legacy_membership_data(apps, schema_editor):
    """Local-only reset: membership rows cannot map to the new owner FK."""
    OrganizationMembership = apps.get_model("organizations", "OrganizationMembership")
    Organization = apps.get_model("organizations", "Organization")
    OrganizationMembership.objects.all().delete()
    Organization.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("organizations", "0001_initial_organization_and_membership"),
    ]

    operations = [
        migrations.RunPython(wipe_legacy_membership_data, migrations.RunPython.noop),
        migrations.DeleteModel(
            name="OrganizationMembership",
        ),
    ]
