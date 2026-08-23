"""Test helpers for kiosk launch readiness."""

from kiosk_builder.models import ensure_group_kiosk_settings


def configure_group_kiosk_for_launch(group, *, exit_code="1111", **settings_overrides):
    """
    Ensure a Group has valid KioskSettings for launch/identify/perform tests.
    """
    settings = ensure_group_kiosk_settings(group)
    for field, value in settings_overrides.items():
        setattr(settings, field, value)
    if exit_code:
        settings.set_exit_code(exit_code)
    settings.save()
    return settings
