"""Orquestra a extração analítica após a importação do ZIP."""
from __future__ import annotations

from pathlib import Path

from modules import db
from modules.parsers.account import ingest_accounts
from modules.parsers.activity import ingest_activity
from modules.parsers.devices import ingest_devices
from modules.parsers.drive import ingest_drive
from modules.parsers.gmail import ingest_gmail
from modules.parsers.location import ingest_locations
from modules.parsers.payments import ingest_payments
from modules.parsers.photos import ingest_photos
from modules.parsers.whatsapp import ingest_whatsapp


def analyze_import(case_id: int, extract_path: str | Path) -> dict:
    root = Path(extract_path)
    accounts = ingest_accounts(case_id, root)
    hint = None
    row = db.query_one(
        "SELECT primary_email FROM accounts WHERE case_id = ? ORDER BY id LIMIT 1",
        (case_id,),
    )
    if row:
        hint = row.get("primary_email")
    result = {
        "accounts": accounts,
        "devices": ingest_devices(case_id, root),
        "locations": ingest_locations(case_id, root),
        "photos": ingest_photos(case_id, root),
        "files": ingest_drive(case_id, root),
        "emails": ingest_gmail(case_id, root),
        "payments": ingest_payments(case_id, root),
        "whatsapp": ingest_whatsapp(case_id, root, hint),
    }
    events, searches = ingest_activity(case_id, root)
    result["activity_events"] = events
    result["searches"] = searches
    db.execute("UPDATE imports SET status = ? WHERE extract_path = ?", ("analyzed", str(root)))
    db.touch_case(case_id)
    return result
