"""Detecção de backup do WhatsApp no Google Drive — sem tentativa de quebra de cifra."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from modules import db
from modules.utils import iso_or_none

CRYPT_EXT = {".crypt", ".crypt12", ".crypt14", ".crypt15"}
NOTE = (
    "Backup localizado no Google Drive. O conteúdo permanece cifrado. "
    "Esta ferramenta não tenta quebrar a criptografia do WhatsApp."
)


def ingest_whatsapp(case_id: int, root: Path, account_hint: str | None = None) -> int:
    count = 0
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        blob = str(path).lower().replace("\\", "/")
        name = path.name.lower()
        is_backup = (
            "whatsapp" in blob
            or name.startswith("msgstore")
            or path.suffix.lower() in CRYPT_EXT
            or "wa.db" in name
        )
        if not is_backup:
            continue
        try:
            stat = path.stat()
            size = stat.st_size
            mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
        except OSError:
            size = 0
            mtime = None
        encrypted = 1 if path.suffix.lower() in CRYPT_EXT or "crypt" in name else 1
        db.execute(
            """
            INSERT INTO whatsapp_backups(
                case_id, backup_date, size_bytes, linked_account, filename, path, encrypted, note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                case_id,
                iso_or_none(mtime),
                size,
                account_hint,
                path.name,
                str(path),
                encrypted,
                NOTE,
            ),
        )
        db.execute(
            """
            INSERT INTO events(
                case_id, ts, event_type, product, device_ref, description, source_file, lat, lon, extra_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                case_id,
                iso_or_none(mtime),
                "whatsapp_backup",
                "WhatsApp (Google Drive)",
                None,
                f"Backup detectado: {path.name} ({size} bytes) — cifrado, sem tentativa de quebra",
                str(path),
                None,
                None,
                None,
            ),
        )
        count += 1
    return count
