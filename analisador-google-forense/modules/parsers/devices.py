"""Parser de dispositivos Android / IMEI / fabricante / contas vinculadas."""
from __future__ import annotations

import json
import re
from html.parser import HTMLParser
from pathlib import Path

from modules import db
from modules.utils import as_json, clean, extract_emails, iso_or_none, normalize_imei, uniq

IMEI_LABEL = re.compile(r"imei\s*([12])?|imei number", re.I)
SERIAL_LABEL = re.compile(r"serial|número de série|numero de serie", re.I)
MODEL_LABEL = re.compile(r"model|modelo", re.I)
MFG_LABEL = re.compile(r"manufacturer|fabricante|brand|marca", re.I)
ANDROID_LABEL = re.compile(r"android.?id|gsf", re.I)
FIRST_LABEL = re.compile(r"first.*(seen|use|link|register)|primeiro|registration", re.I)
LAST_LABEL = re.compile(r"last.*(seen|use|link|activity)|último|ultimo", re.I)


class _TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._row: list[str] = []
        self._cell = ""
        self._in_cell = False

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
        if self._in_cell:
            self._cell += " " + data


def _blank_device() -> dict:
    return {
        "imei1": None,
        "imei2": None,
        "model": None,
        "manufacturer": None,
        "serial_number": None,
        "android_id": None,
        "first_seen": None,
        "last_seen": None,
        "accounts": [],
        "source_file": None,
        "raw": {},
    }


def _apply_field(device: dict, label: str, value: str) -> None:
    raw = clean(value)
    if not raw:
        return
    if IMEI_LABEL.search(label):
        imei = normalize_imei(raw)
        if not imei:
            return
        if "2" in label and "1" not in label:
            device["imei2"] = imei
        elif not device["imei1"]:
            device["imei1"] = imei
        elif imei != device["imei1"]:
            device["imei2"] = imei
        return
    if SERIAL_LABEL.search(label):
        device["serial_number"] = raw
    elif MODEL_LABEL.search(label) and not device["model"]:
        device["model"] = raw
    elif MFG_LABEL.search(label):
        device["manufacturer"] = raw
    elif ANDROID_LABEL.search(label):
        device["android_id"] = raw
    elif FIRST_LABEL.search(label):
        device["first_seen"] = iso_or_none(raw)
    elif LAST_LABEL.search(label):
        device["last_seen"] = iso_or_none(raw)
    device["accounts"].extend(extract_emails(raw))


def _from_device_object(obj: dict, source: Path) -> dict:
    device = _blank_device()
    device["source_file"] = str(source)
    device["raw"] = obj
    device["model"] = clean(obj.get("modelName") or obj.get("model") or obj.get("deviceModel"))
    device["manufacturer"] = clean(obj.get("manufacturer") or obj.get("brand"))
    device["serial_number"] = clean(obj.get("serialNumber") or obj.get("serial"))
    device["android_id"] = clean(obj.get("androidId") or obj.get("deviceId"))
    device["first_seen"] = iso_or_none(obj.get("firstRegistrationTime") or obj.get("firstSeen"))
    device["last_seen"] = iso_or_none(obj.get("lastUsedTime") or obj.get("lastSeen") or obj.get("lastActivity"))
    for item in obj.get("deviceData") or obj.get("hardware") or []:
        if isinstance(item, dict):
            _apply_field(device, str(item.get("displayName") or item.get("key") or ""), str(item.get("value") or item.get("data") or ""))
    for item in obj.get("userInfo") or obj.get("users") or obj.get("accounts") or []:
        if isinstance(item, dict):
            device["accounts"].extend(extract_emails(" ".join(str(v) for v in item.values())))
        else:
            device["accounts"].extend(extract_emails(item))
    device["accounts"].extend(extract_emails(" ".join(str(v) for v in obj.values() if not isinstance(v, (dict, list)))))
    for key, value in obj.items():
        if isinstance(value, (str, int)):
            _apply_field(device, str(key), str(value))
    device["accounts"] = uniq(device["accounts"])
    imeis = [normalize_imei(v) for v in (obj.get("imei"), obj.get("imei1"), obj.get("imei2"))]
    imeis = [x for x in imeis if x]
    if imeis:
        device["imei1"] = device["imei1"] or imeis[0]
        if len(imeis) > 1:
            device["imei2"] = device["imei2"] or imeis[1]
    return device


def _parse_json(path: Path) -> list[dict]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    except (OSError, json.JSONDecodeError):
        return []
    items = payload if isinstance(payload, list) else [payload]
    devices = []
    for item in items:
        if isinstance(item, dict):
            if "devices" in item and isinstance(item["devices"], list):
                for nested in item["devices"]:
                    if isinstance(nested, dict):
                        devices.append(_from_device_object(nested, path))
            else:
                devices.append(_from_device_object(item, path))
    return devices


def _parse_html(path: Path) -> list[dict]:
    parser = _TableParser()
    try:
        parser.feed(path.read_text(encoding="utf-8", errors="ignore"))
    except OSError:
        return []
    devices: list[dict] = []
    current = _blank_device()
    current["source_file"] = str(path)
    for row in parser.rows:
        if len(row) < 2:
            continue
        label, value = row[0], " | ".join(row[1:])
        if MODEL_LABEL.search(label) and current.get("model") and current.get("imei1"):
            devices.append(current)
            current = _blank_device()
            current["source_file"] = str(path)
        _apply_field(current, label, value)
        current["raw"][label] = value
    current["accounts"] = uniq(current["accounts"])
    if any(current.get(k) for k in ("imei1", "serial_number", "model", "android_id")):
        devices.append(current)
    return devices


def _save_device(case_id: int, device: dict) -> None:
    if not any(device.get(k) for k in ("imei1", "imei2", "serial_number", "model", "android_id")):
        return
    device_id = db.execute(
        """
        INSERT INTO devices(
            case_id, imei1, imei2, model, manufacturer, serial_number, android_id,
            first_seen, last_seen, source_file, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            case_id,
            device.get("imei1"),
            device.get("imei2"),
            device.get("model"),
            device.get("manufacturer"),
            device.get("serial_number"),
            device.get("android_id"),
            device.get("first_seen"),
            device.get("last_seen"),
            device.get("source_file"),
            as_json(device.get("raw") or {}),
        ),
    )
    for email in uniq(device.get("accounts") or []):
        db.execute(
            "INSERT INTO device_accounts(case_id, device_id, account_email) VALUES (?, ?, ?)",
            (case_id, device_id, email),
        )


def ingest_devices(case_id: int, root: Path) -> int:
    before = db.query_one("SELECT COUNT(*) AS n FROM devices WHERE case_id = ?", (case_id,))
    start = int(before["n"] if before else 0)
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        blob = f"{path.name} {path}".lower()
        if not any(
            token in blob
            for token in (
                "deviceanduserprofile",
                "androiddeviceconfiguration",
                "android device",
                "devices.html",
                "device information",
            )
        ):
            continue
        parsed = _parse_json(path) if path.suffix.lower() == ".json" else _parse_html(path)
        for device in parsed:
            _save_device(case_id, device)
    after = db.query_one("SELECT COUNT(*) AS n FROM devices WHERE case_id = ?", (case_id,))
    return int(after["n"] if after else 0) - start
