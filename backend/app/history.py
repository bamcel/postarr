"""Apply history: keeps the last few images applied to each (server, item,
target) so a bad pick can be reverted without re-searching from scratch —
and, via ``list_recent`` with no ``item_id``, a global feed of everything
applied across the server(s), newest first.

Every successful apply — from any artwork provider or a manual upload —
records an entry here. The image bytes are saved to disk under
``DATA_DIR/history/`` rather than just remembering the source URL, since
provider URLs can go stale (ThePosterDB needs its authenticated session,
others may rate-limit, move, or require a Referer) — the bytes we already
downloaded to apply them are the one thing guaranteed to still be good.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any, Optional

from . import db
from .config import DATA_DIR

HISTORY_DIR = DATA_DIR / "history"
MAX_PER_TARGET = 5

_EXT_BY_CONTENT_TYPE = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/gif": ".gif",
}


def record(
    server_id: int,
    item_id: str,
    target: str,
    data: bytes,
    content_type: str,
    provider: str,
    item_title: str = "",
) -> None:
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    ext = _EXT_BY_CONTENT_TYPE.get(content_type, ".img")
    path = HISTORY_DIR / f"{uuid.uuid4().hex}{ext}"
    path.write_bytes(data)
    db.insert_apply_history(server_id, item_id, target, str(path), content_type, provider, item_title)

    for stale_path in db.prune_apply_history(server_id, item_id, target, keep=MAX_PER_TARGET):
        Path(stale_path).unlink(missing_ok=True)


def list_recent(
    server_id: Optional[int] = None,
    item_id: Optional[str] = None,
    target: Optional[str] = None,
    limit: Optional[int] = None,
) -> list[dict[str, Any]]:
    return db.list_apply_history(server_id, item_id, target, limit)


def get_entry(history_id: int) -> Optional[dict[str, Any]]:
    return db.get_apply_history_entry(history_id)


def read_image(entry: dict[str, Any]) -> tuple[bytes, str]:
    return Path(entry["file_path"]).read_bytes(), entry["content_type"]
