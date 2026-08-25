from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0002_member_profile_cleanup"),
    ]

    operations = [
        migrations.AddField(
            model_name="member",
            name="plan_unlocked",
            field=models.BooleanField(db_index=True, default=True),
        ),
    ]
