"""Google Photos + EXIF + miniaturas."""
from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path

import exifread
from PIL import Image

from config import MEDIA_DIR
from modules import db
from modules.utils import as_json, iso_or_none

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".gif"}


def _ratio(value) -> float | None:
    try:
        return float(value.num) / float(value.den) if getattr(value, "den", None) else float(value)
    except Exception:
        try:
            return float(value)
        except Exception:
            return None


def _dms_to_deg(values, ref) -> float | None:
    if not values or len(values) < 3:
        return None
    deg = _ratio(values[0])
    minutes = _ratio(values[1])
    seconds = _ratio(values[2])
    if None in (deg, minutes, seconds):
        return None
    result = deg + minutes / 60.0 + seconds / 3600.0
    if str(ref).upper() in ("S", "W"):
        result = -result
    return result


def read_exif(path: Path) -> dict:
    data = {"tags": {}, "lat": None, "lon": None, "taken_at": None}
    try:
        with path.open("rb") as fh:
            tags = exifread.process_file(fh, details=False)
    except OSError:
        return data
    for key, value in tags.items():
        if key.startswith("Thumbnail"):
            continue
        data["tags"][key] = str(value)
    lat = tags.get("GPS GPSLatitude")
    lat_ref = tags.get("GPS GPSLatitudeRef")
    lon = tags.get("GPS GPSLongitude")
    lon_ref = tags.get("GPS GPSLongitudeRef")
    if lat and lon:
        data["lat"] = _dms_to_deg(getattr(lat, "values", None), lat_ref)
        data["lon"] = _dms_to_deg(getattr(lon, "values", None), lon_ref)
    for key in ("EXIF DateTimeOriginal", "EXIF DateTimeDigitized", "Image DateTime"):
        if key in tags:
            raw = str(tags[key]).replace(":", "-", 2)
            data["taken_at"] = iso_or_none(raw)
            break
    return data


def _sidecar(path: Path) -> dict:
    sidecar = Path(str(path) + ".json")
    if not sidecar.exists():
        sidecar = path.with_suffix(path.suffix + ".json")
    if not sidecar.exists():
        return {}
    try:
        payload = json.loads(sidecar.read_text(encoding="utf-8", errors="ignore"))
    except (OSError, json.JSONDecodeError):
        return {}
    out = {}
    if isinstance(payload, dict):
        geo = payload.get("geoData") or payload.get("geoDataExif") or {}
        if isinstance(geo, dict):
            out["lat"] = geo.get("latitude") or None
            out["lon"] = geo.get("longitude") or None
        taken = payload.get("photoTakenTime") or payload.get("creationTime") or {}
        if isinstance(taken, dict):
            out["taken_at"] = iso_or_none(taken.get("timestamp") or taken.get("formatted"))
        out["title"] = payload.get("title")
    return out


def _thumbnail(src: Path, dest: Path) -> str | None:
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(src) as img:
            img = img.convert("RGB")
            img.thumbnail((320, 320))
            buf = BytesIO()
            img.save(buf, format="JPEG", quality=72)
            dest.write_bytes(buf.getvalue())
        return str(dest)
    except Exception:
        return None


def ingest_photos(case_id: int, root: Path) -> int:
    count = 0
    media_root = MEDIA_DIR / f"case_{case_id}" / "photos"
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXT:
            continue
        blob = str(path).lower()
        if "google photos" not in blob and "photos from" not in blob and "/photos/" not in blob:
            if path.suffix.lower() not in IMAGE_EXT:
                continue
            # ainda importa imagens avulsas da produção
        exif = read_exif(path)
        extra = _sidecar(path)
        lat = extra.get("lat") or exif.get("lat")
        lon = extra.get("lon") or exif.get("lon")
        taken = extra.get("taken_at") or exif.get("taken_at")
        thumb = _thumbnail(path, media_root / f"{count}_{path.stem}.jpg")
        db.execute(
            """
            INSERT INTO photos(
                case_id, filename, stored_path, taken_at, lat, lon, exif_json,
                thumbnail_path, has_gps, source_file
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                case_id,
                path.name,
                str(path),
                taken,
                lat if lat not in (0, 0.0) else None,
                lon if lon not in (0, 0.0) else None,
                as_json(exif.get("tags") or {}),
                thumb,
                1 if lat not in (None, 0, 0.0) and lon not in (None, 0, 0.0) else 0,
                str(path),
            ),
        )
        if taken or lat:
            db.execute(
                """
                INSERT INTO events(
                    case_id, ts, event_type, product, device_ref, description, source_file, lat, lon, extra_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    case_id,
                    taken,
                    "foto",
                    "Google Photos",
                    None,
                    path.name,
                    str(path),
                    lat,
                    lon,
                    None,
                ),
            )
        count += 1
    return count
