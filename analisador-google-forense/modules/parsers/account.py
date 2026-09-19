"""Parser de conta Google / SubscriberInfo / Profile."""
from __future__ import annotations

import json
import re
from html.parser import HTMLParser
from pathlib import Path

from modules import db
from modules.utils import as_json, clean, extract_emails, extract_phones, iso_or_none, uniq

ACCOUNT_NAME_HINTS = ("name", "nome", "full name", "display name", "given name")
CREATED_HINTS = ("created", "creation", "criação", "account created", "signup")
ACTIVITY_HINTS = ("last activity", "última atividade", "last login", "last used")
STATUS_HINTS = ("status", "state", "account status")
DELETED_HINTS = ("deleted", "deletion", "exclusão", "disabled on")


class _TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._row: list[str] = []
        self._cell = ""
        self._in_cell = False
        self.text_chunks: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._row = []
        if tag in ("td", "th"):
            self._in_cell = True
            self._cell = ""

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._in_cell:
            self._row.append(re.sub(r"\s+", " ", self._cell).strip())
            self._in_cell = False
        if tag == "tr" and self._row:
            self.rows.append(self._row)

    def handle_data(self, data):
        text = data.strip()
        if text:
            self.text_chunks.append(text)
        if self._in_cell:
            self._cell += " " + data


def _looks_like(label: str, hints: tuple[str, ...]) -> bool:
    low = label.lower()
    return any(h in low for h in hints)


def _from_mapping(mapping: dict) -> dict:
    flat = {str(k).lower(): v for k, v in mapping.items()}
    emails = extract_emails(" ".join(str(v) for v in mapping.values()))
    phones = extract_phones(" ".join(str(v) for v in mapping.values()))
    primary = clean(
        flat.get("email")
        or flat.get("primary email")
        or flat.get("e-mail principal")
        or flat.get("google account")
        or (emails[0] if emails else "")
    )
    name = clean(
        flat.get("name")
        or flat.get("nome")
        or flat.get("full name")
        or flat.get("display name")
        or flat.get("given_name")
        or flat.get("personname")
    )
    created = iso_or_none(
        flat.get("created")
        or flat.get("creation time")
        or flat.get("account created")
        or flat.get("created_on")
        or flat.get("data de criação")
    )
    last_activity = iso_or_none(
        flat.get("last activity")
        or flat.get("last_activity")
        or flat.get("last login")
        or flat.get("última atividade")
    )
    status = clean(flat.get("status") or flat.get("account status") or flat.get("state"))
    deletion = iso_or_none(
        flat.get("deleted")
        or flat.get("deletion date")
        or flat.get("disabled on")
        or flat.get("data de exclusão")
    )
    alternates = [e for e in emails if e.lower() != primary.lower()]
    return {
        "google_account": primary,
        "display_name": name,
        "primary_email": primary,
        "alternate_emails": uniq(alternates),
        "phones": uniq(phones),
        "created_on": created,
        "last_activity": last_activity,
        "status": status or "Não informado",
        "deletion_date": deletion,
    }


def _parse_html(path: Path) -> dict | None:
    parser = _TableParser()
    try:
        html = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None
    parser.feed(html)
    mapping: dict[str, str] = {}
    for row in parser.rows:
        if len(row) >= 2:
            key = row[0]
            value = " | ".join(row[1:])
            if key in mapping and mapping[key] != value:
                mapping[key] = mapping[key] + " | " + value
            else:
                mapping[key] = value
    if mapping:
        data = _from_mapping(mapping)
        data["source_file"] = str(path)
        data["raw_json"] = as_json(mapping)
        return data
    emails = extract_emails(html)
    if emails:
        return {
            "google_account": emails[0],
            "display_name": "",
            "primary_email": emails[0],
            "alternate_emails": emails[1:],
            "phones": extract_phones(html),
            "created_on": None,
            "last_activity": None,
            "status": "Não informado",
            "deletion_date": None,
            "source_file": str(path),
            "raw_json": as_json({"emails": emails}),
        }
    return None


def _parse_json(path: Path) -> dict | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    except (OSError, json.JSONDecodeError):
        return None
    if isinstance(payload, list) and payload and isinstance(payload[0], dict):
        payload = payload[0]
    if not isinstance(payload, dict):
        return None
    data = _from_mapping(payload)
    data["source_file"] = str(path)
    data["raw_json"] = as_json(payload)
    return data


def ingest_accounts(case_id: int, root: Path) -> int:
    count = 0
    candidates: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        name = path.name.lower()
        rel = str(path.relative_to(root)).lower()
        if any(
            token in name or token in rel
            for token in (
                "subscriberinfo",
                "subscriber",
                "profile.json",
                "googleaccount",
                "account_info",
            )
        ):
            candidates.append(path)
    seen = set()
    for path in candidates:
        parsed = None
        if path.suffix.lower() in (".html", ".htm", ".txt"):
            parsed = _parse_html(path)
        elif path.suffix.lower() == ".json":
            parsed = _parse_json(path)
        if not parsed or not parsed.get("primary_email"):
            continue
        key = parsed["primary_email"].lower()
        if key in seen:
            continue
        seen.add(key)
        db.execute(
            """
            INSERT INTO accounts(
                case_id, google_account, display_name, primary_email, alternate_emails,
                phones, created_on, last_activity, status, deletion_date, source_file, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                case_id,
                parsed.get("google_account"),
                parsed.get("display_name"),
                parsed.get("primary_email"),
                as_json(parsed.get("alternate_emails") or []),
                as_json(parsed.get("phones") or []),
                parsed.get("created_on"),
                parsed.get("last_activity"),
                parsed.get("status"),
                parsed.get("deletion_date"),
                parsed.get("source_file"),
                parsed.get("raw_json"),
            ),
        )
        count += 1
    return count
