PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    crime_date TEXT,
    crime_window_hours INTEGER DEFAULT 24,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    original_filename TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    sha1 TEXT NOT NULL,
    md5 TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    imported_at TEXT NOT NULL,
    extract_path TEXT NOT NULL,
    file_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'imported',
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER NOT NULL,
    case_id INTEGER NOT NULL,
    product_key TEXT NOT NULL,
    product_name TEXT NOT NULL,
    file_count INTEGER DEFAULT 0,
    sample_paths TEXT,
    FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE CASCADE,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    google_account TEXT,
    display_name TEXT,
    primary_email TEXT,
    alternate_emails TEXT,
    phones TEXT,
    created_on TEXT,
    last_activity TEXT,
    status TEXT,
    deletion_date TEXT,
    source_file TEXT,
    raw_json TEXT,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    imei1 TEXT,
    imei2 TEXT,
    model TEXT,
    manufacturer TEXT,
    serial_number TEXT,
    android_id TEXT,
    first_seen TEXT,
    last_seen TEXT,
    source_file TEXT,
    raw_json TEXT,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS device_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    device_id INTEGER NOT NULL,
    account_email TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    ts TEXT,
    event_type TEXT,
    product TEXT,
    device_ref TEXT,
    description TEXT,
    source_file TEXT,
    lat REAL,
    lon REAL,
    extra_json TEXT,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    ts TEXT,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    accuracy REAL,
    duration_seconds INTEGER,
    place_name TEXT,
    source TEXT,
    device_ref TEXT,
    source_file TEXT,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    stored_path TEXT,
    taken_at TEXT,
    lat REAL,
    lon REAL,
    exif_json TEXT,
    thumbnail_path TEXT,
    has_gps INTEGER DEFAULT 0,
    source_file TEXT,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    mime_type TEXT,
    created_at TEXT,
    modified_at TEXT,
    owner TEXT,
    path TEXT,
    size_bytes INTEGER,
    keywords_hit TEXT,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    message_id TEXT,
    sender TEXT,
    recipients TEXT,
    date TEXT,
    subject TEXT,
    body TEXT,
    headers_json TEXT,
    ip_address TEXT,
    source_file TEXT,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    description TEXT,
    amount TEXT,
    currency TEXT,
    ts TEXT,
    transaction_id TEXT,
    extra_json TEXT,
    source_file TEXT,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    query TEXT,
    ts TEXT,
    device_ref TEXT,
    product TEXT,
    source_file TEXT,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS whatsapp_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    backup_date TEXT,
    size_bytes INTEGER,
    linked_account TEXT,
    filename TEXT,
    path TEXT,
    encrypted INTEGER DEFAULT 1,
    note TEXT,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON events(case_id, ts);
CREATE INDEX IF NOT EXISTS idx_locations_ts ON locations(case_id, ts);
CREATE INDEX IF NOT EXISTS idx_photos_taken ON photos(case_id, taken_at);
CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(case_id, date);
CREATE INDEX IF NOT EXISTS idx_searches_ts ON searches(case_id, ts);
CREATE INDEX IF NOT EXISTS idx_device_imei1 ON devices(imei1);
CREATE INDEX IF NOT EXISTS idx_device_imei2 ON devices(imei2);
