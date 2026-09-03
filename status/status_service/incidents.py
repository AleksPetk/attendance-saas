"""Automatic public incidents. No raw technical details."""

from status_service.i18n import (
    auto_outage_summary,
    auto_outage_title,
    auto_recovery_message,
)
from status_service.locale import DEFAULT_LOCALE
from status_service.states import STATE_MAJOR_OUTAGE, STATE_OPERATIONAL


def public_outage_summary(component_id, locale=DEFAULT_LOCALE):
    return auto_outage_summary(component_id, locale)


def public_recovery_message(component_id, locale=DEFAULT_LOCALE):
    return auto_recovery_message(component_id, locale)


def sync_auto_incident(store, component_id, state, *, now=None):
    """Open one incident on sustained major outage; resolve on operational.

    Stored titles/summaries remain English (canonical). API responses localize
    auto-generated incidents at read time via auto_component_id.
    """
    active = store.active_auto_incident(component_id)
    if state == STATE_MAJOR_OUTAGE:
        if active is not None:
            return active["id"]
        summary = public_outage_summary(component_id, DEFAULT_LOCALE)
        return store.open_incident(
            title=auto_outage_title(component_id, DEFAULT_LOCALE),
            summary=summary,
            severity=STATE_MAJOR_OUTAGE,
            component_ids=[component_id],
            auto_component_id=component_id,
            now=now,
            message=summary,
        )
    if state == STATE_OPERATIONAL and active is not None:
        store.resolve_incident(
            active["id"],
            now=now,
            message=public_recovery_message(component_id, DEFAULT_LOCALE),
        )
        return active["id"]
    return None
