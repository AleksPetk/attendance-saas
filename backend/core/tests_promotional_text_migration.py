from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class PromotionalTextMarketMigrationTests(TransactionTestCase):
    migrate_from = [("core", "0012_platform_admin_billing_market_action")]
    migrate_to = [("core", "0013_market_aware_promotional_text")]

    def setUp(self):
        super().setUp()
        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_from)
        old_apps = executor.loader.project_state(self.migrate_from).apps
        settings_model = old_apps.get_model("core", "PlatformPromotionalTextSettings")
        settings_obj, _created = settings_model.objects.get_or_create(pk=1)
        settings_obj.enabled = True
        settings_obj.text = "Existing shared campaign"
        settings_obj.text_style = "dark_fantasy"
        settings_obj.save()

        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_to)
        self.apps = executor.loader.project_state(self.migrate_to).apps

    def tearDown(self):
        MigrationExecutor(connection).migrate(self.migrate_to)
        super().tearDown()

    def test_existing_shared_configuration_becomes_together_without_data_loss(self):
        settings_model = self.apps.get_model("core", "PlatformPromotionalTextSettings")
        settings_obj = settings_model.objects.get(pk=1)
        self.assertEqual(settings_obj.mode, "together")
        self.assertTrue(settings_obj.enabled)
        self.assertEqual(settings_obj.text, "Existing shared campaign")
        self.assertEqual(settings_obj.text_style, "dark_fantasy")
