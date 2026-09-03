"""SQLite persistence for public status, incidents, and maintenance."""

from contextlib import contextmanager
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from status_service.components import COMPONENT_IDS, COMPONENTS
from status_service.states import (
    STATE_UNKNOWN,
    apply_probe_result,
)


def utc_now():
    return datetime.now(timezone.utc)


def to_iso(value):
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def parse_iso(value):
    if not value:
        return None
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    return datetime.fromisoformat(text)


class StatusStore:
    def __init__(self, database_path):
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()
        self._ensure_components()

    def _connect(self):
        connection = sqlite3.connect(self.database_path, timeout=5.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    @contextmanager
    def _db(self):
        connection = self._connect()
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _init_schema(self):
        with self._db() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS component_state (
                    component_id TEXT PRIMARY KEY,
                    state TEXT NOT NULL,
                    consecutive_failures INTEGER NOT NULL DEFAULT 0,
                    consecutive_successes INTEGER NOT NULL DEFAULT 0,
                    last_checked_at TEXT,
                    last_result TEXT,
                    public_description TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS incidents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    public_title TEXT NOT NULL,
                    public_summary TEXT NOT NULL,
                    status TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    resolved_at TEXT,
                    component_ids TEXT NOT NULL,
                    auto_component_id TEXT
                );

                CREATE TABLE IF NOT EXISTS incident_updates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    incident_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    public_message TEXT NOT NULL,
                    FOREIGN KEY (incident_id) REFERENCES incidents(id)
                );

                CREATE TABLE IF NOT EXISTS maintenance_windows (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    starts_at TEXT NOT NULL,
                    ends_at TEXT NOT NULL,
                    component_ids TEXT NOT NULL,
                    public_note TEXT NOT NULL DEFAULT ''
                );
                """
            )

    def _ensure_components(self):
        with self._db() as connection:
            for item in COMPONENTS:
                connection.execute(
                    """
                    INSERT OR IGNORE INTO component_state (
                        component_id, state, consecutive_failures,
                        consecutive_successes, public_description
                    ) VALUES (?, ?, 0, 0, '')
                    """,
                    (item["id"], STATE_UNKNOWN),
                )

    def get_component_rows(self):
        with self._db() as connection:
            rows = connection.execute(
                "SELECT * FROM component_state"
            ).fetchall()
        by_id = {row["component_id"]: dict(row) for row in rows}
        ordered = []
        for component_id in COMPONENT_IDS:
            row = by_id.get(component_id)
            if row is None:
                row = {
                    "component_id": component_id,
                    "state": STATE_UNKNOWN,
                    "consecutive_failures": 0,
                    "consecutive_successes": 0,
                    "last_checked_at": None,
                    "last_result": None,
                    "public_description": "",
                }
            ordered.append(row)
        return ordered

    def apply_result(self, component_id, kind, *, now=None, description=""):
        now = now or utc_now()
        rows = {row["component_id"]: row for row in self.get_component_rows()}
        current = rows.get(component_id) or {
            "state": STATE_UNKNOWN,
            "consecutive_failures": 0,
            "consecutive_successes": 0,
        }
        state, failures, successes = apply_probe_result(
            current["state"],
            current["consecutive_failures"],
            current["consecutive_successes"],
            kind,
        )
        public_description = description if kind != "success" else ""
        with self._db() as connection:
            connection.execute(
                """
                INSERT INTO component_state (
                    component_id, state, consecutive_failures,
                    consecutive_successes, last_checked_at, last_result,
                    public_description
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(component_id) DO UPDATE SET
                    state = excluded.state,
                    consecutive_failures = excluded.consecutive_failures,
                    consecutive_successes = excluded.consecutive_successes,
                    last_checked_at = excluded.last_checked_at,
                    last_result = excluded.last_result,
                    public_description = excluded.public_description
                """,
                (
                    component_id,
                    state,
                    failures,
                    successes,
                    to_iso(now),
                    kind,
                    public_description,
                ),
            )
        return state

    def list_incidents(self, *, include_resolved=True, limit=20):
        sql = "SELECT * FROM incidents"
        if not include_resolved:
            sql += " WHERE status != 'resolved'"
        sql += " ORDER BY started_at DESC, id DESC LIMIT ?"
        with self._db() as connection:
            rows = connection.execute(sql, (int(limit),)).fetchall()
            result = []
            for row in rows:
                item = dict(row)
                item["component_ids"] = json.loads(item["component_ids"] or "[]")
                item["updates"] = [
                    dict(update)
                    for update in connection.execute(
                        """
                        SELECT created_at, public_message
                        FROM incident_updates
                        WHERE incident_id = ?
                        ORDER BY created_at ASC, id ASC
                        """,
                        (item["id"],),
                    ).fetchall()
                ]
                result.append(item)
        return result

    def active_auto_incident(self, component_id):
        with self._db() as connection:
            row = connection.execute(
                """
                SELECT * FROM incidents
                WHERE auto_component_id = ? AND status != 'resolved'
                ORDER BY id DESC LIMIT 1
                """,
                (component_id,),
            ).fetchone()
        if row is None:
            return None
        item = dict(row)
        item["component_ids"] = json.loads(item["component_ids"] or "[]")
        return item

    def open_incident(
        self,
        *,
        title,
        summary,
        severity,
        component_ids,
        auto_component_id=None,
        now=None,
        message="",
    ):
        now = now or utc_now()
        stamp = to_iso(now)
        with self._db() as connection:
            cursor = connection.execute(
                """
                INSERT INTO incidents (
                    public_title, public_summary, status, severity,
                    started_at, resolved_at, component_ids, auto_component_id
                ) VALUES (?, ?, 'investigating', ?, ?, NULL, ?, ?)
                """,
                (
                    title,
                    summary,
                    severity,
                    stamp,
                    json.dumps(list(component_ids)),
                    auto_component_id,
                ),
            )
            incident_id = cursor.lastrowid
            connection.execute(
                """
                INSERT INTO incident_updates (
                    incident_id, created_at, public_message
                ) VALUES (?, ?, ?)
                """,
                (incident_id, stamp, message or summary),
            )
        return incident_id

    def resolve_incident(self, incident_id, *, now=None, message="This component has recovered."):
        now = now or utc_now()
        stamp = to_iso(now)
        with self._db() as connection:
            connection.execute(
                """
                UPDATE incidents
                SET status = 'resolved', resolved_at = ?
                WHERE id = ? AND status != 'resolved'
                """,
                (stamp, int(incident_id)),
            )
            connection.execute(
                """
                INSERT INTO incident_updates (
                    incident_id, created_at, public_message
                ) VALUES (?, ?, ?)
                """,
                (int(incident_id), stamp, message),
            )

    def list_maintenance(self):
        with self._db() as connection:
            rows = connection.execute(
                """
                SELECT * FROM maintenance_windows
                ORDER BY starts_at ASC, id ASC
                """
            ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["component_ids"] = json.loads(item["component_ids"] or "[]")
            result.append(item)
        return result

    def add_maintenance(self, *, title, starts_at, ends_at, component_ids, note=""):
        with self._db() as connection:
            connection.execute(
                """
                INSERT INTO maintenance_windows (
                    title, starts_at, ends_at, component_ids, public_note
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    title,
                    to_iso(starts_at) if not isinstance(starts_at, str) else starts_at,
                    to_iso(ends_at) if not isinstance(ends_at, str) else ends_at,
                    json.dumps(list(component_ids)),
                    note,
                ),
            )


def public_description_for_kind(kind):
    if kind == "unconfigured":
        return "Not configured"
    if kind == "degraded":
        return "Degraded response from this service"
    if kind == "failure":
        return "This service is not responding normally"
    return ""
