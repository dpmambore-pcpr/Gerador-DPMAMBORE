"""Configuração local do Analisador Google Forense."""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
EXTRACT_DIR = DATA_DIR / "extracted"
MEDIA_DIR = DATA_DIR / "media"
REPORT_DIR = DATA_DIR / "reports"
DB_DIR = DATA_DIR / "db"
DB_PATH = DB_DIR / "forense.sqlite"

SECRET_KEY = "pcpr-analisador-google-forense-local"
MAX_CONTENT_LENGTH = 8 * 1024 * 1024 * 1024  # 8 GB
DISPLAY_TZ = "America/Sao_Paulo"
HOST = "0.0.0.0"
PORT = 5050

DRIVE_KEYWORDS = [
    "PIX",
    "CPF",
    "BANCO",
    "ARMA",
    "DROGA",
    "NOME",
    "TELEFONE",
    "VALOR",
]

PRODUCT_LABELS = {
    "account": "Conta Google / Assinante",
    "android_device": "Android Device Configuration",
    "gmail": "Gmail (MBOX)",
    "photos": "Google Photos",
    "maps": "Google Maps / Histórico de localização",
    "drive": "Google Drive",
    "pay": "Google Pay / Carteira",
    "search": "Google Search / My Activity",
    "whatsapp": "Backup WhatsApp (Google Drive)",
    "youtube": "YouTube",
    "chrome": "Chrome",
    "play": "Google Play",
    "hangouts": "Hangouts / Chat",
    "contacts": "Contatos",
    "calendar": "Agenda",
    "keep": "Google Keep",
    "activity": "My Activity",
    "unknown": "Arquivos não classificados",
}


def ensure_dirs() -> None:
    for path in (DATA_DIR, UPLOAD_DIR, EXTRACT_DIR, MEDIA_DIR, REPORT_DIR, DB_DIR):
        path.mkdir(parents=True, exist_ok=True)
