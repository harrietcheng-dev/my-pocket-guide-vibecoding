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


def list_trips() -> list[dict[str, Any]]:
    with closing(connect()) as db:
        rows = db.execute("SELECT payload FROM trips ORDER BY updated_at DESC").fetchall()
    return [json.loads(row["payload"]) for row in rows]
