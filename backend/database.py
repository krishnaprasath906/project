import sqlite3
import hashlib
import os
import json
from datetime import datetime, timedelta
from backend.config import Config

def get_db_connection():
    Config.DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(Config.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str, salt: str = None) -> str:
    if salt is None:
        salt = os.urandom(16).hex()
    pwd_hash = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    ).hex()
    return f"{salt}${pwd_hash}"

def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, pwd_hash = stored_hash.split('$')
        check_hash = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt.encode('utf-8'),
            100000
        ).hex()
        return check_hash == pwd_hash
    except Exception:
        return False

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            phone TEXT,
            role TEXT DEFAULT 'analyst',
            is_verified INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Migration check: ensure is_verified and phone columns exist
    user_cols = [c[1] for c in cursor.execute('PRAGMA table_info(users)').fetchall()]
    if 'is_verified' not in user_cols:
        cursor.execute('ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0')
        conn.commit()
    if 'phone' not in user_cols:
        cursor.execute('ALTER TABLE users ADD COLUMN phone TEXT')
        conn.commit()

    # Analyses table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            original_filename TEXT,
            image_path TEXT NOT NULL,
            annotated_image_path TEXT,
            water_level REAL,
            unit TEXT DEFAULT 'm',
            waterline_x INTEGER,
            waterline_y INTEGER,
            reference_detected INTEGER DEFAULT 0,
            reference_type TEXT,
            confidence INTEGER NOT NULL,
            risk_level TEXT NOT NULL,
            status_color TEXT NOT NULL,
            message TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')

    # Alerts table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            analysis_id INTEGER,
            alert_level TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            water_level REAL,
            threshold REAL,
            confidence INTEGER,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (analysis_id) REFERENCES analyses (id)
        )
    ''')

    # Email alerts table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS email_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            alert_id INTEGER,
            recipient TEXT NOT NULL,
            subject TEXT NOT NULL,
            status TEXT NOT NULL,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            error_message TEXT,
            FOREIGN KEY (alert_id) REFERENCES alerts (id)
        )
    ''')

    # System settings table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.commit()

    # Seed Default Users
    cursor.execute("SELECT id FROM users WHERE email = 'krishnaprasath720@gmail.com'")
    if not cursor.fetchone():
        admin_pass = hash_password('123456')
        cursor.execute('''
            INSERT INTO users (name, email, password_hash, role, is_verified, phone)
            VALUES (?, ?, ?, ?, 1, '+919876543210')
        ''', ('Krishna Prasath (Admin)', 'krishnaprasath720@gmail.com', admin_pass, 'administrator'))
        conn.commit()

    cursor.execute("SELECT id FROM users WHERE email = 'analyst@riverguard.ai'")
    if not cursor.fetchone():
        analyst_pass = hash_password('RiverGuard2026!')
        cursor.execute('''
            INSERT OR REPLACE INTO users (id, name, email, password_hash, role, is_verified, phone)
            VALUES (1, ?, ?, ?, ?, 0, '+919840123456')
        ''', ('Lead Hydrologist (Analyst)', 'analyst@riverguard.ai', analyst_pass, 'analyst'))
        conn.commit()

    # Seed initial system settings
    cursor.execute('''
        INSERT OR IGNORE INTO system_settings (key, value) VALUES 
        ('safe_threshold', ?),
        ('watch_threshold', ?),
        ('warning_threshold', ?),
        ('danger_threshold', ?),
        ('max_gauge_height', ?),
        ('station_name', 'River Sector 04 - Delta Basin Station')
    ''', (str(Config.SAFE_THRESHOLD), str(Config.WATCH_THRESHOLD), 
          str(Config.WARNING_THRESHOLD), str(Config.DANGER_THRESHOLD), 
          str(Config.MAX_GAUGE_HEIGHT)))
    conn.commit()

    # Seed historical records if analyses table is empty
    cursor.execute('SELECT COUNT(*) FROM analyses')
    if cursor.fetchone()[0] == 0:
        seed_historical_data(conn)

    conn.close()

def seed_historical_data(conn):
    cursor = conn.cursor()
    # Let's seed 14 realistic chronological water level recordings over the last 7 days
    # Showing baseline safe water (GREEN), slight rise into watch (YELLOW), and safe normalization
    now = datetime.now()
    records = [
        # (days_ago, hours_ago, water_level, risk_level, status_color, confidence, ref_detected, y_pos, title, msg)
        (7, 2, 1.45, 'SAFE', Config.SAFE_COLOR, 94, 1, 380, 'NORMAL WATER', 'River level within regular seasonal flow parameters.'),
        (6, 14, 1.52, 'SAFE', Config.SAFE_COLOR, 93, 1, 372, 'NORMAL WATER', 'Stable surface flow across sector reach.'),
        (6, 2, 1.60, 'SAFE', Config.SAFE_COLOR, 91, 1, 364, 'NORMAL WATER', 'Minor rain inflow recorded upstream.'),
        (5, 12, 1.78, 'SAFE', Config.SAFE_COLOR, 95, 1, 345, 'NORMAL WATER', 'Waterline well below primary alert marker.'),
        (5, 1, 1.92, 'SAFE', Config.SAFE_COLOR, 92, 1, 330, 'NORMAL WATER', 'Upstream drainage entering basin.'),
        (4, 15, 2.15, 'WATCH', Config.WATCH_COLOR, 89, 1, 305, 'WATCH ADVISORY', 'Water level has crossed advisory threshold 2.0m. Elevated monitoring active.'),
        (4, 3, 2.45, 'WATCH', Config.WATCH_COLOR, 88, 1, 275, 'WATCH ADVISORY', 'Surface velocity increased. Monitoring sensors active.'),
        (3, 16, 2.30, 'WATCH', Config.WATCH_COLOR, 90, 1, 290, 'WATCH ADVISORY', 'Water level stabilizing near watch zone.'),
        (3, 4, 1.98, 'SAFE', Config.SAFE_COLOR, 93, 1, 325, 'NORMAL WATER', 'Runoff receding back into safe channel depth.'),
        (2, 14, 1.85, 'SAFE', Config.SAFE_COLOR, 94, 1, 338, 'NORMAL WATER', 'River discharge normalized.'),
        (2, 2, 1.75, 'SAFE', Config.SAFE_COLOR, 96, 1, 348, 'NORMAL WATER', 'Clear bank visibility and stable waterline.'),
        (1, 16, 1.68, 'SAFE', Config.SAFE_COLOR, 95, 1, 356, 'NORMAL WATER', 'Normal hydrological conditions confirmed.'),
        (1, 3, 1.72, 'SAFE', Config.SAFE_COLOR, 93, 1, 351, 'NORMAL WATER', 'Safe operational baseline sustained.'),
        (0, 4, 1.82, 'SAFE', Config.SAFE_COLOR, 95, 1, 341, 'NORMAL WATER', 'Latest scan confirmed normal safe water condition.')
    ]

    for days_ago, hours_ago, lvl, risk, color, conf, ref, y_pos, title, msg in records:
        entry_time = (now - timedelta(days=days_ago, hours=hours_ago)).strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('''
            INSERT INTO analyses (
                user_id, original_filename, image_path, annotated_image_path,
                water_level, unit, waterline_x, waterline_y, reference_detected,
                reference_type, confidence, risk_level, status_color, message, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            1, f"station_sector04_{days_ago}d_{hours_ago}h.jpg",
            "uploads/sample_river_baseline.jpg", "processed/sample_river_baseline_annotated.jpg",
            lvl, 'm', 420, y_pos, ref, 'Staff Gauge', conf, risk, color, msg, entry_time
        ))
        analysis_id = cursor.lastrowid

        # Insert Alert if WATCH or higher, or baseline normal confirmation
        threshold = Config.WATCH_THRESHOLD if risk == 'WATCH' else Config.SAFE_THRESHOLD
        cursor.execute('''
            INSERT INTO alerts (
                analysis_id, alert_level, title, description, water_level, threshold, confidence, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            analysis_id, risk, title, msg, lvl, threshold, conf, 'active' if days_ago == 0 else 'resolved', entry_time
        ))

    conn.commit()

if __name__ == '__main__':
    init_db()
    print("RiverGuard AI Database successfully initialized and seeded.")
