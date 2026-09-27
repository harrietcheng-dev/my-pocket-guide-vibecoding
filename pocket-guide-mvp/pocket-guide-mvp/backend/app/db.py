from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any


DATABASE_PATH = Path(__file__).resolve().parents[1] / "pocket_guide.db"


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize() -> None:
    with closing(connect()) as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS anonymous_sessions (
                token TEXT PRIMARY KEY,
                device_id TEXT UNIQUE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS trips (
                id TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                version INTEGER NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        db.commit()


def save_session(token: str, device_id: str, expires_at: str) -> dict[str, str]:
    with closing(connect()) as db:
        db.execute(
            """
            INSERT INTO anonymous_sessions (token, device_id, expires_at)
            VALUES (?, ?, ?)
            ON CONFLICT(device_id) DO UPDATE SET
                token = excluded.token,
                expires_at = excluded.expires_at
            """,
            (token, device_id, expires_at),
        )
        db.commit()
    return {"token": token, "device_id": device_id, "expires_at": expires_at}


def get_session_by_device(device_id: str) -> dict[str, str] | None:
    with closing(connect()) as db:
        row = db.execute(
            "SELECT token, device_id, expires_at FROM anonymous_sessions WHERE device_id = ?",
            (device_id,),
        ).fetchone()
    return dict(row) if row else None


def get_session(token: str) -> dict[str, str] | None:
    with closing(connect()) as db:
        row = db.execute(
            "SELECT token, device_id, expires_at FROM anonymous_sessions WHERE token = ?",
            (token,),
        ).fetchone()
    return dict(row) if row else None


def save_trip(trip: dict[str, Any]) -> dict[str, Any]:
    with closing(connect()) as db:
        db.execute(
            """
            INSERT INTO trips (id, state, version, payload)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                state = excluded.state,
                version = excluded.version,
                payload = excluded.payload,
                updated_at = CURRENT_TIMESTAMP
            """,
            (trip["id"], trip["state"], trip["version"], json.dumps(trip, ensure_ascii=False)),
        )
        db.commit()
    return trip


def get_trip(trip_id: str) -> dict[str, Any] | None:
    with closing(connect()) as db:
        row = db.execute("SELECT payload FROM trips WHERE id = ?", (trip_id,)).fetchone()
    return json.loads(row["payload"]) if row else None


def list_trips(owner_token: str | None = None) -> list[dict[str, Any]]:
    with closing(connect()) as db:
        rows = db.execute("SELECT payload FROM trips ORDER BY updated_at DESC").fetchall()
    trips = [json.loads(row["payload"]) for row in rows]
    if owner_token is None:
        return trips
    return [trip for trip in trips if trip.get("ownerToken") == owner_token]
