"""Histórico de localização Google Maps / Location History."""
from __future__ import annotations

import json
from pathlib import Path

from modules import db
from modules.utils import iso_or_none, parse_datetime


def _coord(value) -> float | None:
    if value in (None, ""):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if abs(number) > 180:
        number = number / 1e7
    return number


def _duration_seconds(start, end) -> int | None:
    a = parse_datetime(start)
    b = parse_datetime(end)
    if not a or not b:
        return None
    return max(0, int((b - a).total_seconds()))


def _insert_location(case_id: int, rec: dict) -> None:
    lat = rec.get("lat")
    lon = rec.get("lon")
    if lat is None or lon is None:
        return
    db.execute(
        """
        INSERT INTO locations(
            case_id, ts, lat, lon, accuracy, duration_seconds, place_name, source, device_ref, source_file
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            case_id,
            rec.get("ts"),
            lat,
            lon,
            rec.get("accuracy"),
            rec.get("duration_seconds"),
            rec.get("place_name"),
            rec.get("source"),
            rec.get("device_ref"),
            rec.get("source_file"),
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
            rec.get("ts"),
            "localizacao",
            "Google Maps",
            rec.get("device_ref"),
            rec.get("place_name") or f"Lat {lat:.5f}, Lon {lon:.5f}",
            rec.get("source_file"),
            lat,
            lon,
            None,
        ),
    )


def _from_records_json(path: Path, case_id: int) -> int:
    try:
        payload = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    except (OSError, json.JSONDecodeError):
        return 0
    locations = payload.get("locations") if isinstance(payload, dict) else payload
    if not isinstance(locations, list):
        return 0
    count = 0
    for item in locations:
        if not isinstance(item, dict):
            continue
        lat = _coord(item.get("latitudeE7") or item.get("latitude") or item.get("lat"))
        lon = _coord(item.get("longitudeE7") or item.get("longitude") or item.get("lng") or item.get("lon"))
        ts = iso_or_none(item.get("timestamp") or item.get("timestampMs") or item.get("time"))
        _insert_location(
            case_id,
            {
                "ts": ts,
                "lat": lat,
                "lon": lon,
                "accuracy": item.get("accuracy"),
                "duration_seconds": None,
                "place_name": None,
                "source": item.get("source") or "Location History",
                "device_ref": item.get("deviceTag"),
                "source_file": str(path),
            },
        )
        count += 1
    return count


def _from_semantic(path: Path, case_id: int) -> int:
    try:
        payload = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    except (OSError, json.JSONDecodeError):
        return 0
    objects = payload.get("timelineObjects") if isinstance(payload, dict) else None
    if not isinstance(objects, list):
        return 0
    count = 0
    for obj in objects:
        if not isinstance(obj, dict):
            continue
        visit = obj.get("placeVisit")
        if isinstance(visit, dict):
            loc = visit.get("location") or {}
            duration = visit.get("duration") or {}
            lat = _coord(loc.get("latitudeE7") or loc.get("latitude"))
            lon = _coord(loc.get("longitudeE7") or loc.get("longitude"))
            start = duration.get("startTimestamp") or duration.get("startTimestampMs")
            end = duration.get("endTimestamp") or duration.get("endTimestampMs")
            _insert_location(
                case_id,
                {
                    "ts": iso_or_none(start),
                    "lat": lat,
                    "lon": lon,
                    "accuracy": None,
                    "duration_seconds": _duration_seconds(start, end),
                    "place_name": loc.get("name") or loc.get("address"),
                    "source": "Semantic Location History",
                    "device_ref": None,
                    "source_file": str(path),
                },
            )
            count += 1
    return count


def ingest_locations(case_id: int, root: Path) -> int:
    total = 0
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() != ".json":
            continue
        name = path.name.lower()
        blob = str(path).lower()
        if "semantic location" in blob or "timelineobjects" in blob:
            total += _from_semantic(path, case_id)
        elif name == "records.json" or "location history" in blob:
            total += _from_records_json(path, case_id)
    return total
