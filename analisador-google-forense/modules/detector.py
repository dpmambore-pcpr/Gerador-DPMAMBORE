"""Identificação automática de produtos Google em produções LERS/Takeout."""
from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

from config import PRODUCT_LABELS

SIGNATURES: list[tuple[str, re.Pattern[str]]] = [
    ("whatsapp", re.compile(r"whatsapp|msgstore\.db\.crypt|wa\.db", re.I)),
    ("gmail", re.compile(r"\.mbox$|mail\.messages|mail\.messageinformation|takeout[/\\]mail|all mail including spam", re.I)),
    ("photos", re.compile(r"googlephotos|photoresourcelegal|google photos|takeout[/\\]google photos|\.(jpg|jpeg|heic|png)\.json$", re.I)),
    ("maps", re.compile(r"timeline\.|semanticlocation|userlocationprofile|location history|records\.json|semantic location|takeout[/\\]maps", re.I)),
    ("pay", re.compile(r"googlepay|google pay|invoicingtransaction|storedvalue|billinginformation|consumertransactions|google wallet", re.I)),
    ("search", re.compile(r"my activity[/\\]search|search[/\\]myactivity", re.I)),
    ("access_log", re.compile(r"accesslogactivity|access.?log", re.I)),
    ("android_device", re.compile(r"androiddeviceconfiguration|deviceanduserprofile|android device configuration", re.I)),
    ("account", re.compile(r"googleaccount|subscriberinfo|takeout[/\\]profile|profile\.json", re.I)),
    ("drive_backup", re.compile(r"drivemobilebackups|mobile backups", re.I)),
    ("drive", re.compile(r"drive\.drivefiles|takeout[/\\]drive|google drive", re.I)),
    ("chrome", re.compile(r"chrome\.history|chrome\.bookmarks|chrome\.addresses|takeout[/\\]chrome", re.I)),
    ("youtube", re.compile(r"youtube and youtube music|my activity[/\\]youtube", re.I)),
    ("play", re.compile(r"google play store|play store", re.I)),
    ("hangouts", re.compile(r"hangouts|google chat|takeout[/\\]chat", re.I)),
    ("contacts", re.compile(r"takeout[/\\]contacts|\.vcf$", re.I)),
    ("calendar", re.compile(r"takeout[/\\]calendar|\.ics$", re.I)),
    ("keep", re.compile(r"takeout[/\\]keep", re.I)),
    ("activity", re.compile(r"my activity|myactivity\.json", re.I)),
]


def classify_path(path: Path, root: Path) -> str:
    rel = str(path.relative_to(root)).replace("\\", "/")
    name = path.name
    blob = f"{rel} {name}"
    for key, pattern in SIGNATURES:
        if pattern.search(blob):
            return key
    return "unknown"


def detect_products(root: Path) -> dict[str, dict]:
    files = [p for p in root.rglob("*") if p.is_file()]
    grouped: dict[str, list[str]] = defaultdict(list)
    for path in files:
        key = classify_path(path, root)
        try:
            rel = str(path.relative_to(root))
        except ValueError:
            rel = str(path)
        grouped[key].append(rel)
    products = {}
    for key, paths in grouped.items():
        products[key] = {
            "product_key": key,
            "product_name": PRODUCT_LABELS.get(key, key),
            "file_count": len(paths),
            "sample_paths": paths[:40],
        }
    return products
