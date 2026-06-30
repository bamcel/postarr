"""SQLite data layer.

A tiny hand-rolled layer over the stdlib ``sqlite3`` module keeps the
dependency surface minimal (important on very new Python versions) and the
schema is small enough that an ORM would be overkill. Secrets are stored
encrypted via :mod:`app.security`; callers always work with plaintext.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Any, Iterator, Optional

from .config import DB_PATH
from .security import decrypt, encrypt

SCHEMA = """
CREATE TABLE IF NOT EXISTS media_servers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    type        TEXT    NOT NULL CHECK (type IN ('plex', 'jellyfin', 'emby')),
    base_url    TEXT    NOT NULL,
    token_enc   TEXT    NOT NULL DEFAULT '',
    is_default  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key       TEXT PRIMARY KEY,
    value_enc TEXT NOT NULL DEFAULT ''
);
"""

# Keys in the ``settings`` table whose values are encrypted at rest.
SECRET_SETTINGS = {"posterdb_password"}


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    """Yield a connection with row access by column name.

    A fresh connection per operation sidesteps cross-thread issues with the
    threadpool FastAPI uses for sync code, and SQLite handles this cheaply.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(SCHEMA)


# ---------------------------------------------------------------------------
# Media servers
# ---------------------------------------------------------------------------

def _server_row_to_dict(row: sqlite3.Row, *, include_token: bool = False) -> dict[str, Any]:
    data = {
        "id": row["id"],
        "name": row["name"],
        "type": row["type"],
        "base_url": row["base_url"],
        "is_default": bool(row["is_default"]),
        "has_token": bool(row["token_enc"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }
    if include_token:
        data["token"] = decrypt(row["token_enc"])
    return data


def list_servers() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM media_servers ORDER BY is_default DESC, name COLLATE NOCASE"
        ).fetchall()
    return [_server_row_to_dict(r) for r in rows]


def get_server(server_id: int, *, include_token: bool = False) -> Optional[dict[str, Any]]:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM media_servers WHERE id = ?", (server_id,)
        ).fetchone()
    return _server_row_to_dict(row, include_token=include_token) if row else None


def create_server(
    name: str, type_: str, base_url: str, token: str, is_default: bool
) -> dict[str, Any]:
    with get_conn() as conn:
        if is_default:
            conn.execute("UPDATE media_servers SET is_default = 0")
        cur = conn.execute(
            """INSERT INTO media_servers (name, type, base_url, token_enc, is_default)
               VALUES (?, ?, ?, ?, ?)""",
            (name, type_, base_url.rstrip("/"), encrypt(token), int(is_default)),
        )
        server_id = cur.lastrowid
        # Guarantee at least one default exists.
        if conn.execute("SELECT COUNT(*) FROM media_servers WHERE is_default = 1").fetchone()[0] == 0:
            conn.execute("UPDATE media_servers SET is_default = 1 WHERE id = ?", (server_id,))
    return get_server(server_id)  # type: ignore[return-value]


def update_server(
    server_id: int,
    *,
    name: Optional[str] = None,
    type_: Optional[str] = None,
    base_url: Optional[str] = None,
    token: Optional[str] = None,
    is_default: Optional[bool] = None,
) -> Optional[dict[str, Any]]:
    sets: list[str] = []
    params: list[Any] = []
    if name is not None:
        sets.append("name = ?"); params.append(name)
    if type_ is not None:
        sets.append("type = ?"); params.append(type_)
    if base_url is not None:
        sets.append("base_url = ?"); params.append(base_url.rstrip("/"))
    if token is not None and token != "":
        # Empty string means "leave the existing token unchanged".
        sets.append("token_enc = ?"); params.append(encrypt(token))
    if is_default is not None:
        sets.append("is_default = ?"); params.append(int(is_default))
    sets.append("updated_at = datetime('now')")

    with get_conn() as conn:
        if is_default:
            conn.execute("UPDATE media_servers SET is_default = 0")
        if sets:
            params.append(server_id)
            conn.execute(f"UPDATE media_servers SET {', '.join(sets)} WHERE id = ?", params)
    return get_server(server_id)


def delete_server(server_id: int) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM media_servers WHERE id = ?", (server_id,))


# ---------------------------------------------------------------------------
# Settings (key/value, used for ThePosterDB credentials)
# ---------------------------------------------------------------------------

def get_setting(key: str) -> str:
    with get_conn() as conn:
        row = conn.execute("SELECT value_enc FROM settings WHERE key = ?", (key,)).fetchone()
    if not row:
        return ""
    raw = row["value_enc"]
    return decrypt(raw) if key in SECRET_SETTINGS else raw


def set_setting(key: str, value: str) -> None:
    stored = encrypt(value) if key in SECRET_SETTINGS else value
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO settings (key, value_enc) VALUES (?, ?)
               ON CONFLICT(key) DO UPDATE SET value_enc = excluded.value_enc""",
            (key, stored),
        )
