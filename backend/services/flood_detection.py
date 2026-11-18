from backend.config import Config
import sqlite3

def get_current_thresholds():
    try:
        from backend.database import get_db_connection
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM system_settings WHERE key LIKE '%threshold%' OR key = 'max_gauge_height'")
        rows = cursor.fetchall()
        conn.close()
        settings = {row['key']: float(row['value']) for row in rows}
        return {
            'safe': settings.get('safe_threshold', Config.SAFE_THRESHOLD),
            'watch': settings.get('watch_threshold', Config.WATCH_THRESHOLD),
            'warning': settings.get('warning_threshold', Config.WARNING_THRESHOLD),
            'danger': settings.get('danger_threshold', Config.DANGER_THRESHOLD),
            'max': settings.get('max_gauge_height', Config.MAX_GAUGE_HEIGHT)
        }
    except Exception:
        return {
            'safe': Config.SAFE_THRESHOLD,
            'watch': Config.WATCH_THRESHOLD,
            'warning': Config.WARNING_THRESHOLD,
            'danger': Config.DANGER_THRESHOLD,
            'max': Config.MAX_GAUGE_HEIGHT
        }

def classify_flood_risk(water_level, calibration_required=False, relative_fill_ratio=None):
    """
    Classifies the flood risk according to exact project specifications:
    SAFE: water level < WATCH_THRESHOLD
    WATCH: water level >= WATCH_THRESHOLD and < WARNING_THRESHOLD
    WARNING: water level >= WARNING_THRESHOLD and < DANGER_THRESHOLD
    EMERGENCY: water level >= DANGER_THRESHOLD
    
    If calibration is required (no meter measurement), uses relative water area fill ratio
    or marks as SAFE (Uncalibrated) while clearly flagging calibration necessity.
    """
    thresholds = get_current_thresholds()
    
    if calibration_required or water_level is None:
        # Cannot compute accurate meter reading without reference marker/calibration
        # Derive structural risk indicator from water region coverage if available
        if relative_fill_ratio is not None and relative_fill_ratio > 0.85:
            return {
                'risk_level': 'WARNING',
                'status_title': 'WARNING (HIGH WATER VISIBILITY)',
                'status_color': Config.WARNING_COLOR,
                'is_safe': False,
                'calibration_required': True,
                'threshold': thresholds['warning'],
                'message': 'Severe water coverage detected. Real-world water level requires reference gauge calibration.',
                'recommendation': 'Inspect station reference marker. Deploy field verification team.'
            }
        else:
            return {
                'risk_level': 'SAFE',
                'status_title': 'NORMAL WATER (UNCALIBRATED)',
                'status_color': Config.SAFE_COLOR,
                'is_safe': True,
                'calibration_required': True,
                'threshold': thresholds['watch'],
                'message': 'Water detected within normal visual sector bounds. Real-world meter level requires physical calibration.',
                'recommendation': 'Continue routine visual monitoring and position physical gauge reference.'
            }
    
    # Accurate metric water level exists
    level = float(water_level)
    
    if level >= thresholds['danger']:
        return {
            'risk_level': 'EMERGENCY',
            'status_title': 'EMERGENCY / FLOOD',
            'status_color': Config.EMERGENCY_COLOR,
            'is_safe': False,
            'calibration_required': False,
            'threshold': thresholds['danger'],
            'message': f'CRITICAL FLOOD EMERGENCY DETECTED. Water level {level:.2f}m has exceeded danger threshold {thresholds["danger"]:.2f}m.',
            'recommendation': 'Trigger automated sirens, dispatch emergency rescue units, and initiate immediate floodplain evacuation protocol.'
        }
    elif level >= thresholds['warning']:
        return {
            'risk_level': 'WARNING',
            'status_title': 'WARNING',
            'status_color': Config.WARNING_COLOR,
            'is_safe': False,
            'calibration_required': False,
            'threshold': thresholds['warning'],
            'message': f'Water level {level:.2f}m has crossed warning threshold {thresholds["warning"]:.2f}m. Rapid surge risk.',
            'recommendation': 'Activate secondary spillways, alert municipal flood defenses, and heighten sensor polling frequency.'
        }
    elif level >= thresholds['watch']:
        return {
            'risk_level': 'WATCH',
            'status_title': 'WATCH',
            'status_color': Config.WATCH_COLOR,
            'is_safe': False,
            'calibration_required': False,
            'threshold': thresholds['watch'],
            'message': f'Water level {level:.2f}m has reached watch advisory threshold {thresholds["watch"]:.2f}m. Rising trend detected.',
            'recommendation': 'Maintain vigilant visual surveillance and monitor upstream precipitation radar.'
        }
    else:
        return {
            'risk_level': 'SAFE',
            'status_title': 'NORMAL WATER',
            'status_color': Config.SAFE_COLOR,
            'is_safe': True,
            'calibration_required': False,
            'threshold': thresholds['safe'],
            'message': f'Water level {level:.2f}m is within the safe operating range. No flood hazard detected.',
            'recommendation': 'Continue standard automated environmental monitoring cycles.'
        }

def get_risk_color(risk_level: str) -> str:
    risk = risk_level.upper()
    if 'EMERGENCY' in risk or 'FLOOD' in risk:
        return Config.EMERGENCY_COLOR
    elif 'WARNING' in risk:
        return Config.WARNING_COLOR
    elif 'WATCH' in risk:
        return Config.WATCH_COLOR
    return Config.SAFE_COLOR
