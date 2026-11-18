from flask import Blueprint, jsonify
from backend.database import get_db_connection
from backend.config import Config

analytics_bp = Blueprint('analytics', __name__, url_prefix='/api/analytics')

@analytics_bp.route('', methods=['GET'])
def get_analytics():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Total records check
    cursor.execute('SELECT COUNT(*) FROM analyses WHERE water_level IS NOT NULL')
    valid_count = cursor.fetchone()[0]
    
    if valid_count < 3:
        conn.close()
        return jsonify({
            'success': True,
            'sufficient_data': False,
            'message': 'Not enough historical data available to compute complete analytics curves.',
            'count': valid_count
        })
        
    # 2. Water Level vs Time (Chronological)
    cursor.execute('''
        SELECT id, water_level, risk_level, confidence, created_at
        FROM analyses
        WHERE water_level IS NOT NULL
        ORDER BY created_at ASC
    ''')
    time_series = [dict(r) for r in cursor.fetchall()]
    
    # 3. Alert Frequency by Level
    cursor.execute('''
        SELECT alert_level, COUNT(*) as count
        FROM alerts
        GROUP BY alert_level
    ''')
    alert_freq = {r['alert_level']: r['count'] for r in cursor.fetchall()}
    
    # 4. Risk Distribution
    cursor.execute('''
        SELECT risk_level, COUNT(*) as count
        FROM analyses
        GROUP BY risk_level
    ''')
    risk_dist = {r['risk_level']: r['count'] for r in cursor.fetchall()}
    
    # 5. AI Confidence Buckets
    cursor.execute('''
        SELECT 
            CASE 
                WHEN confidence >= 90 THEN '90-100%'
                WHEN confidence >= 80 THEN '80-89%'
                WHEN confidence >= 70 THEN '70-79%'
                ELSE '<70%'
            END as bucket,
            COUNT(*) as count
        FROM analyses
        GROUP BY bucket
    ''')
    confidence_dist = {r['bucket']: r['count'] for r in cursor.fetchall()}
    
    # 6. Daily Average Water Levels
    cursor.execute('''
        SELECT DATE(created_at) as day, ROUND(AVG(water_level), 2) as avg_level, MAX(water_level) as max_level
        FROM analyses
        WHERE water_level IS NOT NULL
        GROUP BY DATE(created_at)
        ORDER BY day ASC
        LIMIT 14
    ''')
    daily_trends = [dict(r) for r in cursor.fetchall()]
    
    conn.close()
    
    return jsonify({
        'success': True,
        'sufficient_data': True,
        'time_series': time_series,
        'alert_frequency': alert_freq,
        'risk_distribution': risk_dist,
        'confidence_distribution': confidence_dist,
        'daily_trends': daily_trends,
        'thresholds': {
            'safe': Config.SAFE_THRESHOLD,
            'watch': Config.WATCH_THRESHOLD,
            'warning': Config.WARNING_THRESHOLD,
            'danger': Config.DANGER_THRESHOLD
        },
        'colors': {
            'safe': Config.SAFE_COLOR,
            'watch': Config.WATCH_COLOR,
            'warning': Config.WARNING_COLOR,
            'emergency': Config.EMERGENCY_COLOR,
            'cyan': Config.PRIMARY_CYAN
        }
    })
