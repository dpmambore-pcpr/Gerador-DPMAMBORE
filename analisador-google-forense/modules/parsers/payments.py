"""Google Pay: cartões, perfis e transações."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from modules import db
from modules.utils import as_json, iso_or_none


def _save(case_id: int, kind: str, description, amount, currency, ts, transaction_id, extra, source):
    db.execute(
        """
        INSERT INTO payments(
            case_id, kind, description, amount, currency, ts, transaction_id, extra_json, source_file
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            case_id,
            kind,
            description,
            None if amount is None else str(amount),
            currency,
            iso_or_none(ts),
            transaction_id,
            as_json(extra) if extra is not None else None,
            str(source),
        ),
    )
    if kind == "purchase":
        db.execute(
            """
            INSERT INTO events(
                case_id, ts, event_type, product, device_ref, description, source_file, lat, lon, extra_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                case_id,
                iso_or_none(ts),
                "pagamento",
                "Google Pay",
                None,
                f"{description or 'Compra'} {amount or ''}".strip(),
                str(source),
                None,
                None,
                as_json({"transaction_id": transaction_id}),
            ),
        )


def _ingest_csv(case_id: int, path: Path) -> int:
    try:
        frame = pd.read_csv(path, dtype=str).fillna("")
    except Exception:
        return 0
    count = 0
    columns = {c.lower().strip(): c for c in frame.columns}

    def col(*names):
        for name in names:
            if name in columns:
                return columns[name]
        return None

    desc_c = col("description", "merchant", "estabelecimento", "details", "title")
    amount_c = col("amount", "valor", "transaction amount")
    curr_c = col("currency", "moeda")
    date_c = col("date", "data", "transaction date", "time")
    id_c = col("transaction id", "id", "transaction_id", "gst")
    kind_c = col("type", "kind", "transaction type")
    for _, row in frame.iterrows():
        payload = {k: row[k] for k in frame.columns}
        _save(
            case_id,
            (str(row[kind_c]).lower() if kind_c else "purchase") or "purchase",
            row[desc_c] if desc_c else path.name,
            row[amount_c] if amount_c else None,
            row[curr_c] if curr_c else "BRL",
            row[date_c] if date_c else None,
            row[id_c] if id_c else None,
            payload,
            path,
        )
        count += 1
    return count


def _ingest_json(case_id: int, path: Path) -> int:
    try:
        payload = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    except (OSError, json.JSONDecodeError):
        return 0
    count = 0
    items = payload if isinstance(payload, list) else payload.get("items") or payload.get("instruments") or payload.get("transactions") or [payload]
    if not isinstance(items, list):
        items = [payload]
    filename = path.name.lower()
    for item in items:
        if not isinstance(item, dict):
            continue
        if "card" in filename or "payment method" in filename or item.get("cardNumber") or item.get("last4"):
            last4 = item.get("last4") or item.get("cardNumber") or item.get("maskedNumber")
            _save(case_id, "card", f"Cartão {item.get('network') or ''} ****{last4}".strip(), None, None, item.get("created"), item.get("id"), item, path)
        elif "profile" in filename or item.get("profileName"):
            _save(case_id, "profile", item.get("profileName") or item.get("name") or "Perfil de pagamento", None, None, item.get("created"), item.get("id"), item, path)
        else:
            _save(
                case_id,
                "purchase",
                item.get("description") or item.get("merchant") or item.get("title"),
                item.get("amount") or item.get("value"),
                item.get("currency") or "BRL",
                item.get("date") or item.get("timestamp") or item.get("time"),
                item.get("transactionId") or item.get("id"),
                item,
                path,
            )
        count += 1
    return count


def ingest_payments(case_id: int, root: Path) -> int:
    total = 0
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        blob = str(path).lower()
        if not any(token in blob for token in ("google pay", "googlepay", "google wallet", "/pay/")):
            continue
        if path.suffix.lower() == ".csv":
            total += _ingest_csv(case_id, path)
        elif path.suffix.lower() == ".json":
            total += _ingest_json(case_id, path)
    return total
