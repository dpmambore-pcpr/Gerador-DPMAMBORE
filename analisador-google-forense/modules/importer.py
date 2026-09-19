"""Importação de ZIPs Google LERS/Takeout sem alterar o original."""
from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

from config import EXTRACT_DIR, UPLOAD_DIR, ensure_dirs
from modules import db
from modules.detector import detect_products
from modules.utils import file_hashes, now_iso, safe_relpath, walk_files

MAX_EXTRACTED_BYTES = 20 * 1024 * 1024 * 1024
MAX_NESTED_ZIP = 8


def _copy_original(upload: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(upload, dest)


def _extract_zip(zip_path: Path, dest: Path, nested_level: int = 0) -> int:
    dest.mkdir(parents=True, exist_ok=True)
    extracted = 0
    total_bytes = 0
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            target = safe_relpath(dest, info.filename)
            if target is None:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info, "r") as src, target.open("wb") as out:
                while True:
                    chunk = src.read(1024 * 1024)
                    if not chunk:
                        break
                    total_bytes += len(chunk)
                    if total_bytes > MAX_EXTRACTED_BYTES:
                        raise ValueError("Limite de extração excedido.")
                    out.write(chunk)
            extracted += 1
            if nested_level < MAX_NESTED_ZIP and zipfile.is_zipfile(target):
                nested_dir = target.with_suffix("") / "_unzipped"
                extracted += _extract_zip(target, nested_dir, nested_level + 1)
    return extracted


def import_zip(case_id: int, zip_path: Path, original_name: str | None = None) -> dict:
    ensure_dirs()
    if not zipfile.is_zipfile(zip_path):
        raise ValueError("O arquivo selecionado não é um ZIP válido.")

    original_name = original_name or zip_path.name
    hashes = file_hashes(zip_path)
    size_bytes = zip_path.stat().st_size
    existing = db.query_one(
        "SELECT * FROM imports WHERE case_id = ? AND sha256 = ?",
        (case_id, hashes["sha256"]),
    )
    if existing:
        return {
            "import_id": existing["id"],
            "original_filename": existing["original_filename"],
            "stored_path": existing["stored_path"],
            "extract_path": existing["extract_path"],
            "file_count": existing["file_count"],
            "hashes": {"sha256": existing["sha256"], "sha1": existing["sha1"], "md5": existing["md5"]},
            "size_bytes": existing["size_bytes"],
            "products": {},
            "extracted_files": existing["file_count"],
            "already_imported": True,
        }
    stamp = now_iso().replace(":", "").replace("+", "_")
    stored_name = f"{stamp}_{hashes['sha256'][:12]}_{Path(original_name).name}"
    stored_path = UPLOAD_DIR / stored_name
    _copy_original(zip_path, stored_path)

    import_id_placeholder = db.execute(
        """
        INSERT INTO imports(
            case_id, original_filename, stored_path, sha256, sha1, md5,
            size_bytes, imported_at, extract_path, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            case_id,
            original_name,
            str(stored_path),
            hashes["sha256"],
            hashes["sha1"],
            hashes["md5"],
            size_bytes,
            now_iso(),
            "",
            "extracting",
        ),
    )
    extract_path = EXTRACT_DIR / f"import_{import_id_placeholder}"
    file_count = _extract_zip(stored_path, extract_path)
    db.execute(
        "UPDATE imports SET extract_path = ?, file_count = ?, status = ? WHERE id = ?",
        (str(extract_path), file_count, "extracted", import_id_placeholder),
    )

    products = detect_products(extract_path)
    for item in products.values():
        db.execute(
            """
            INSERT INTO products(import_id, case_id, product_key, product_name, file_count, sample_paths)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                import_id_placeholder,
                case_id,
                item["product_key"],
                item["product_name"],
                item["file_count"],
                "\n".join(item["sample_paths"]),
            ),
        )
    db.touch_case(case_id)
    return {
        "import_id": import_id_placeholder,
        "original_filename": original_name,
        "stored_path": str(stored_path),
        "extract_path": str(extract_path),
        "file_count": file_count,
        "hashes": hashes,
        "size_bytes": size_bytes,
        "products": products,
        "extracted_files": len(walk_files(extract_path)),
    }
