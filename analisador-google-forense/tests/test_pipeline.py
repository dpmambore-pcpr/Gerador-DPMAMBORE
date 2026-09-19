"""Testes do pipeline forense com produção Google LERS fictícia."""
from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config import BASE_DIR  # noqa: E402
from modules import correlation, db, importer, ingest, reports, sample  # noqa: E402
from modules.parsers import photos as photos_mod  # noqa: E402
from modules.utils import file_hashes, luhn_ok  # noqa: E402
import config as app_config  # noqa: E402


class PipelineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="forense-test-"))
        uploads = cls.tmp / "uploads"
        extracted = cls.tmp / "extracted"
        media = cls.tmp / "media"
        reports_dir = cls.tmp / "reports"
        db_path = cls.tmp / "forense.sqlite"
        for path in (uploads, extracted, media, reports_dir):
            path.mkdir(parents=True, exist_ok=True)
        app_config.UPLOAD_DIR = uploads
        app_config.EXTRACT_DIR = extracted
        app_config.MEDIA_DIR = media
        app_config.REPORT_DIR = reports_dir
        app_config.DB_PATH = db_path
        db.DB_PATH = db_path
        importer.UPLOAD_DIR = uploads
        importer.EXTRACT_DIR = extracted
        reports.REPORT_DIR = reports_dir
        photos_mod.MEDIA_DIR = media
        db.init_db()
        cls.case_id = db.create_case("Caso de teste LERS")
        cls.zip_path = cls.tmp / "Google_LERS_Producao_DEMO.zip"
        sample.build_sample_zip(cls.zip_path)
        cls.imported = importer.import_zip(cls.case_id, cls.zip_path, "Google_LERS_Producao_DEMO.zip")
        cls.analysis = ingest.analyze_import(cls.case_id, cls.imported["extract_path"])
        db.update_crime_date(cls.case_id, sample.CRIME_ISO, 24)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_original_zip_not_modified(self):
        original = file_hashes(self.zip_path)
        stored = Path(self.imported["stored_path"])
        self.assertTrue(stored.exists())
        self.assertEqual(original["sha256"], self.imported["hashes"]["sha256"])
        self.assertEqual(original["sha256"], file_hashes(stored)["sha256"])
        self.assertNotEqual(stored.resolve(), self.zip_path.resolve())

    def test_products_detected(self):
        keys = {row["product_key"] for row in db.query("SELECT product_key FROM products WHERE case_id = ?", (self.case_id,))}
        for expected in ("account", "android_device", "gmail", "photos", "maps", "drive", "pay", "search", "whatsapp"):
            self.assertIn(expected, keys, f"produto ausente: {expected}")

    def test_account_dashboard_fields(self):
        acc = db.query_one("SELECT * FROM accounts WHERE case_id = ?", (self.case_id,))
        self.assertIsNotNone(acc)
        self.assertIn("joao.silva.investigado@gmail.com", acc["primary_email"])
        self.assertIn("João", acc["display_name"])
        self.assertIn("jcsilva.alt@gmail.com", acc["alternate_emails"])
        self.assertIn("99999", acc["phones"])
        self.assertTrue(acc["created_on"])
        self.assertTrue(acc["last_activity"])
        self.assertEqual(acc["status"], "Ativa")

    def test_imei_multi_account_alert(self):
        devices = db.query("SELECT * FROM devices WHERE case_id = ?", (self.case_id,))
        self.assertGreaterEqual(len(devices), 2)
        for device in devices:
            if device.get("imei1"):
                self.assertTrue(luhn_ok(device["imei1"]))
        alerts = correlation.multi_account_imei_alerts(self.case_id)
        self.assertTrue(alerts)
        self.assertIn("maria.oliveira.alt@gmail.com", " ".join(alerts[0]["accounts"]))
        self.assertEqual(alerts[0]["alert"], "Mesmo aparelho vinculado a múltiplas contas")

    def test_timeline_and_search(self):
        events = db.query("SELECT * FROM events WHERE case_id = ?", (self.case_id,))
        searches = db.query("SELECT * FROM searches WHERE case_id = ?", (self.case_id,))
        self.assertGreaterEqual(len(events), 5)
        self.assertTrue(any("PIX" in (s.get("query") or "") for s in searches))

    def test_locations_photos_files_mail_pay_whatsapp(self):
        self.assertGreaterEqual(self.analysis["locations"], 4)
        self.assertGreaterEqual(self.analysis["photos"], 2)
        photos = db.query("SELECT * FROM photos WHERE case_id = ?", (self.case_id,))
        self.assertTrue(any(p["has_gps"] for p in photos))
        files = db.query("SELECT * FROM files WHERE case_id = ?", (self.case_id,))
        self.assertTrue(any("PIX" in (f.get("keywords_hit") or "") for f in files))
        emails = db.query("SELECT * FROM emails WHERE case_id = ?", (self.case_id,))
        self.assertGreaterEqual(len(emails), 3)
        self.assertTrue(any(e.get("ip_address") for e in emails))
        self.assertTrue(any(e.get("message_id") for e in emails))
        payments = db.query("SELECT * FROM payments WHERE case_id = ?", (self.case_id,))
        self.assertGreaterEqual(len(payments), 3)
        wa = db.query("SELECT * FROM whatsapp_backups WHERE case_id = ?", (self.case_id,))
        self.assertTrue(wa)
        self.assertTrue(wa[0]["encrypted"])
        self.assertIn("não tenta quebrar", wa[0]["note"].lower())

    def test_nested_zip_reaches_final_files(self):
        import zipfile
        wrap1 = self.tmp / "produto.zip"
        wrap0 = self.tmp / "principal.zip"
        with zipfile.ZipFile(wrap1, "w") as zf:
            zf.write(self.zip_path, "subpasta/outro.zip")
        with zipfile.ZipFile(wrap0, "w") as zf:
            zf.write(wrap1, "produto.zip")
        case_id = db.create_case("Produção aninhada")
        imported = importer.import_zip(case_id, wrap0, "principal.zip")
        extract = Path(imported["extract_path"])
        finals = [p for p in extract.rglob("*") if p.is_file() and p.suffix.lower() != ".zip"]
        names = " ".join(p.name.lower() for p in finals)
        self.assertGreaterEqual(len(finals), 8, "extração recursiva não chegou aos arquivos finais")
        self.assertTrue("subscriberinfo" in names or "profile.json" in names)
        self.assertGreaterEqual(imported["file_count"], 3)

    def test_reports(self):
        docx = reports.generate_docx(self.case_id)
        pdf = reports.generate_pdf(self.case_id)
        self.assertTrue(docx.exists() and docx.stat().st_size > 1000)
        self.assertTrue(pdf.exists() and pdf.stat().st_size > 1000)
        graph = correlation.graph(self.case_id)
        self.assertEqual(graph["chain"][0], "CONTA GOOGLE")
        self.assertGreaterEqual(len(graph["nodes"]), 6)


if __name__ == "__main__":
    unittest.main()
