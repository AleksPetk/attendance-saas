from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        (
            "organizations",
            "0010_organization_active_standard_groups_slots_resolved_and_more",
        ),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="members_slots_resolved",
            field=models.BooleanField(default=True),
        ),
    ]
