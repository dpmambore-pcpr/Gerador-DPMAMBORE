"""ANALISADOR GOOGLE FORENSE — aplicação Flask local."""
from __future__ import annotations

import tempfile
from pathlib import Path

from flask import (
    Flask,
    abort,
    jsonify,
    render_template,
    request,
    send_file,
    send_from_directory,
)

from config import HOST, MAX_CONTENT_LENGTH, PORT, SECRET_KEY, ensure_dirs
from modules import correlation, db, importer, ingest, maps, reports, sample
from modules.utils import (
    display_date,
    display_dt,
    display_time,
    from_json,
    iso_or_none,
    now_iso,
    parse_datetime,
    within_window,
)

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = SECRET_KEY
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH


@app.after_request
def _cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


def _active_case():
    case = db.get_case()
    if case is None:
        case_id = db.create_case("Investigação Google LERS")
        case = db.get_case(case_id)
    return case


def _enrich_case(case: dict) -> dict:
    case = dict(case)
    case["crime_date_display"] = display_dt(case.get("crime_date"))
    case["created_display"] = display_dt(case.get("created_at"))
    return case


def _account_view(row: dict) -> dict:
    item = dict(row)
    item["alternate_emails"] = from_json(row.get("alternate_emails"), []) or []
    item["phones"] = from_json(row.get("phones"), []) or []
    item["created_display"] = display_dt(row.get("created_on"))
    item["last_activity_display"] = display_dt(row.get("last_activity"))
    item["deletion_display"] = display_dt(row.get("deletion_date"))
    return item


@app.route("/")
def home():
    return render_template("app.html", case=_enrich_case(_active_case()))


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "name": "ANALISADOR GOOGLE FORENSE", "time": now_iso()})


@app.get("/api/case")
def api_case():
    case = _enrich_case(_active_case())
    case["counts"] = db.counts(case["id"])
    return jsonify(case)


@app.post("/api/case")
def api_new_case():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or request.form.get("name") or "Nova investigação").strip()
    case_id = db.create_case(name)
    return jsonify(_enrich_case(db.get_case(case_id)))


@app.post("/api/case/crime-date")
def api_crime_date():
    case = _active_case()
    payload = request.get_json(silent=True) or {}
    raw = payload.get("crime_date") or request.form.get("crime_date")
    window = int(payload.get("window_hours") or request.form.get("window_hours") or case.get("crime_window_hours") or 24)
    iso = iso_or_none(raw) if raw else None
    db.update_crime_date(case["id"], iso, window)
    return jsonify(_enrich_case(db.get_case(case["id"])))


@app.post("/api/import")
def api_import():
    case = _active_case()
    files = request.files.getlist("files") or request.files.getlist("file")
    if not files:
        return jsonify({"error": "Selecione ao menos um arquivo ZIP."}), 400
    results = []
    for storage in files:
        if not storage or not storage.filename:
            continue
        suffix = Path(storage.filename).suffix or ".zip"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            storage.save(tmp.name)
            tmp_path = Path(tmp.name)
        try:
            imported = importer.import_zip(case["id"], tmp_path, storage.filename)
            analysis = {}
            if not imported.get("already_imported"):
                analysis = ingest.analyze_import(case["id"], imported["extract_path"])
            imported["analysis"] = analysis
            results.append(imported)
        finally:
            tmp_path.unlink(missing_ok=True)
    if not results:
        return jsonify({"error": "Nenhum ZIP válido foi importado."}), 400
    return jsonify({"ok": True, "imports": results, "case": _enrich_case(db.get_case(case["id"]))})


@app.post("/api/demo")
def api_demo():
    case = _active_case()
    dest = Path(tempfile.gettempdir()) / f"lers_demo_{case['id']}.zip"
    sample.build_sample_zip(dest)
    imported = importer.import_zip(case["id"], dest, "Google_LERS_Producao_DEMO.zip")
    analysis = {}
    if not imported.get("already_imported"):
        analysis = ingest.analyze_import(case["id"], imported["extract_path"])
        db.update_crime_date(case["id"], iso_or_none(sample.CRIME_ISO), 24)
    dest.unlink(missing_ok=True)
    return jsonify(
        {
            "ok": True,
            "demo": True,
            "import": imported,
            "analysis": analysis,
            "case": _enrich_case(db.get_case(case["id"])),
        }
    )


@app.get("/api/dashboard")
def api_dashboard():
    case = _active_case()
    accounts = [_account_view(a) for a in db.query("SELECT * FROM accounts WHERE case_id = ?", (case["id"],))]
    products = db.query("SELECT * FROM products WHERE case_id = ? ORDER BY product_name", (case["id"],))
    imports = db.query("SELECT * FROM imports WHERE case_id = ? ORDER BY id DESC", (case["id"],))
    for item in imports:
        item["imported_display"] = display_dt(item.get("imported_at"))
        item["size_mb"] = round((item.get("size_bytes") or 0) / (1024 * 1024), 2)
    alerts = correlation.multi_account_imei_alerts(case["id"])
    return jsonify(
        {
            "case": _enrich_case(case),
            "accounts": accounts,
            "products": products,
            "imports": imports,
            "counts": db.counts(case["id"]),
            "alerts": alerts,
        }
    )


@app.get("/api/devices")
def api_devices():
    case = _active_case()
    devices = db.query("SELECT * FROM devices WHERE case_id = ?", (case["id"],))
    links = db.query("SELECT * FROM device_accounts WHERE case_id = ?", (case["id"],))
    by_dev = {}
    for row in links:
        by_dev.setdefault(row["device_id"], []).append(row["account_email"])
    out = []
    for device in devices:
        item = dict(device)
        item["accounts"] = sorted(set(by_dev.get(device["id"], [])))
        item["first_display"] = display_dt(device.get("first_seen"))
        item["last_display"] = display_dt(device.get("last_seen"))
        item["multi_account"] = len(item["accounts"]) > 1
        out.append(item)
    return jsonify({"devices": out, "alerts": correlation.multi_account_imei_alerts(case["id"])})


@app.get("/api/events")
def api_events():
    case = _active_case()
    start = iso_or_none(request.args.get("from"))
    end = iso_or_none(request.args.get("to"))
    rows = db.query("SELECT * FROM events WHERE case_id = ? ORDER BY ts IS NULL, ts", (case["id"],))
    out = []
    for row in rows:
        ts = parse_datetime(row.get("ts"))
        if start and ts and ts < parse_datetime(start):
            continue
        if end and ts and ts > parse_datetime(end):
            continue
        item = dict(row)
        item["date"] = display_date(row.get("ts"))
        item["time"] = display_time(row.get("ts"))
        item["datetime"] = display_dt(row.get("ts"))
        out.append(item)
    return jsonify({"events": out, "total": len(out)})


@app.get("/api/locations")
def api_locations():
    case = _active_case()
    crime = request.args.get("crime_date") or case.get("crime_date")
    window = int(request.args.get("window_hours") or case.get("crime_window_hours") or 24)
    near_only = request.args.get("near_crime") in ("1", "true", "yes")
    rows = db.query("SELECT * FROM locations WHERE case_id = ? ORDER BY ts IS NULL, ts", (case["id"],))
    out = []
    for row in rows:
        item = dict(row)
        item["datetime"] = display_dt(row.get("ts"))
        item["date"] = display_date(row.get("ts"))
        item["time"] = display_time(row.get("ts"))
        item["permanencia"] = int(row["duration_seconds"] // 60) if row.get("duration_seconds") else None
        item["near_crime"] = bool(crime) and within_window(row.get("ts"), crime, window)
        if near_only and not item["near_crime"]:
            continue
        out.append(item)
    return jsonify({"locations": out, "crime_date": crime, "window_hours": window})


@app.get("/api/map")
def api_map():
    case = _active_case()
    html = maps.build_map(
        case["id"],
        request.args.get("crime_date") or case.get("crime_date"),
        int(request.args.get("window_hours") or case.get("crime_window_hours") or 24),
    )
    return html, 200, {"Content-Type": "text/html; charset=utf-8"}


@app.get("/api/photos")
def api_photos():
    case = _active_case()
    near = request.args.get("near_crime") in ("1", "true", "yes")
    gps = request.args.get("with_gps") in ("1", "true", "yes")
    crime = case.get("crime_date")
    window = int(case.get("crime_window_hours") or 24)
    rows = db.query("SELECT * FROM photos WHERE case_id = ? ORDER BY taken_at IS NULL, taken_at", (case["id"],))
    out = []
    for row in rows:
        if gps and not row.get("has_gps"):
            continue
        item = dict(row)
        item["datetime"] = display_dt(row.get("taken_at"))
        item["date"] = display_date(row.get("taken_at"))
        item["exif"] = from_json(row.get("exif_json"), {}) or {}
        item["near_crime"] = bool(crime) and within_window(row.get("taken_at"), crime, window)
        if near and not item["near_crime"]:
            continue
        out.append(item)
    return jsonify({"photos": out})


@app.get("/api/photos/<int:photo_id>/thumb")
def api_photo_thumb(photo_id: int):
    row = db.query_one("SELECT * FROM photos WHERE id = ?", (photo_id,))
    if not row:
        abort(404)
    path = Path(row["thumbnail_path"] or row["stored_path"] or "")
    if not path.exists():
        abort(404)
    return send_file(path, mimetype="image/jpeg")


@app.get("/api/photos/<int:photo_id>/file")
def api_photo_file(photo_id: int):
    row = db.query_one("SELECT * FROM photos WHERE id = ?", (photo_id,))
    if not row or not row.get("stored_path") or not Path(row["stored_path"]).exists():
        abort(404)
    return send_file(row["stored_path"], as_attachment=False)


@app.get("/api/files")
def api_files():
    case = _active_case()
    q = (request.args.get("q") or "").strip()
    rows = db.query("SELECT * FROM files WHERE case_id = ? ORDER BY name", (case["id"],))
    out = []
    for row in rows:
        item = dict(row)
        item["keywords"] = from_json(row.get("keywords_hit"), []) or []
        item["created_display"] = display_dt(row.get("created_at"))
        item["modified_display"] = display_dt(row.get("modified_at"))
        blob = " ".join(
            [
                item.get("name") or "",
                item.get("owner") or "",
                " ".join(item["keywords"]),
            ]
        )
        if q and q.lower() not in blob.lower() and q.upper() not in item["keywords"]:
            continue
        out.append(item)
    return jsonify({"files": out, "keywords": ["PIX", "CPF", "BANCO", "ARMA", "DROGA", "NOME", "TELEFONE", "VALOR"]})


@app.get("/api/emails")
def api_emails():
    case = _active_case()
    q = (request.args.get("q") or "").strip().lower()
    rows = db.query("SELECT * FROM emails WHERE case_id = ? ORDER BY date IS NULL, date DESC", (case["id"],))
    out = []
    for row in rows:
        item = dict(row)
        item["datetime"] = display_dt(row.get("date"))
        item["headers"] = from_json(row.get("headers_json"), {}) or {}
        if q:
            blob = " ".join(
                [
                    item.get("sender") or "",
                    item.get("recipients") or "",
                    item.get("subject") or "",
                    item.get("body") or "",
                    item.get("ip_address") or "",
                    item.get("message_id") or "",
                ]
            ).lower()
            if q not in blob:
                continue
        out.append(item)
    return jsonify({"emails": out})


@app.get("/api/payments")
def api_payments():
    case = _active_case()
    rows = db.query("SELECT * FROM payments WHERE case_id = ? ORDER BY ts IS NULL, ts DESC", (case["id"],))
    out = []
    for row in rows:
        item = dict(row)
        item["datetime"] = display_dt(row.get("ts"))
        item["extra"] = from_json(row.get("extra_json"), {}) or {}
        out.append(item)
    return jsonify({"payments": out})


@app.get("/api/searches")
def api_searches():
    case = _active_case()
    rows = db.query("SELECT * FROM searches WHERE case_id = ? ORDER BY ts IS NULL, ts DESC", (case["id"],))
    out = []
    for row in rows:
        item = dict(row)
        item["date"] = display_date(row.get("ts"))
        item["time"] = display_time(row.get("ts"))
        item["datetime"] = display_dt(row.get("ts"))
        out.append(item)
    return jsonify({"searches": out})


@app.get("/api/whatsapp")
def api_whatsapp():
    case = _active_case()
    rows = db.query("SELECT * FROM whatsapp_backups WHERE case_id = ?", (case["id"],))
    out = []
    for row in rows:
        item = dict(row)
        item["datetime"] = display_dt(row.get("backup_date"))
        item["size_mb"] = round((row.get("size_bytes") or 0) / (1024 * 1024), 3)
        out.append(item)
    return jsonify({"backups": out})


@app.get("/api/correlation")
def api_correlation():
    case = _active_case()
    return jsonify(correlation.graph(case["id"]))


@app.get("/api/report/docx")
def api_report_docx():
    case = _active_case()
    path = reports.generate_docx(case["id"])
    return send_file(path, as_attachment=True, download_name=path.name)


@app.get("/api/report/pdf")
def api_report_pdf():
    case = _active_case()
    path = reports.generate_pdf(case["id"])
    return send_file(path, as_attachment=True, download_name=path.name)


@app.get("/brasao")
def brasao():
    root = Path(__file__).resolve().parent.parent
    for name in ("brasao-padrao.png", "favicon.png"):
        candidate = root / name
        if candidate.exists():
            return send_from_directory(root, name)
    abort(404)


def main():
    ensure_dirs()
    db.init_db()
    app.run(host=HOST, port=PORT, debug=False)


if __name__ == "__main__":
    main()
