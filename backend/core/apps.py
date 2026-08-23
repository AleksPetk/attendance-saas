from django.apps import AppConfig
from django.core import checks


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        from core.crypto import check_app_secrets_encryption_key

        checks.register(check_app_secrets_encryption_key, checks.Tags.security)
