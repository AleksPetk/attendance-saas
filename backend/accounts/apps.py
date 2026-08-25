from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"
    verbose_name = "Customer Accounts"

    def ready(self):
        from accounts.two_factor_admin import install_platform_2fa

        install_platform_2fa()
