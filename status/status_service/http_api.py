"""Public read-only JSON for current status, incidents, and maintenance."""

from status_service.components import COMPONENT_BY_ID, COMPONENTS
from status_service.rollup import overall_status
from status_service.states import (
    STATE_MAINTENANCE,
    STATE_MAJOR_OUTAGE,
    STATE_UNKNOWN,
    public_component_label,
)
from status_service.store import parse_iso, to_iso, utc_now


SENSITIVE_KEYS = {
    "database",
    "database_url",
    "host",
    "hostname",
    "stack",
    "traceback",
    "exception",
    "secret",
    "api_key",
    "token",
    "workspace_id",
    "email",
    "password",
}


def _is_stale(last_checked_at, now, stale_seconds):
    checked = parse_iso(last_checked_at)
    if checked is None:
        return True
    return (now - checked).total_seconds() > stale_seconds


def _active_maintenance_ids(windows, now):
    active = set()
    for window in windows:
        start = parse_iso(window["starts_at"])
        end = parse_iso(window["ends_at"])
        if start is None or end is None:
            continue
        if start <= now <= end:
            active.update(window.get("component_ids") or [])
    return active


def build_current_payload(store, config, *, now=None):
    now = now or utc_now()
    stale_seconds = config["stale_threshold_seconds"]
    windows = store.list_maintenance()
    maintenance_ids = _active_maintenance_ids(windows, now)
    components = []
    latest_check = None
    for row, catalog in zip(store.get_component_rows(), COMPONENTS):
        state = row["state"] or STATE_UNKNOWN
        last_checked = row.get("last_checked_at")
        if _is_stale(last_checked, now, stale_seconds):
            state = STATE_UNKNOWN
        elif (
            catalog["id"] in maintenance_ids
            and state != STATE_MAJOR_OUTAGE
        ):
            state = STATE_MAINTENANCE
        description = row.get("public_description") or ""
        if state == STATE_UNKNOWN and not last_checked:
            description = description or ""
        if state == STATE_UNKNOWN and last_checked and _is_stale(
            last_checked, now, stale_seconds
        ):
            description = ""
        components.append(
            {
                "id": catalog["id"],
                "name": catalog["name"],
                "state": state,
                "label": public_component_label(state),
                "layer": catalog["layer"],
                "last_checked_at": last_checked,
                "description": description if state != "operational" else "",
            }
        )
        parsed = parse_iso(last_checked)
        if parsed is not None and (latest_check is None or parsed > latest_check):
            latest_check = parsed

    overall_state, overall_label = overall_status(components)
    payload = {
        "overall": {
            "state": overall_state,
            "label": overall_label,
        },
        "generated_at": to_iso(now),
        "last_checked_at": to_iso(latest_check) if latest_check else None,
        "poll_interval_seconds": config["browser_poll_seconds"],
        "components": components,
    }
    return _strip_sensitive(payload)


def _incident_status_label(value):
    return {
        "investigating": "Investigating",
        "identified": "Identified",
        "monitoring": "Monitoring",
        "resolved": "Resolved",
    }.get(value, value.replace("_", " ").title())


def build_incidents_payload(store, *, now=None):
    now = now or utc_now()
    items = []
    for row in store.list_incidents(include_resolved=True, limit=50):
        component_ids = [
            component_id
            for component_id in (row.get("component_ids") or [])
            if component_id in COMPONENT_BY_ID
        ]
        items.append(
            {
                "id": str(row["id"]),
                "title": row["public_title"],
                "summary": row["public_summary"],
                "status": row["status"],
                "status_label": _incident_status_label(row["status"]),
                "severity": row["severity"],
                "severity_label": public_component_label(row["severity"]),
                "started_at": row["started_at"],
                "resolved_at": row.get("resolved_at"),
                "components": component_ids,
                "updates": [
                    {
                        "at": update["created_at"],
                        "message": update["public_message"],
                    }
                    for update in row.get("updates") or []
                ],
            }
        )
    active = [item for item in items if item["status"] != "resolved"]
    recent = [item for item in items if item["status"] == "resolved"][:10]
    return _strip_sensitive(
        {
            "generated_at": to_iso(now),
            "active": active,
            "recent": recent,
        }
    )


def build_maintenance_payload(store, *, now=None):
    now = now or utc_now()
    windows = []
    for row in store.list_maintenance():
        start = parse_iso(row["starts_at"])
        end = parse_iso(row["ends_at"])
        active = bool(start and end and start <= now <= end)
        upcoming = bool(start and start > now)
        if end and end < now and not active:
            continue
        windows.append(
            {
                "id": str(row["id"]),
                "title": row["title"],
                "starts_at": row["starts_at"],
                "ends_at": row["ends_at"],
                "note": row.get("public_note") or "",
                "components": [
                    component_id
                    for component_id in (row.get("component_ids") or [])
                    if component_id in COMPONENT_BY_ID
                ],
                "active": active,
                "upcoming": upcoming,
            }
        )
    return _strip_sensitive(
        {
            "generated_at": to_iso(now),
            "windows": windows,
        }
    )


def _strip_sensitive(value):
    if isinstance(value, dict):
        return {
            key: _strip_sensitive(item)
            for key, item in value.items()
            if key.lower() not in SENSITIVE_KEYS
        }
    if isinstance(value, list):
        return [_strip_sensitive(item) for item in value]
    return value
