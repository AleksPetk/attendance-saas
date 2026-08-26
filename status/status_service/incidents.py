"""Automatic public incidents. No raw technical details."""

from status_service.components import COMPONENT_BY_ID
from status_service.states import STATE_MAJOR_OUTAGE, STATE_OPERATIONAL


def public_outage_summary(component_id):
    name = COMPONENT_BY_ID.get(component_id, {}).get("name", "a CheckStation service")
    return f"We're investigating an issue affecting {name}."


def public_recovery_message(component_id):
    name = COMPONENT_BY_ID.get(component_id, {}).get("name", "This service")
    return f"{name} has recovered."


def sync_auto_incident(store, component_id, state, *, now=None):
    """Open one incident on sustained major outage; resolve on operational."""
    name = COMPONENT_BY_ID.get(component_id, {}).get("name", "Service")
    active = store.active_auto_incident(component_id)
    if state == STATE_MAJOR_OUTAGE:
        if active is not None:
            return active["id"]
        summary = public_outage_summary(component_id)
        return store.open_incident(
            title=f"{name} outage",
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
            message=public_recovery_message(component_id),
        )
        return active["id"]
    return None
