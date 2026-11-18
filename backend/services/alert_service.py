from datetime import datetime, timedelta
from backend.config import Config
from backend.database import get_db_connection
from backend.services.email_service import send_alert_email

def prevent_duplicate_alert(risk_level: str) -> bool:
    """
    Returns True if an alert of the same risk level was sent within the cooldown window (e.g. 15 mins).
    Prevents repeated alert storms during consecutive scan evaluations.
    """
    cooldown_seconds = Config.ALERT_COOLDOWN_SECONDS
    cutoff_time = (datetime.now() - timedelta(seconds=cooldown_seconds)).strftime('%Y-%m-%d %H:%M:%S')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id FROM alerts
        WHERE alert_level = ? AND created_at >= ?
        ORDER BY created_at DESC LIMIT 1
    ''', (risk_level, cutoff_time))
    recent = cursor.fetchone()
    conn.close()
    
    return recent is not None

def create_alert(analysis_id: int, analysis_result: dict):
    """
    Evaluates and records an alert for the given analysis.
    If WARNING or EMERGENCY, checks cooldown and triggers email notification.
    """
    risk_level = analysis_result.get('risk_level', 'SAFE')
    water_level = analysis_result.get('water_level')
    threshold = analysis_result.get('threshold')
    confidence = analysis_result.get('confidence', 90)
    message = analysis_result.get('message', '')
    title = analysis_result.get('status_title', risk_level)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Insert Alert
    cursor.execute('''
        INSERT INTO alerts (analysis_id, alert_level, title, description, water_level, threshold, confidence, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (analysis_id, risk_level, title, message, water_level, threshold, confidence, 'active'))
    alert_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    email_status = "NOT_REQUIRED"
    email_result = None
    
    # Check if WARNING or EMERGENCY requires email dispatch
    if risk_level in ['WARNING', 'EMERGENCY']:
        # Emergency alerts MUST ALWAYS dispatch immediately to krishnaprasath720@gmail.com
        is_duplicate = False if risk_level == 'EMERGENCY' else prevent_duplicate_alert(risk_level)
        if not is_duplicate:
            email_result = send_alert_email(alert_id, {
                'alert_level': risk_level,
                'water_level': water_level,
                'threshold': threshold,
                'confidence': confidence,
                'message': message,
                'recommendation': analysis_result.get('recommendation', 'Inspect river station immediately.')
            })
            email_status = email_result.get('status', 'EMAIL DELIVERY FAILED')
        else:
            email_status = "SKIPPED_COOLDOWN"
            
    return {
        'alert_id': alert_id,
        'alert_level': risk_level,
        'title': title,
        'water_level': water_level,
        'threshold': threshold,
        'confidence': confidence,
        'email_status': email_status,
        'email_result': email_result
    }
