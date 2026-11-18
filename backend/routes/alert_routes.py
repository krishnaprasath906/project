from flask import Blueprint, request, jsonify, session
from backend.database import get_db_connection
from backend.config import Config
from backend.services.email_service import send_alert_email, get_active_smtp_config, is_smtp_configured

alert_bp = Blueprint('alerts', __name__, url_prefix='/api/alerts')

def is_operator_authorized():
    user_id = session.get('user_id')
    user_email = session.get('user_email')
    if not user_id and not user_email:
        return True # Default background server action
    conn = get_db_connection()
    cursor = conn.cursor()
    user_row = None
    if user_id:
        cursor.execute('SELECT email, is_verified, role FROM users WHERE id = ?', (user_id,))
        user_row = cursor.fetchone()
    elif user_email:
        cursor.execute('SELECT email, is_verified, role FROM users WHERE email = ?', (user_email,))
        user_row = cursor.fetchone()
    conn.close()
    if user_row:
        if user_row['email'] == 'krishnaprasath720@gmail.com' or user_row['role'] == 'administrator' or user_row['is_verified']:
            return True
        return False
    return True

@alert_bp.route('', methods=['GET'])
def get_alerts():
    level_filter = request.args.get('level')
    limit = int(request.args.get('limit', 50))
    offset = int(request.args.get('offset', 0))
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if level_filter and level_filter.upper() != 'ALL':
        cursor.execute('''
            SELECT a.*, an.annotated_image_path, an.image_path, an.status_color
            FROM alerts a
            LEFT JOIN analyses an ON a.analysis_id = an.id
            WHERE a.alert_level = ?
            ORDER BY a.created_at DESC
            LIMIT ? OFFSET ?
        ''', (level_filter.upper(), limit, offset))
    else:
        cursor.execute('''
            SELECT a.*, an.annotated_image_path, an.image_path, an.status_color
            FROM alerts a
            LEFT JOIN analyses an ON a.analysis_id = an.id
            ORDER BY a.created_at DESC
            LIMIT ? OFFSET ?
        ''', (limit, offset))
        
    rows = cursor.fetchall()
    conn.close()
    
    alerts = [dict(r) for r in rows]
    return jsonify({
        'success': True,
        'count': len(alerts),
        'alerts': alerts
    })

@alert_bp.route('/recent', methods=['GET'])
def get_recent_alerts():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT a.*, an.annotated_image_path, an.status_color, an.waterline_y, an.reference_detected
        FROM alerts a
        LEFT JOIN analyses an ON a.analysis_id = an.id
        ORDER BY a.created_at DESC
        LIMIT 10
    ''')
    rows = cursor.fetchall()
    conn.close()
    
    return jsonify({
        'success': True,
        'alerts': [dict(r) for r in rows]
    })

@alert_bp.route('/stats', methods=['GET'])
def get_alert_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT alert_level, COUNT(*) as count
        FROM alerts
        GROUP BY alert_level
    ''')
    counts = {r['alert_level']: r['count'] for r in cursor.fetchall()}
    
    # Latest alert for top current status
    cursor.execute('''
        SELECT a.*, an.annotated_image_path, an.image_path, an.waterline_y, an.reference_detected, an.reference_type, an.original_filename
        FROM alerts a
        LEFT JOIN analyses an ON a.analysis_id = an.id
        ORDER BY a.created_at DESC LIMIT 1
    ''')
    latest_row = cursor.fetchone()
    conn.close()
    
    current_status = dict(latest_row) if latest_row else {
        'alert_level': 'SAFE',
        'title': 'NORMAL WATER',
        'water_level': 1.82,
        'confidence': 95,
        'created_at': 'System Online'
    }
    
    smtp_cfg = get_active_smtp_config()
    
    return jsonify({
        'success': True,
        'counts': {
            'safe': counts.get('SAFE', 0),
            'watch': counts.get('WATCH', 0),
            'warning': counts.get('WARNING', 0),
            'emergency': counts.get('EMERGENCY', 0),
            'total': sum(counts.values())
        },
        'current_status': current_status,
        'colors': {
            'safe': Config.SAFE_COLOR,
            'watch': Config.WATCH_COLOR,
            'warning': Config.WARNING_COLOR,
            'emergency': Config.EMERGENCY_COLOR
        },
        'smtp_status': {
            'configured': is_smtp_configured(),
            'host': smtp_cfg['host'],
            'port': smtp_cfg['port'],
            'username': smtp_cfg['user'],
            'sender': smtp_cfg['from_email'],
            'recipient': smtp_cfg['to_email']
        }
    })

@alert_bp.route('/send-test-email', methods=['POST'])
def send_test_email_route():
    """
    Directly dispatches a test emergency alert email from rivergaurd@gmail.com
    to krishnaprasath720@gmail.com and returns exact transmission diagnostics.
    """
    if not is_operator_authorized():
        return jsonify({
            'success': False,
            'message': 'ACCESS RESTRICTED: Unverified operators have view-only access. Awaiting Administrator approval.'
        }), 403

    cfg = get_active_smtp_config()
    target_email = cfg['to_email'] or 'krishnaprasath720@gmail.com'
    sender_email = cfg['from_email'] or 'rivergaurd@gmail.com'
    
    test_alert_data = {
        'alert_level': 'EMERGENCY',
        'water_level': 4.95,
        'threshold': 4.80,
        'confidence': 98,
        'message': f'Manual verification test alert dispatched from {sender_email} to {target_email}. RiverGuard AI emergency alert pipeline verified.',
        'recommendation': 'Confirm reception in your inbox or spam folder. Alert monitoring pipeline is fully operational.'
    }
    
    result = send_alert_email(alert_id=0, alert_data=test_alert_data)
    return jsonify(result)

@alert_bp.route('/configure-smtp', methods=['POST'])
def configure_smtp():
    if not is_operator_authorized():
        return jsonify({
            'success': False,
            'message': 'ACCESS RESTRICTED: Unverified operators have view-only access. Awaiting Administrator approval.'
        }), 403

    data = request.get_json() or {}
    smtp_host = data.get('smtp_host', 'smtp.gmail.com').strip()
    smtp_port = data.get('smtp_port', '587').strip()
    smtp_username = data.get('smtp_username', '').strip()
    smtp_password = data.get('smtp_password', '').strip()
    alert_email_from = data.get('alert_email_from', 'rivergaurd@gmail.com').strip()
    alert_email_to = data.get('alert_email_to', 'krishnaprasath720@gmail.com').strip()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO system_settings (key, value) VALUES 
        ('smtp_host', ?),
        ('smtp_port', ?),
        ('smtp_username', ?),
        ('smtp_password', ?),
        ('alert_email_from', ?),
        ('alert_email_to', ?)
    ''', (smtp_host, smtp_port, smtp_username, smtp_password, alert_email_from, alert_email_to))
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'message': f'SMTP configuration updated. Sender: {alert_email_from} -> Recipient: {alert_email_to}.',
        'sender': alert_email_from,
        'recipient': alert_email_to
    })
