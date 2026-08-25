from django.apps import AppConfig
from django.core import checks


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        from core.admin_branding import install_admin_branding
        from core.crypto import check_app_secrets_encryption_key

        install_admin_branding()
        checks.register(check_app_secrets_encryption_key, checks.Tags.security)
