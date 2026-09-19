"""Leitor de MBOX (Gmail) com extração de cabeçalhos e IP."""
from __future__ import annotations

import mailbox
from email.header import decode_header, make_header
from email.message import Message
from pathlib import Path

from modules import db
from modules.utils import as_json, extract_ips, iso_or_none


def _decode(value) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return str(value)


def _walk_text(msg: Message) -> str:
    if msg.is_multipart():
        chunks = []
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and not part.get_filename():
                payload = part.get_payload(decode=True) or b""
                charset = part.get_content_charset() or "utf-8"
                chunks.append(payload.decode(charset, errors="replace"))
        return "\n".join(chunks).strip()
    payload = msg.get_payload(decode=True) or b""
    charset = msg.get_content_charset() or "utf-8"
    return payload.decode(charset, errors="replace").strip()


def _headers(msg: Message) -> dict[str, str]:
    interesting = [
        "Message-ID",
        "From",
        "To",
        "Cc",
        "Bcc",
        "Date",
        "Subject",
        "Received",
        "X-Originating-IP",
        "X-Received",
        "Return-Path",
        "Reply-To",
        "Delivered-To",
    ]
    data = {}
    for key in interesting:
        values = msg.get_all(key)
        if values:
            data[key] = " | ".join(_decode(v) for v in values)
    return data


def _origin_ip(headers: dict[str, str]) -> str | None:
    blob = " ".join(headers.values())
    ips = extract_ips(blob)
    private_prefixes = ("10.", "127.", "192.168.", "172.16.", "172.17.", "172.18.", "0.")
    public = [ip for ip in ips if not ip.startswith(private_prefixes)]
    return (public or ips or [None])[0]


def ingest_gmail(case_id: int, root: Path) -> int:
    count = 0
    mboxes = [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() == ".mbox"]
    for path in mboxes:
        try:
            box = mailbox.mbox(str(path))
        except Exception:
            continue
        try:
            for message in box:
                if not isinstance(message, Message):
                    continue
                headers = _headers(message)
                body = _walk_text(message)[:20000]
                ip = _origin_ip(headers)
                ts = iso_or_none(headers.get("Date") or message.get("Date"))
                subject = _decode(message.get("Subject"))
                db.execute(
                    """
                    INSERT INTO emails(
                        case_id, message_id, sender, recipients, date, subject, body,
                        headers_json, ip_address, source_file
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        case_id,
                        _decode(message.get("Message-ID")),
                        _decode(message.get("From")),
                        _decode(message.get("To")),
                        ts,
                        subject,
                        body,
                        as_json(headers),
                        ip,
                        str(path),
                    ),
                )
                db.execute(
                    """
                    INSERT INTO events(
                        case_id, ts, event_type, product, device_ref, description, source_file, lat, lon, extra_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        case_id,
                        ts,
                        "email",
                        "Gmail",
                        None,
                        subject or "(sem assunto)",
                        str(path),
                        None,
                        None,
                        as_json({"ip": ip, "from": _decode(message.get("From"))}),
                    ),
                )
                count += 1
        finally:
            try:
                box.close()
            except Exception:
                pass
    return count
