"""Public read-only JSON for current status, incidents, and maintenance."""

from status_service.components import COMPONENT_BY_ID, COMPONENTS
from status_service.i18n import (
    auto_outage_summary,
    auto_outage_title,
    auto_recovery_message,
    component_display_name,
    incident_status_label,
    localize_public_description,
    public_component_label,
)
from status_service.locale import DEFAULT_LOCALE, normalize_locale
from status_service.rollup import overall_status
from status_service.states import (
    STATE_MAINTENANCE,
    STATE_MAJOR_OUTAGE,
    STATE_UNKNOWN,
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


def _localize_auto_update_message(message, component_id, locale, *, resolved=False):
    """Rewrite known English auto-incident messages for the requested locale."""
    if not component_id or normalize_locale(locale) == DEFAULT_LOCALE:
        return message
    en_outage = auto_outage_summary(component_id, DEFAULT_LOCALE)
    en_recovery = auto_recovery_message(component_id, DEFAULT_LOCALE)
    text = str(message or "")
    if text == en_outage or (not resolved and text == en_outage):
        return auto_outage_summary(component_id, locale)
    if text == en_recovery or resolved:
        if text == en_recovery:
            return auto_recovery_message(component_id, locale)
    return message


def build_current_payload(store, config, *, now=None, locale=DEFAULT_LOCALE):
    now = now or utc_now()
    locale = normalize_locale(locale)
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
        description = localize_public_description(
            row.get("public_description") or "",
            locale,
        )
        if state == STATE_UNKNOWN and not last_checked:
            description = description or ""
        if state == STATE_UNKNOWN and last_checked and _is_stale(
            last_checked, now, stale_seconds
        ):
            description = ""
        components.append(
            {
                "id": catalog["id"],
                "name": component_display_name(catalog["id"], locale),
                "state": state,
                "label": public_component_label(state, locale),
                "layer": catalog["layer"],
                "last_checked_at": last_checked,
                "description": description if state != "operational" else "",
            }
        )
        parsed = parse_iso(last_checked)
        if parsed is not None and (latest_check is None or parsed > latest_check):
            latest_check = parsed

    overall_state, overall_label = overall_status(components, locale=locale)
    payload = {
        "language": locale,
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


def build_incidents_payload(store, *, now=None, locale=DEFAULT_LOCALE):
    now = now or utc_now()
    locale = normalize_locale(locale)
    items = []
    for row in store.list_incidents(include_resolved=True, limit=50):
        component_ids = [
            component_id
            for component_id in (row.get("component_ids") or [])
            if component_id in COMPONENT_BY_ID
        ]
        auto_id = row.get("auto_component_id") or None
        title = row["public_title"]
        summary = row["public_summary"]
        updates = row.get("updates") or []
        if auto_id:
            title = auto_outage_title(auto_id, locale)
            if row["status"] == "resolved":
                summary = auto_recovery_message(auto_id, locale)
            else:
                summary = auto_outage_summary(auto_id, locale)
            localized_updates = []
            for update in updates:
                message = update["public_message"]
                # First update is usually the outage summary; final is recovery.
                localized_updates.append(
                    {
                        "at": update["created_at"],
                        "message": _localize_auto_update_message(
                            message,
                            auto_id,
                            locale,
                            resolved=message == auto_recovery_message(auto_id, DEFAULT_LOCALE),
                        ),
                    }
                )
            updates = localized_updates
        else:
            updates = [
                {
                    "at": update["created_at"],
                    "message": update["public_message"],
                }
                for update in updates
            ]
        items.append(
            {
                "id": str(row["id"]),
                "title": title,
                "summary": summary,
                "status": row["status"],
                "status_label": incident_status_label(row["status"], locale),
                "severity": row["severity"],
                "severity_label": public_component_label(row["severity"], locale),
                "started_at": row["started_at"],
                "resolved_at": row.get("resolved_at"),
                "components": component_ids,
                "auto_component_id": auto_id,
                "updates": updates,
            }
        )
    active = [item for item in items if item["status"] != "resolved"]
    recent = [item for item in items if item["status"] == "resolved"][:10]
    return _strip_sensitive(
        {
            "language": locale,
            "generated_at": to_iso(now),
            "active": active,
            "recent": recent,
        }
    )


def build_maintenance_payload(store, *, now=None, locale=DEFAULT_LOCALE):
    now = now or utc_now()
    locale = normalize_locale(locale)
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
            "language": locale,
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
