"""Arquivos do Google Drive e pesquisa por palavras-chave investigativas."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from config import DRIVE_KEYWORDS
from modules import db
from modules.utils import as_json, fold, guess_mime, iso_or_none

SKIP_EXT = {".json", ".html", ".htm", ".css", ".js"}
TEXT_EXT = {".txt", ".csv", ".md", ".json", ".html", ".htm", ".xml", ".log"}


def _keyword_hits(text: str) -> list[str]:
    folded = fold(text)
    hits = []
    for word in DRIVE_KEYWORDS:
        if fold(word) in folded:
            hits.append(word)
    return hits


def _read_text_sample(path: Path, limit: int = 400_000) -> str:
    if path.suffix.lower() not in TEXT_EXT:
        return path.name
    try:
        return path.read_text(encoding="utf-8", errors="ignore")[:limit]
    except OSError:
        return path.name


def _sidecar_meta(path: Path) -> dict:
    sidecar = Path(str(path) + ".json")
    if not sidecar.exists():
        sidecar = path.with_suffix(path.suffix + ".json")
    if not sidecar.exists():
        return {}
    try:
        payload = json.loads(sidecar.read_text(encoding="utf-8", errors="ignore"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(payload, dict):
        return {}
    owner = ""
    if isinstance(payload.get("owners"), list) and payload["owners"]:
        first = payload["owners"][0]
        owner = first.get("email") if isinstance(first, dict) else str(first)
    return {
        "created_at": iso_or_none(
            (payload.get("creationTime") or {}).get("timestamp")
            if isinstance(payload.get("creationTime"), dict)
            else payload.get("createdTime") or payload.get("created_at")
        ),
        "modified_at": iso_or_none(
            (payload.get("modificationTime") or {}).get("timestamp")
            if isinstance(payload.get("modificationTime"), dict)
            else payload.get("modifiedTime") or payload.get("modified_at")
        ),
        "owner": owner or payload.get("owner") or payload.get("creator"),
        "title": payload.get("title") or payload.get("name"),
    }


def ingest_drive(case_id: int, root: Path) -> int:
    count = 0
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        blob = str(path).lower()
        in_drive = "takeout/drive" in blob.replace("\\", "/") or "/drive/" in blob.replace("\\", "/")
        if not in_drive:
            continue
        if "whatsapp" in blob or "crypt" in path.suffix.lower():
            continue
        if path.suffix.lower() in SKIP_EXT and path.name.endswith(".json"):
            # sidecars são metadados; ainda assim indexa documentos .json úteis
            if "metadata" in path.name.lower():
                continue
        meta = _sidecar_meta(path)
        try:
            size = path.stat().st_size
            mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
        except OSError:
            size = 0
            mtime = None
        sample = _read_text_sample(path)
        hits = _keyword_hits(f"{path.name}\n{sample}")
        created = meta.get("created_at") or mtime
        modified = meta.get("modified_at") or mtime
        owner = meta.get("owner")
        db.execute(
            """
            INSERT INTO files(
                case_id, name, mime_type, created_at, modified_at, owner, path, size_bytes, keywords_hit
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                case_id,
                meta.get("title") or path.name,
                guess_mime(path.name),
                created,
                modified,
                owner,
                str(path),
                size,
                as_json(hits),
            ),
        )
        if hits:
            db.execute(
                """
                INSERT INTO events(
                    case_id, ts, event_type, product, device_ref, description, source_file, lat, lon, extra_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    case_id,
                    modified or created,
                    "arquivo_relevante",
                    "Google Drive",
                    None,
                    f"{path.name} — palavras: {', '.join(hits)}",
                    str(path),
                    None,
                    None,
                    as_json({"keywords": hits}),
                ),
            )
        count += 1
    return count
