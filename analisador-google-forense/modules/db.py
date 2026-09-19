"""Camada SQLite local."""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Iterable

from config import BASE_DIR, DB_PATH, ensure_dirs
from modules.utils import now_iso

SCHEMA_PATH = BASE_DIR / "schema.sql"


def connect() -> sqlite3.Connection:
    ensure_dirs()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db() -> None:
    schema = SCHEMA_PATH.read_text(encoding="utf-8")
    with connect() as conn:
        conn.executescript(schema)


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def rows_to_dicts(rows: Iterable[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(r) for r in rows]


def execute(sql: str, params: tuple | list | dict = ()) -> int:
    with connect() as conn:
        cur = conn.execute(sql, params)
        conn.commit()
        return int(cur.lastrowid or 0)


def executemany(sql: str, seq: Iterable[tuple | list | dict]) -> None:
    with connect() as conn:
        conn.executemany(sql, seq)
        conn.commit()


def query(sql: str, params: tuple | list | dict = ()) -> list[dict[str, Any]]:
    with connect() as conn:
        return rows_to_dicts(conn.execute(sql, params).fetchall())


def query_one(sql: str, params: tuple | list | dict = ()) -> dict[str, Any] | None:
    with connect() as conn:
        return row_to_dict(conn.execute(sql, params).fetchone())


def current_case_id() -> int | None:
    row = query_one("SELECT id FROM cases ORDER BY updated_at DESC, id DESC LIMIT 1")
    return int(row["id"]) if row else None


def get_case(case_id: int | None = None) -> dict[str, Any] | None:
    if case_id is None:
        case_id = current_case_id()
    if case_id is None:
        return None
    return query_one("SELECT * FROM cases WHERE id = ?", (case_id,))


def create_case(name: str, notes: str = "") -> int:
    ts = now_iso()
    return execute(
        "INSERT INTO cases(name, notes, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (name, notes, ts, ts),
    )


def touch_case(case_id: int) -> None:
    execute("UPDATE cases SET updated_at = ? WHERE id = ?", (now_iso(), case_id))


def update_crime_date(case_id: int, crime_date: str | None, window_hours: int = 24) -> None:
    execute(
        "UPDATE cases SET crime_date = ?, crime_window_hours = ?, updated_at = ? WHERE id = ?",
        (crime_date or None, int(window_hours or 24), now_iso(), case_id),
    )


def counts(case_id: int) -> dict[str, int]:
    tables = [
        "imports",
        "products",
        "accounts",
        "devices",
        "events",
        "locations",
        "photos",
        "files",
        "emails",
        "payments",
        "searches",
        "whatsapp_backups",
    ]
    out: dict[str, int] = {}
    with connect() as conn:
        for table in tables:
            row = conn.execute(
                f"SELECT COUNT(*) AS n FROM {table} WHERE case_id = ?",
                (case_id,),
            ).fetchone()
            out[table] = int(row["n"] if row else 0)
    return out
