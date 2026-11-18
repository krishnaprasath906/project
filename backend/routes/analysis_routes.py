import os
from pathlib import Path
from flask import Blueprint, request, jsonify, session, current_app
from werkzeug.utils import secure_filename
from datetime import datetime
from backend.config import Config
from backend.database import get_db_connection
from backend.services.image_processing import analyze_image, validate_image
from backend.services.alert_service import create_alert
from backend.services.flood_detection import get_current_thresholds, classify_flood_risk

analysis_bp = Blueprint('analysis', __name__, url_prefix='/api')

@analysis_bp.route('/analyze-image', methods=['POST'])
def handle_analyze_image():
    # 1. Verification Gate: Only verified operators can upload and analyze images
    user_id = session.get('user_id')
    user_email = session.get('user_email')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    user_row = None
    if user_id:
        cursor.execute('SELECT id, name, email, is_verified, role FROM users WHERE id = ?', (user_id,))
        user_row = cursor.fetchone()
    elif user_email:
        cursor.execute('SELECT id, name, email, is_verified, role FROM users WHERE email = ?', (user_email,))
        user_row = cursor.fetchone()
    conn.close()

    if user_row and user_row['email'] != 'krishnaprasath720@gmail.com' and not user_row['is_verified']:
        return jsonify({
            'success': False,
            'message': f"ACCESS RESTRICTED: Operator '{user_row['name']}' is currently pending administrator verification. Please contact Station Administration to activate your profile."
        }), 403

    if 'image' not in request.files:
        return jsonify({'success': False, 'message': 'No image file uploaded in request.'}), 400
        
    file = request.files['image']
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No selected file.'}), 400
        
    orig_filename = secure_filename(file.filename)
    if not orig_filename:
        orig_filename = f"upload_{int(datetime.now().timestamp())}.jpg"
        
    ext = orig_filename.rsplit('.', 1)[-1].lower()
    if ext not in Config.ALLOWED_EXTENSIONS:
        return jsonify({
            'success': False,
            'message': f"Unsupported format '.{ext}'. Only JPG, JPEG, and PNG river images are supported."
        }), 400

    Config.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    timestamp_prefix = datetime.now().strftime('%Y%m%d_%H%M%S')
    saved_filename = f"{timestamp_prefix}_{orig_filename}"
    saved_path = Config.UPLOAD_FOLDER / saved_filename
    file.save(str(saved_path))
    
    # Check if manual calibration was passed (e.g. from station config)
    manual_calib = None
    if request.form.get('pixels_per_meter'):
        try:
            manual_calib = {
                'pixels_per_meter': float(request.form.get('pixels_per_meter')),
                'datum_y': int(request.form.get('datum_y', 0)) or None
            }
        except Exception:
            pass

    # Execute OpenCV image processing pipeline
    user_id = session.get('user_id', 1)
    analysis_result = analyze_image(saved_path, user_id=user_id, manual_calibration=manual_calib)
    
    if not analysis_result['success']:
        return jsonify({
            'success': False,
            'message': analysis_result.get('error', 'Image analysis could not be completed.'),
            'step': analysis_result.get('step'),
            'metadata': analysis_result.get('metadata'),
            'quality': analysis_result.get('quality')
        }), 422
        
    # Store in database
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO analyses (
            user_id, original_filename, image_path, annotated_image_path,
            water_level, unit, waterline_x, waterline_y, reference_detected,
            reference_type, confidence, risk_level, status_color, message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        user_id,
        analysis_result['original_filename'],
        f"uploads/{saved_filename}",
        analysis_result['annotated_image_path'],
        analysis_result['water_level'],
        analysis_result['unit'],
        analysis_result['waterline_x'],
        analysis_result['waterline_y'],
        analysis_result['reference_detected'],
        analysis_result['reference_type'],
        analysis_result['confidence'],
        analysis_result['risk_level'],
        analysis_result['status_color'],
        analysis_result['message'],
        analysis_result['created_at']
    ))
    analysis_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    # Generate and process alert
    alert_info = create_alert(analysis_id, analysis_result)
    analysis_result['id'] = analysis_id
    analysis_result['alert_id'] = alert_info['alert_id']
    analysis_result['email_status'] = alert_info['email_status']
    
    return jsonify({
        'success': True,
        'message': 'AI Analysis completed successfully.',
        'data': analysis_result
    }), 201

@analysis_bp.route('/analyses', methods=['GET'])
def list_analyses():
    risk_filter = request.args.get('risk')
    limit = int(request.args.get('limit', 50))
    offset = int(request.args.get('offset', 0))
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if risk_filter and risk_filter.upper() != 'ALL':
        cursor.execute('''
            SELECT * FROM analyses
            WHERE risk_level = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        ''', (risk_filter.upper(), limit, offset))
    else:
        cursor.execute('''
            SELECT * FROM analyses
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        ''', (limit, offset))
        
    rows = cursor.fetchall()
    conn.close()
    
    results = [dict(r) for r in rows]
    return jsonify({
        'success': True,
        'count': len(results),
        'analyses': results
    })

@analysis_bp.route('/analyses/<int:analysis_id>', methods=['GET'])
def get_analysis_detail(analysis_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM analyses WHERE id = ?', (analysis_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'success': False, 'message': 'Analysis record not found.'}), 404
        
    # Get associated alert
    cursor.execute('SELECT * FROM alerts WHERE analysis_id = ?', (analysis_id,))
    alert_row = cursor.fetchone()
    
    # Get associated email attempts
    email_row = None
    if alert_row:
        cursor.execute('SELECT * FROM email_alerts WHERE alert_id = ? ORDER BY sent_at DESC LIMIT 1', (alert_row['id'],))
        email_row = cursor.fetchone()
        
    conn.close()
    
    return jsonify({
        'success': True,
        'analysis': dict(row),
        'alert': dict(alert_row) if alert_row else None,
        'email': dict(email_row) if email_row else None
    })

@analysis_bp.route('/dashboard', methods=['GET'])
def get_dashboard_summary():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Latest analysis
    cursor.execute('SELECT * FROM analyses ORDER BY created_at DESC LIMIT 1')
    latest_row = cursor.fetchone()
    latest = dict(latest_row) if latest_row else None
    
    # Total count
    cursor.execute('SELECT COUNT(*) FROM analyses')
    total_analyses = cursor.fetchone()[0]
    
    # Risk counts
    cursor.execute('SELECT risk_level, COUNT(*) as count FROM analyses GROUP BY risk_level')
    risk_counts = {r['risk_level']: r['count'] for r in cursor.fetchall()}
    
    # Active alerts count
    cursor.execute("SELECT COUNT(*) FROM alerts WHERE alert_level IN ('WARNING', 'EMERGENCY') AND status = 'active'")
    critical_alerts_count = cursor.fetchone()[0]
    
    # Recent alerts
    cursor.execute('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 5')
    recent_alerts = [dict(r) for r in cursor.fetchall()]
    
    conn.close()
    
    thresholds = get_current_thresholds()
    from backend.services.email_service import is_smtp_configured
    
    system_status = {
        'status': 'ONLINE',
        'cv_engine': 'OpenCV 5.0 (Active)',
        'database': 'Connected (SQLite)',
        'alert_service': 'Ready',
        'smtp_configured': is_smtp_configured(),
        'smtp_status': 'Configured & Active' if is_smtp_configured() else 'Unconfigured / Local Mock Mode',
        'station_name': 'River Sector 04 - Delta Basin Station',
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }
    
    return jsonify({
        'success': True,
        'latest_analysis': latest,
        'total_analyses': total_analyses,
        'risk_counts': {
            'safe': risk_counts.get('SAFE', 0),
            'watch': risk_counts.get('WATCH', 0),
            'warning': risk_counts.get('WARNING', 0),
            'emergency': risk_counts.get('EMERGENCY', 0)
        },
        'critical_alerts_count': critical_alerts_count,
        'recent_alerts': recent_alerts,
        'thresholds': thresholds,
        'system_status': system_status
    })
