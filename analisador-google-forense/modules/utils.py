"""Utilitários forenses: datas, IMEI, e-mails, sanitização de caminhos."""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo

from config import DISPLAY_TZ

DISPLAY_ZONE = ZoneInfo(DISPLAY_TZ)
UTC = timezone.utc

EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.I)
PHONE_RE = re.compile(r"(?:\+?55[\s\-]?)?(?:\(?\d{2}\)?[\s\-]?)?\d{4,5}[\s\-]?\d{4}")
IPV4_RE = re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b")
IMEI_RE = re.compile(r"\b\d{14,16}\b")


def now_iso() -> str:
    return datetime.now(tz=UTC).replace(microsecond=0).isoformat()


def as_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def from_json(value: str | None, default: Any = None) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def clean(value: Any) -> str:
    return str(value or "").strip()


def uniq(values: Iterable[Any]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in values:
        text = clean(item)
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
    return out


def fold(value: str) -> str:
    nfd = unicodedata.normalize("NFD", value or "")
    return "".join(ch for ch in nfd if unicodedata.category(ch) != "Mn").lower()


def extract_emails(text: Any) -> list[str]:
    return uniq(m.lower() for m in EMAIL_RE.findall(str(text or "")))


def extract_phones(text: Any) -> list[str]:
    return uniq(PHONE_RE.findall(str(text or "")))


def extract_ips(text: Any) -> list[str]:
    return uniq(IPV4_RE.findall(str(text or "")))


def luhn_ok(digits: str) -> bool:
    if not digits.isdigit() or not (14 <= len(digits) <= 16):
        return False
    total = 0
    reverse = digits[::-1]
    for i, ch in enumerate(reverse):
        n = int(ch)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def normalize_imei(value: Any) -> str | None:
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) == 14:
        for last in "0123456789":
            candidate = digits + last
            if luhn_ok(candidate):
                return candidate
        return digits
    if len(digits) in (15, 16) and (luhn_ok(digits) or len(digits) == 15):
        return digits[:15] if len(digits) >= 15 else digits
    return None


def file_hashes(path: Path) -> dict[str, str]:
    sha256 = hashlib.sha256()
    sha1 = hashlib.sha1()
    md5 = hashlib.md5()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            sha256.update(chunk)
            sha1.update(chunk)
            md5.update(chunk)
    return {
        "sha256": sha256.hexdigest(),
        "sha1": sha1.hexdigest(),
        "md5": md5.hexdigest(),
    }


def parse_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        dt = value
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC)
    if isinstance(value, (int, float)):
        number = float(value)
        if number > 1e14:
            number /= 1e6
        elif number > 1e11:
            number /= 1e3
        try:
            return datetime.fromtimestamp(number, tz=UTC)
        except (OSError, OverflowError, ValueError):
            return None
    text = clean(value)
    if not text:
        return None
    if text.isdigit():
        return parse_datetime(int(text))
    text = text.replace("Z", "+00:00")
    for fmt in (
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%d %H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y",
        "%b %d, %Y, %I:%M:%S %p %Z",
        "%b %d, %Y, %I:%M:%S %p",
    ):
        try:
            dt = datetime.strptime(text, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
            return dt.astimezone(UTC)
        except ValueError:
            continue
    try:
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC)
    except ValueError:
        pass
    try:
        return parsedate_to_datetime(text).astimezone(UTC)
    except Exception:
        return None


def iso_or_none(value: Any) -> str | None:
    dt = parse_datetime(value)
    return dt.replace(microsecond=0).isoformat() if dt else None


def display_dt(value: Any) -> str:
    dt = parse_datetime(value)
    if not dt:
        return ""
    local = dt.astimezone(DISPLAY_ZONE)
    return local.strftime("%d/%m/%Y %H:%M:%S")


def display_date(value: Any) -> str:
    dt = parse_datetime(value)
    if not dt:
        return ""
    return dt.astimezone(DISPLAY_ZONE).strftime("%d/%m/%Y")


def display_time(value: Any) -> str:
    dt = parse_datetime(value)
    if not dt:
        return ""
    return dt.astimezone(DISPLAY_ZONE).strftime("%H:%M:%S")


def within_window(ts: Any, center: Any, hours: float) -> bool:
    event = parse_datetime(ts)
    crime = parse_datetime(center)
    if not event or not crime:
        return False
    delta = abs(event - crime)
    return delta <= timedelta(hours=float(hours or 0))


def safe_relpath(root: Path, member: str) -> Path | None:
    name = member.replace("\\", "/").lstrip("/")
    if not name or name.endswith("/"):
        return None
    parts = []
    for part in name.split("/"):
        if part in ("", ".", ".."):
            return None
        parts.append(part)
    target = (root / Path(*parts)).resolve()
    try:
        target.relative_to(root.resolve())
    except ValueError:
        return None
    return target


def walk_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return [p for p in root.rglob("*") if p.is_file()]


def guess_mime(name: str) -> str:
    lower = name.lower()
    mapping = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".heic": "image/heic",
        ".mp4": "video/mp4",
        ".pdf": "application/pdf",
        ".txt": "text/plain",
        ".csv": "text/csv",
        ".json": "application/json",
        ".html": "text/html",
        ".htm": "text/html",
        ".mbox": "application/mbox",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".zip": "application/zip",
        ".crypt12": "application/octet-stream",
        ".crypt14": "application/octet-stream",
        ".crypt15": "application/octet-stream",
    }
    for ext, mime in mapping.items():
        if lower.endswith(ext):
            return mime
    return "application/octet-stream"
