"""Gera uma produção Google LERS/Takeout fictícia para demonstração e testes."""
from __future__ import annotations

import json
import struct
import zipfile
from datetime import datetime, timezone
from email.message import EmailMessage
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw

from modules.utils import luhn_ok

CRIME_ISO = "2024-09-10T21:30:00-03:00"


def imei_with_luhn(body14: str) -> str:
    for d in "0123456789":
        candidate = body14 + d
        if luhn_ok(candidate):
            return candidate
    raise ValueError("IMEI inválido")


def _jpeg_with_gps(lat: float, lon: float, taken: datetime, label: str) -> bytes:
    img = Image.new("RGB", (960, 640), (24, 48, 40))
    draw = ImageDraw.Draw(img)
    draw.rectangle((40, 40, 920, 600), outline=(197, 162, 83), width=4)
    draw.text((70, 80), "PCPR — AMOSTRA FORENSE", fill=(197, 162, 83))
    draw.text((70, 130), label, fill=(240, 240, 230))
    draw.text((70, 180), taken.strftime("%d/%m/%Y %H:%M:%S"), fill=(180, 200, 190))
    draw.text((70, 230), f"GPS {lat:.5f}, {lon:.5f}", fill=(180, 200, 190))
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    jpeg = buf.getvalue()
    exif = _exif_app1(lat, lon, taken)
    # injeta APP1 após o SOI
    return jpeg[:2] + exif + jpeg[2:]


def _rational(num: float, den: int = 10000) -> tuple[int, int]:
    return int(round(num * den)), den


def _deg_to_dms(deg: float) -> tuple[tuple[int, int], tuple[int, int], tuple[int, int]]:
    absd = abs(deg)
    d = int(absd)
    m_float = (absd - d) * 60
    m = int(m_float)
    s = (m_float - m) * 60
    return ((d, 1), (m, 1), _rational(s, 10000))


def _exif_app1(lat: float, lon: float, taken: datetime) -> bytes:
    """Monta um bloco EXIF mínimo com GPS e DateTimeOriginal."""
    dt = taken.strftime("%Y:%m:%d %H:%M:%S").encode("ascii")

    def pack_ifd(entries: list[bytes], next_off: int = 0) -> bytes:
        body = struct.pack("<H", len(entries)) + b"".join(entries) + struct.pack("<I", next_off)
        return body

    def entry(tag: int, typ: int, count: int, value_or_off: int) -> bytes:
        return struct.pack("<HHII", tag, typ, count, value_or_off)

    # Layout:
    # TIFF header 8 bytes
    # IFD0 (DateTime ASCII + GPSOffset + ExifOffset)
    # data DateTime
    # GPS IFD
    # GPS rationals
    # Exif IFD (DateTimeOriginal)
    tiff = BytesIO()
    tiff.write(b"II*\x00" + struct.pack("<I", 8))
    # Reservamos offsets depois. Construção linear:
    # IFD0 at 8, 3 entries = 2+12*3+4 = 42, ends at 50
    datetime_off = 50
    gps_ifd_off = datetime_off + 20  # 19 chars + NUL padded to 20
    # GPS IFD: 4 entries -> 2+48+4=54, then 4 rationals * 8 = 96 for lat/lon
    gps_data_off = gps_ifd_off + 2 + 12 * 4 + 4
    exif_ifd_off = gps_data_off + 8 * 6
    # Exif IFD 1 entry DateTimeOriginal pointing to datetime_off

    ifd0 = pack_ifd(
        [
            entry(0x0132, 2, 20, datetime_off),  # DateTime
            entry(0x8825, 4, 1, gps_ifd_off),  # GPSInfo
            entry(0x8769, 4, 1, exif_ifd_off),  # ExifIFD
        ]
    )
    tiff.write(ifd0)
    tiff.write(dt + b"\x00")
    # pad to 20
    tiff.write(b"\x00" * (20 - (len(dt) + 1)))

    lat_ref = b"S\x00\x00\x00" if lat < 0 else b"N\x00\x00\x00"
    lon_ref = b"W\x00\x00\x00" if lon < 0 else b"E\x00\x00\x00"
    lat_dms = _deg_to_dms(lat)
    lon_dms = _deg_to_dms(lon)
    lat_off = gps_data_off
    lon_off = gps_data_off + 24
    gps_ifd = pack_ifd(
        [
            entry(1, 2, 2, struct.unpack("<I", lat_ref)[0]),  # GPSLatitudeRef inline
            entry(2, 5, 3, lat_off),  # GPSLatitude
            entry(3, 2, 2, struct.unpack("<I", lon_ref)[0]),
            entry(4, 5, 3, lon_off),
        ]
    )
    tiff.write(gps_ifd)
    for triple in (lat_dms, lon_dms):
        for num, den in triple:
            tiff.write(struct.pack("<II", num, den))

    exif_ifd = pack_ifd([entry(0x9003, 2, 20, datetime_off)])  # DateTimeOriginal
    tiff.write(exif_ifd)
    payload = tiff.getvalue()
    app1 = b"Exif\x00\x00" + payload
    return b"\xff\xe1" + struct.pack(">H", len(app1) + 2) + app1


def _mbox_bytes() -> bytes:
    messages = []
    specs = [
        {
            "from": "banco.alertas@bancoexemplo.com.br",
            "to": "joao.silva.investigado@gmail.com",
            "subj": "Comprovante PIX no valor de R$ 4.800,00",
            "date": "Tue, 10 Sep 2024 18:12:11 -0300",
            "msgid": "<pix-4800@bancoexemplo.com.br>",
            "ip": "200.152.44.18",
            "body": "Transferência PIX realizada. CPF 123.456.789-09. Valor R$ 4.800,00. Banco Exemplo.",
        },
        {
            "from": "maria.oliveira.alt@gmail.com",
            "to": "joao.silva.investigado@gmail.com",
            "subj": "Encontro no centro",
            "date": "Tue, 10 Sep 2024 20:41:02 -0300",
            "msgid": "<meet-centro@gmail.com>",
            "ip": "187.45.12.90",
            "body": "Estou no centro de Curitiba. Leva o telefone que combinamos.",
        },
        {
            "from": "lojavirtual@shop.com",
            "to": "joao.silva.investigado@gmail.com",
            "subj": "Pedido confirmado",
            "date": "Mon, 02 Sep 2024 11:04:00 -0300",
            "msgid": "<pedido@shop.com>",
            "ip": "52.14.22.9",
            "body": "Seu pedido foi confirmado.",
        },
    ]
    chunks = []
    for spec in specs:
        msg = EmailMessage()
        msg["From"] = spec["from"]
        msg["To"] = spec["to"]
        msg["Subject"] = spec["subj"]
        msg["Date"] = spec["date"]
        msg["Message-ID"] = spec["msgid"]
        msg["X-Originating-IP"] = f"[{spec['ip']}]"
        msg["Received"] = f"from mail.example.net (mail.example.net [{spec['ip']}]) by mx.google.com"
        msg.set_content(spec["body"])
        chunks.append("From MAILER-DAEMON Thu Sep  1 00:00:00 2024\n" + msg.as_string() + "\n")
    return "".join(chunks).encode("utf-8")


def build_sample_zip(dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    imei_shared = imei_with_luhn("35332511000000")
    imei2 = imei_with_luhn("35332511000011")
    imei_moto = imei_with_luhn("35160811123456")
    imei_moto2 = imei_with_luhn("35160811123457")

    subscriber_html = f"""<!doctype html>
<html><body>
<h1>GoogleAccount.SubscriberInfo</h1>
<table>
<tr><th>Name</th><td>João Carlos da Silva</td></tr>
<tr><th>Primary Email</th><td>joao.silva.investigado@gmail.com</td></tr>
<tr><th>Google Account</th><td>joao.silva.investigado@gmail.com</td></tr>
<tr><th>Alternate Emails</th><td>jcsilva.alt@gmail.com, joao.trabalho@gmail.com</td></tr>
<tr><th>Phone</th><td>+55 41 99999-1234</td></tr>
<tr><th>Phone</th><td>+55 41 3333-4455</td></tr>
<tr><th>Account Created</th><td>2015-03-12T14:22:00Z</td></tr>
<tr><th>Last Activity</th><td>2024-09-15T11:04:00Z</td></tr>
<tr><th>Status</th><td>Ativa</td></tr>
<tr><th>Deletion Date</th><td></td></tr>
</table>
</body></html>
"""
    devices = [
        {
            "modelName": "SM-G991B",
            "manufacturer": "samsung",
            "serialNumber": "R58M32ABCDE",
            "androidId": "a1b2c3d4e5f6a7b8",
            "firstRegistrationTime": "2022-01-18T10:00:00Z",
            "lastUsedTime": "2024-09-10T23:55:00Z",
            "deviceData": [
                {"displayName": "IMEI 1", "value": imei_shared},
                {"displayName": "IMEI 2", "value": imei2},
            ],
            "userInfo": [
                {"emailAddress": "joao.silva.investigado@gmail.com"},
                {"emailAddress": "maria.oliveira.alt@gmail.com"},
            ],
        },
        {
            "modelName": "moto g54 5G",
            "manufacturer": "motorola",
            "serialNumber": "ZY22ABCXYZ",
            "androidId": "1122334455667788",
            "firstRegistrationTime": "2023-07-01T12:00:00Z",
            "lastUsedTime": "2024-08-20T08:00:00Z",
            "deviceData": [
                {"displayName": "IMEI 1", "value": imei_moto},
                {"displayName": "IMEI 2", "value": imei_moto2},
            ],
            "userInfo": [{"emailAddress": "joao.silva.investigado@gmail.com"}],
        },
    ]
    records = {
        "locations": [
            {
                "timestamp": "2024-09-10T21:18:00Z",
                "latitudeE7": -254284000,
                "longitudeE7": -492733000,
                "accuracy": 18,
                "source": "WIFI",
            },
            {
                "timestamp": "2024-09-10T21:35:00Z",
                "latitudeE7": -254429000,
                "longitudeE7": -492673000,
                "accuracy": 12,
                "source": "GPS",
            },
            {
                "timestamp": "2024-09-08T14:00:00Z",
                "latitudeE7": -254372000,
                "longitudeE7": -492654000,
                "accuracy": 25,
                "source": "CELL",
            },
            {
                "timestamp": "2024-09-01T09:12:00Z",
                "latitudeE7": -253500000,
                "longitudeE7": -491800000,
                "accuracy": 30,
                "source": "WIFI",
            },
        ]
    }
    semantic = {
        "timelineObjects": [
            {
                "placeVisit": {
                    "location": {
                        "latitudeE7": -254284000,
                        "longitudeE7": -492733000,
                        "name": "Centro Cívico — Curitiba/PR",
                        "address": "Av. Cândido de Abreu, Curitiba",
                    },
                    "duration": {
                        "startTimestamp": "2024-09-10T21:10:00Z",
                        "endTimestamp": "2024-09-10T21:55:00Z",
                    },
                }
            }
        ]
    }
    activity = [
        {
            "header": "Search",
            "title": "Pesquisou por PIX banco",
            "time": "2024-09-10T20:05:00.000Z",
            "products": ["Search"],
            "deviceInformation": {"deviceType": "ANDROID"},
        },
        {
            "header": "Search",
            "title": "Pesquisou por arma de fogo curitiba",
            "time": "2024-09-10T20:22:00.000Z",
            "products": ["Search"],
            "deviceInformation": {"deviceType": "ANDROID"},
        },
        {
            "header": "Search",
            "title": "Pesquisou por CPF consulta",
            "time": "2024-09-09T11:00:00.000Z",
            "products": ["Search"],
            "deviceInformation": {"deviceType": "ANDROID"},
        },
        {
            "header": "Maps",
            "title": "Pesquisou por Centro Cívico Curitiba",
            "time": "2024-09-10T21:02:00.000Z",
            "products": ["Maps"],
        },
    ]
    pay_methods = [
        {"id": "pm-visa-09", "network": "VISA", "last4": "4412", "created": "2021-04-02T00:00:00Z"},
        {"id": "pm-elo-22", "network": "ELO", "last4": "7781", "created": "2023-01-15T00:00:00Z"},
    ]
    pay_profiles = [{"id": "profile-1", "profileName": "João Carlos da Silva", "created": "2020-05-01T00:00:00Z"}]
    photo_time = datetime(2024, 9, 10, 21, 28, tzinfo=timezone.utc)
    photo_bytes = _jpeg_with_gps(-25.4284, -49.2733, photo_time, "FACHADA — CENTRO CIVICO")
    photo_meta = {
        "title": "fachada_centro.jpg",
        "photoTakenTime": {"timestamp": str(int(photo_time.timestamp())), "formatted": "10 de set. de 2024, 21:28:00 UTC"},
        "geoData": {"latitude": -25.4284, "longitude": -49.2733, "altitude": 934.0},
    }
    photo2_time = datetime(2024, 8, 12, 15, 10, tzinfo=timezone.utc)
    photo2 = _jpeg_with_gps(-25.4372, -49.2654, photo2_time, "RUA XV DE NOVEMBRO")
    drive_pix = "Comprovante PIX\nCPF 123.456.789-09\nBANCO Exemplo S.A.\nVALOR R$ 4.800,00\nNOME João Carlos da Silva\nTELEFONE 41999991234\n"
    drive_arma = "Anotações pessoais\nARMA mencionada em conversa.\nDROGA: referência a entorpecente.\n"

    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("GoogleAccount.SubscriberInfo.html", subscriber_html)
        zf.writestr(
            "Takeout/Android Device Configuration Service/DeviceAndUserProfile.json",
            json.dumps(devices, ensure_ascii=False, indent=2),
        )
        zf.writestr("Takeout/Location History/Records.json", json.dumps(records))
        zf.writestr(
            "Takeout/Location History/Semantic Location History/2024/2024_SEPTEMBER.json",
            json.dumps(semantic, ensure_ascii=False),
        )
        zf.writestr("Takeout/My Activity/Search/MyActivity.json", json.dumps(activity, ensure_ascii=False))
        zf.writestr("Takeout/Google Photos/Photos from 2024/fachada_centro.jpg", photo_bytes)
        zf.writestr(
            "Takeout/Google Photos/Photos from 2024/fachada_centro.jpg.json",
            json.dumps(photo_meta, ensure_ascii=False),
        )
        zf.writestr("Takeout/Google Photos/Photos from 2024/rua_xv.jpg", photo2)
        zf.writestr("Takeout/Drive/Documentos/comprovante_pix.txt", drive_pix)
        zf.writestr(
            "Takeout/Drive/Documentos/comprovante_pix.txt.json",
            json.dumps(
                {
                    "title": "comprovante_pix.txt",
                    "createdTime": "2024-09-10T18:15:00Z",
                    "modifiedTime": "2024-09-10T18:16:00Z",
                    "owners": [{"email": "joao.silva.investigado@gmail.com"}],
                }
            ),
        )
        zf.writestr("Takeout/Drive/Documentos/anotacoes_interesse.txt", drive_arma)
        zf.writestr("Takeout/Mail/All mail Including Spam and Trash.mbox", _mbox_bytes())
        csv_text = (
            "Date,Description,Amount,Currency,Transaction ID,Type\n"
            "2024-09-10 18:12:00,PIX Banco Exemplo,4800.00,BRL,TX-PIX-4800,purchase\n"
            "2024-09-03 12:40:00,Uber *Trip,27.90,BRL,TX-UBER-2790,purchase\n"
            "2024-08-22 09:11:00,Mercado Pago,150.00,BRL,TX-MP-150,purchase\n"
        )
        zf.writestr("Takeout/Google Pay/GooglePay Transactions.csv", csv_text)
        zf.writestr("Takeout/Google Pay/Payment Methods.json", json.dumps(pay_methods))
        zf.writestr("Takeout/Google Pay/Payment Profiles.json", json.dumps(pay_profiles))
        zf.writestr(
            "Takeout/Drive/WhatsApp/Databases/msgstore.db.crypt14",
            b"WHATSAPP ENCRYPTED BACKUP PLACEHOLDER " + b"\x00" * 2048,
        )
        zf.writestr(
            "Takeout/Profile/Profile.json",
            json.dumps(
                {
                    "name": "João Carlos da Silva",
                    "email": "joao.silva.investigado@gmail.com",
                    "created": "2015-03-12T14:22:00Z",
                    "last activity": "2024-09-15T11:04:00Z",
                    "status": "Ativa",
                },
                ensure_ascii=False,
            ),
        )
    return dest
