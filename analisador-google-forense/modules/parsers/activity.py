"""Linha do tempo e histórico de pesquisas (My Activity)."""
from __future__ import annotations

import json
from pathlib import Path

from modules import db
from modules.utils import as_json, clean, iso_or_none

SEARCH_HINTS = ("search", "pesquisou", "searched for", "you searched")


def _iter_json_records(payload) -> list[dict]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in ("events", "activities", "MyActivity", "items"):
            if isinstance(payload.get(key), list):
                return [x for x in payload[key] if isinstance(x, dict)]
        return [payload]
    return []


def _activity_product(path: Path, record: dict) -> str:
    header = clean(record.get("header") or record.get("product") or "")
    blob = str(path).lower()
    if "search" in blob or "search" in header.lower():
        return "Google Search"
    if "maps" in blob or "maps" in header.lower():
        return "Google Maps"
    if "youtube" in blob:
        return "YouTube"
    if "image" in blob:
        return "Google Images"
    return header or "My Activity"


def _is_search(path: Path, record: dict, product: str) -> bool:
    title = clean(record.get("title") or "")
    low = title.lower()
    blob = str(path).lower()
    return product == "Google Search" or "search" in blob or any(h in low for h in SEARCH_HINTS)


def _query_from_title(title: str) -> str:
    for prefix in ("Pesquisou por ", "Searched for ", "You searched for "):
        if title.startswith(prefix):
            return title[len(prefix):].strip()
    return title


def ingest_activity(case_id: int, root: Path) -> tuple[int, int]:
    events = 0
    searches = 0
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() != ".json":
            continue
        blob = str(path).lower()
        if "my activity" not in blob and "myactivity" not in blob and "/search/" not in blob:
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
        except (OSError, json.JSONDecodeError):
            continue
        for record in _iter_json_records(payload):
            title = clean(record.get("title") or record.get("description") or "Atividade")
            ts = iso_or_none(record.get("time") or record.get("timestamp") or record.get("dt"))
            product = _activity_product(path, record)
            device = clean(
                (record.get("deviceInformation") or {}).get("deviceType")
                if isinstance(record.get("deviceInformation"), dict)
                else record.get("device")
            )
            loc = None
            if isinstance(record.get("locations"), list) and record["locations"]:
                loc = record["locations"][0]
            lat = lon = None
            if isinstance(loc, dict):
                lat = loc.get("latitude") or loc.get("lat")
                lon = loc.get("longitude") or loc.get("lng") or loc.get("lon")
            db.execute(
                """
                INSERT INTO events(
                    case_id, ts, event_type, product, device_ref, description, source_file, lat, lon, extra_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    case_id,
                    ts,
                    "atividade",
                    product,
                    device,
                    title,
                    str(path),
                    lat,
                    lon,
                    as_json(record),
                ),
            )
            events += 1
            if _is_search(path, record, product):
                db.execute(
                    """
                    INSERT INTO searches(case_id, query, ts, device_ref, product, source_file)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (case_id, _query_from_title(title), ts, device, product, str(path)),
                )
                searches += 1
    return events, searches
