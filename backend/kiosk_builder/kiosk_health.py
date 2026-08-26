"""Read-only kiosk runtime health. Never touches customer attendance data."""

from django.urls import reverse

from attendance.models import ActionRecord
from kiosk_builder.config_schema import default_config
from kiosk_builder.kiosk_runtime import input_fields_payload, kiosk_mode_api_value
from kiosk_builder.kiosk_settings_constants import KioskType
from kiosk_builder.models import KioskDesign, KioskSettings


def check_kiosk_runtime_health():
    """
    Prove kiosk routes, tables, and helpers are usable without mutating data.

    Does not load a Group, lock a session, identify a participant, or write
    Action Records.
    """
    reverse("group-kiosk-start", kwargs={"group_pk": 1})
    reverse("group-kiosk-identify", kwargs={"group_pk": 1})
    reverse("group-kiosk-perform", kwargs={"group_pk": 1})
    reverse("group-kiosk-exit")
    reverse("group-kiosk-class-people", kwargs={"group_pk": 1, "section_pk": 1})
    reverse("group-kiosk-class-verify-pin", kwargs={"group_pk": 1, "section_pk": 1})

    # ORM existence queries: hit the tables, return no rows, create nothing.
    KioskSettings.objects.filter(pk=0).exists()
    KioskDesign.objects.filter(pk=0).exists()
    ActionRecord.objects.filter(pk=0).exists()

    unsaved = KioskSettings(mode=KioskType.CARD, input_field_count=1)
    kiosk_mode_api_value(unsaved)
    input_fields_payload(unsaved)
    default_config()
    return True
