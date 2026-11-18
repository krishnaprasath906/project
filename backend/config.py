import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file
BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
load_dotenv(PROJECT_DIR / '.env')

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'riverguard-ai-secret-key-2026-environmental-station')
    
    # Paths
    BASE_DIR = BASE_DIR
    PROJECT_DIR = PROJECT_DIR
    DATABASE_PATH = BASE_DIR / 'database' / 'riverguard.db'
    UPLOAD_FOLDER = BASE_DIR / 'uploads'
    PROCESSED_FOLDER = BASE_DIR / 'processed'
    FRONTEND_DIR = PROJECT_DIR / 'frontend'
    
    # File Upload constraints
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB max
    
    # Water Level Thresholds in Meters (Configurable)
    SAFE_THRESHOLD = float(os.getenv('SAFE_THRESHOLD', '2.0'))       # Below 2.0m is SAFE
    WATCH_THRESHOLD = float(os.getenv('WATCH_THRESHOLD', '2.0'))     # >= 2.0m is WATCH
    WARNING_THRESHOLD = float(os.getenv('WARNING_THRESHOLD', '3.5')) # >= 3.5m is WARNING
    DANGER_THRESHOLD = float(os.getenv('DANGER_THRESHOLD', '4.8'))   # >= 4.8m is EMERGENCY
    MAX_GAUGE_HEIGHT = float(os.getenv('MAX_GAUGE_HEIGHT', '6.0'))   # 6.0m full gauge
    
    # Status Colors (STRICT COMPLIANCE: Normal Water MUST be GREEN)
    SAFE_COLOR = "#16A34A"        # Green
    WATCH_COLOR = "#FACC15"       # Yellow
    WARNING_COLOR = "#F97316"     # Orange
    EMERGENCY_COLOR = "#DC2626"   # Red
    
    # UI Accent Colors
    PRIMARY_CYAN = "#00B4D8"
    SECONDARY_CYAN = "#0077B6"
    LIGHT_WATER = "#90E0EF"
    BG_DARK = "#07111F"
    BG_SECONDARY = "#0B1726"
    
    # SMTP Configuration
    SMTP_HOST = os.getenv('SMTP_HOST', 'smtp.gmail.com')
    SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
    SMTP_USERNAME = os.getenv('SMTP_USERNAME', '')
    SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', '')
    ALERT_EMAIL_FROM = os.getenv('ALERT_EMAIL_FROM', 'alerts@riverguard.ai')
    ALERT_EMAIL_TO = os.getenv('ALERT_EMAIL_TO', 'operations@riverguard.ai')
    
    # Alert Cooldown in seconds (0 for immediate emergency alert dispatch)
    ALERT_COOLDOWN_SECONDS = int(os.getenv('ALERT_COOLDOWN_SECONDS', '0'))
    
    # Twilio SMS & OTP Verification Configuration
    TWILIO_ACCOUNT_SID = os.getenv('TWILIO_ACCOUNT_SID', '')
    TWILIO_AUTH_TOKEN = os.getenv('TWILIO_AUTH_TOKEN', '')
    TWILIO_VERIFY_SERVICE_SID = os.getenv('TWILIO_VERIFY_SERVICE_SID', '')

    # OTP developer mode (OFF by default). When True, a failed Twilio send falls back to a
    # code printed in the server terminal and the test codes 123456 / 888888 are accepted.
    # Never enable this in a real deployment.
    OTP_DEV_MODE = os.getenv('OTP_DEV_MODE', 'false').strip().lower() in ('1', 'true', 'yes')

