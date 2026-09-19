"""Correlação investigativa entre conta, IMEI, localização, arquivos e eventos."""
from __future__ import annotations

from collections import defaultdict

from modules import db
from modules.utils import from_json, normalize_imei


def multi_account_imei_alerts(case_id: int) -> list[dict]:
    devices = db.query("SELECT * FROM devices WHERE case_id = ?", (case_id,))
    links = db.query("SELECT * FROM device_accounts WHERE case_id = ?", (case_id,))
    by_device: dict[int, list[str]] = defaultdict(list)
    for row in links:
        by_device[int(row["device_id"])].append(row["account_email"])
    by_imei: dict[str, dict] = {}
    for device in devices:
        emails = sorted(set(by_device.get(int(device["id"]), [])))
        for key in ("imei1", "imei2"):
            imei = normalize_imei(device.get(key)) or device.get(key)
            if not imei:
                continue
            bucket = by_imei.setdefault(
                imei,
                {"imei": imei, "accounts": set(), "devices": [], "models": set()},
            )
            bucket["accounts"].update(emails)
            bucket["devices"].append(device["id"])
            if device.get("model"):
                bucket["models"].add(device["model"])
    alerts = []
    for imei, bucket in by_imei.items():
        accounts = sorted(bucket["accounts"])
        if len(accounts) >= 2:
            alerts.append(
                {
                    "alert": "Mesmo aparelho vinculado a múltiplas contas",
                    "imei": imei,
                    "accounts": accounts,
                    "device_ids": bucket["devices"],
                    "models": sorted(bucket["models"]),
                }
            )
    return alerts


def graph(case_id: int) -> dict:
    case = db.get_case(case_id) or {}
    accounts = db.query("SELECT * FROM accounts WHERE case_id = ?", (case_id,))
    devices = db.query("SELECT * FROM devices WHERE case_id = ?", (case_id,))
    links = db.query("SELECT * FROM device_accounts WHERE case_id = ?", (case_id,))
    locations = db.query("SELECT id, ts, lat, lon, place_name FROM locations WHERE case_id = ? LIMIT 400", (case_id,))
    photos = db.query("SELECT id, filename, taken_at, lat, lon FROM photos WHERE case_id = ? LIMIT 200", (case_id,))
    files = db.query("SELECT id, name, keywords_hit FROM files WHERE case_id = ?", (case_id,))
    payments = db.query("SELECT id, kind, description, amount, ts FROM payments WHERE case_id = ?", (case_id,))
    events = db.query(
        "SELECT id, ts, event_type, product, description FROM events WHERE case_id = ? ORDER BY ts LIMIT 200",
        (case_id,),
    )
    nodes = []
    edges = []

    def add_node(nid, label, group, detail=""):
        nodes.append({"id": nid, "label": label, "group": group, "detail": detail})

    add_node("root", "CONTA GOOGLE", "root", case.get("name") or "Caso")
    for acc in accounts:
        nid = f"acc-{acc['id']}"
        add_node(nid, acc.get("primary_email") or acc.get("google_account") or "Conta", "account", acc.get("display_name") or "")
        edges.append({"from": "root", "to": nid, "label": "conta"})
    for device in devices:
        nid = f"dev-{device['id']}"
        label = device.get("model") or device.get("imei1") or f"Dispositivo {device['id']}"
        detail = " / ".join(x for x in (device.get("imei1"), device.get("imei2")) if x)
        add_node(nid, label, "imei", detail)
        edges.append({"from": "root", "to": nid, "label": "IMEI"})
    by_dev = defaultdict(list)
    for row in links:
        by_dev[int(row["device_id"])].append(row["account_email"])
        acc_node = next((a for a in accounts if (a.get("primary_email") or "").lower() == row["account_email"].lower()), None)
        if acc_node:
            edges.append({"from": f"acc-{acc_node['id']}", "to": f"dev-{row['device_id']}", "label": "vinculado"})
        else:
            nid = f"accx-{row['account_email']}"
            add_node(nid, row["account_email"], "account")
            edges.append({"from": nid, "to": f"dev-{row['device_id']}", "label": "vinculado"})
    loc_node = "loc-group"
    add_node(loc_node, "LOCALIZAÇÃO", "location", f"{len(locations)} pontos")
    edges.append({"from": "root", "to": loc_node, "label": "mapa"})
    for loc in locations[:12]:
        nid = f"loc-{loc['id']}"
        add_node(nid, loc.get("place_name") or f"{loc['lat']:.4f},{loc['lon']:.4f}", "location")
        edges.append({"from": loc_node, "to": nid})
        if devices:
            edges.append({"from": f"dev-{devices[0]['id']}", "to": nid, "label": "posição"})
    photo_node = "photo-group"
    add_node(photo_node, "FOTOS", "photo", f"{len(photos)} arquivos")
    edges.append({"from": loc_node, "to": photo_node, "label": "GPS"})
    for photo in photos[:10]:
        nid = f"photo-{photo['id']}"
        add_node(nid, photo["filename"], "photo")
        edges.append({"from": photo_node, "to": nid})
        if photo.get("lat"):
            edges.append({"from": loc_node, "to": nid, "label": "EXIF"})
    file_node = "file-group"
    add_node(file_node, "ARQUIVOS", "file")
    edges.append({"from": "root", "to": file_node})
    for item in files:
        hits = from_json(item.get("keywords_hit"), []) or []
        if not hits:
            continue
        nid = f"file-{item['id']}"
        add_node(nid, item["name"], "file", ", ".join(hits))
        edges.append({"from": file_node, "to": nid, "label": "palavra-chave"})
    pay_node = "pay-group"
    add_node(pay_node, "PAGAMENTOS", "payment")
    edges.append({"from": "root", "to": pay_node})
    for pay in payments[:12]:
        nid = f"pay-{pay['id']}"
        add_node(nid, pay.get("description") or pay.get("kind"), "payment", str(pay.get("amount") or ""))
        edges.append({"from": pay_node, "to": nid})
    ev_node = "event-group"
    add_node(ev_node, "EVENTOS", "event")
    edges.append({"from": photo_node, "to": ev_node})
    edges.append({"from": pay_node, "to": ev_node})
    edges.append({"from": file_node, "to": ev_node})
    for ev in events[:15]:
        nid = f"ev-{ev['id']}"
        add_node(nid, (ev.get("description") or ev.get("event_type") or "")[:48], "event", ev.get("product") or "")
        edges.append({"from": ev_node, "to": nid})
    return {
        "nodes": nodes,
        "edges": edges,
        "alerts": multi_account_imei_alerts(case_id),
        "chain": ["CONTA GOOGLE", "IMEI", "LOCALIZAÇÃO", "FOTOS", "ARQUIVOS", "PAGAMENTOS", "EVENTOS"],
    }
