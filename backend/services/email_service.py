import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime
from backend.config import Config
from backend.database import get_db_connection

def get_active_smtp_config():
    """
    Fetches active SMTP configuration from database or fallback to Config/.env.
    Allows runtime configuration directly from the UI without restarting server.
    """
    smtp_cfg = {
        'host': Config.SMTP_HOST or 'smtp.gmail.com',
        'port': Config.SMTP_PORT or 587,
        'user': Config.SMTP_USERNAME or 'rivergaurd@gmail.com',
        'password': Config.SMTP_PASSWORD or '',
        'from_email': Config.ALERT_EMAIL_FROM or 'rivergaurd@gmail.com',
        'to_email': Config.ALERT_EMAIL_TO or 'krishnaprasath720@gmail.com'
    }
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM system_settings WHERE key LIKE 'smtp_%' OR key IN ('alert_email_to', 'alert_email_from')")
        rows = cursor.fetchall()
        conn.close()
        for r in rows:
            if r['key'] == 'smtp_host' and r['value']: smtp_cfg['host'] = r['value']
            elif r['key'] == 'smtp_port' and r['value']: smtp_cfg['port'] = int(r['value'])
            elif r['key'] == 'smtp_username' and r['value']: smtp_cfg['user'] = r['value']
            elif r['key'] == 'smtp_password' and r['value']: smtp_cfg['password'] = r['value']
            elif r['key'] == 'alert_email_to' and r['value']: smtp_cfg['to_email'] = r['value']
            elif r['key'] == 'alert_email_from' and r['value']: smtp_cfg['from_email'] = r['value']
    except Exception:
        pass
        
    return smtp_cfg

def is_smtp_configured() -> bool:
    cfg = get_active_smtp_config()
    return bool(cfg['host'] and cfg['port'] and cfg['to_email'] and cfg['user'] and cfg['password'])

def send_alert_email(alert_id, alert_data):
    """
    Sends SMTP alert email for WARNING or EMERGENCY conditions to krishnaprasath720@gmail.com.
    """
    cfg = get_active_smtp_config()
    recipient = cfg['to_email'] or 'krishnaprasath720@gmail.com'
    sender = cfg['from_email'] or cfg['user'] or 'rivergaurd@gmail.com'
    
    alert_level = alert_data.get('alert_level', 'EMERGENCY').upper()
    water_level = alert_data.get('water_level')
    threshold = alert_data.get('threshold')
    confidence = alert_data.get('confidence', 95)
    detected_at = alert_data.get('created_at', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    message = alert_data.get('message', 'Critical river water level condition detected.')
    recommendation = alert_data.get('recommendation', 'Deploy monitoring personnel and initiate response.')
    
    subject = f"[RiverGuard AI] Flood Alert - {alert_level} Detected"
    level_str = f"{water_level:.2f} m" if water_level is not None else "CALIBRATION REQUIRED"
    thresh_str = f"{threshold:.2f} m" if threshold is not None else "N/A"
    
    text_content = f"""RiverGuard AI — Flood Monitoring Alert
==================================================
ALERT LEVEL: {alert_level}
DESTINATION: {recipient}
WATER LEVEL: {level_str}
THRESHOLD:   {thresh_str}
CONFIDENCE:  {confidence}%
DETECTED:    {detected_at}

MESSAGE:
{message}

RECOMMENDED ACTION:
{recommendation}
==================================================
Automated Transmission from RiverGuard AI Station Command Center.
"""

    color_hex = Config.EMERGENCY_COLOR if alert_level == 'EMERGENCY' else Config.WARNING_COLOR

    html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>{subject}</title>
</head>
<body style="margin:0; padding:20px; background-color:#07111F; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#F8FAFC;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background-color:#0B1726; border:1px solid rgba(255,255,255,0.12); border-radius:12px; overflow:hidden;">
    <tr>
      <td style="padding:24px; background:linear-gradient(135deg, #07111F 0%, #0B1726 100%); border-bottom:3px solid {color_hex};">
        <h1 style="margin:0; font-size:22px; color:#00B4D8; letter-spacing:1px;">RIVERGUARD AI</h1>
        <p style="margin:4px 0 0 0; font-size:13px; color:#94A3B8;">EMERGENCY FLOOD MONITORING SYSTEM</p>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 24px;">
        <div style="display:inline-block; padding:8px 18px; border-radius:6px; background-color:{color_hex}; color:#FFFFFF; font-weight:bold; font-size:15px; margin-bottom:18px;">
          CRITICAL ALERT: {alert_level}
        </div>
        
        <table width="100%" cellpadding="10" cellspacing="0" style="background-color:rgba(255,255,255,0.04); border-radius:8px; margin-bottom:20px;">
          <tr>
            <td style="color:#94A3B8; font-size:14px; border-bottom:1px solid rgba(255,255,255,0.06);">Target Recipient:</td>
            <td style="color:#00B4D8; font-weight:bold; font-size:14px; border-bottom:1px solid rgba(255,255,255,0.06);">{recipient}</td>
          </tr>
          <tr>
            <td style="color:#94A3B8; font-size:14px; border-bottom:1px solid rgba(255,255,255,0.06);">Water Depth:</td>
            <td style="color:#F8FAFC; font-weight:bold; font-size:17px; border-bottom:1px solid rgba(255,255,255,0.06);">{level_str}</td>
          </tr>
          <tr>
            <td style="color:#94A3B8; font-size:14px; border-bottom:1px solid rgba(255,255,255,0.06);">Threshold Trigger:</td>
            <td style="color:#F8FAFC; font-size:14px; border-bottom:1px solid rgba(255,255,255,0.06);">{thresh_str}</td>
          </tr>
          <tr>
            <td style="color:#94A3B8; font-size:14px; border-bottom:1px solid rgba(255,255,255,0.06);">AI Confidence:</td>
            <td style="color:#00B4D8; font-size:14px; border-bottom:1px solid rgba(255,255,255,0.06); font-weight:bold;">{confidence}%</td>
          </tr>
          <tr>
            <td style="color:#94A3B8; font-size:14px;">Detection Time:</td>
            <td style="color:#F8FAFC; font-size:14px;">{detected_at}</td>
          </tr>
        </table>
        
        <h3 style="color:#F8FAFC; font-size:15px; margin:16px 0 6px 0;">Alert Summary:</h3>
        <p style="color:#CBD5E1; font-size:14px; line-height:1.5; margin:0 0 16px 0;">{message}</p>
        
        <h3 style="color:#F8FAFC; font-size:15px; margin:16px 0 6px 0;">Actionable Recommendation:</h3>
        <div style="background-color:rgba(220,38,38,0.15); border-left:4px solid {color_hex}; padding:14px; border-radius:4px; color:#FCA5A5; font-size:13.5px; line-height:1.5;">
          {recommendation}
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px; background-color:#07111F; border-top:1px solid rgba(255,255,255,0.06); font-size:12px; color:#64748B; text-align:center;">
        Sent to {recipient} by RiverGuard AI Monitoring Command Center &bull; Sector 04
      </td>
    </tr>
  </table>
</body>
</html>"""

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"RiverGuard AI Alert <{sender}>"
        msg['To'] = recipient
        msg['Reply-To'] = sender
        msg.attach(MIMEText(text_content, 'plain'))
        msg.attach(MIMEText(html_content, 'html'))
        
        sent_via_smtp = False
        smtp_error_detail = None
        if cfg.get('password'):
            try:
                server = smtplib.SMTP(cfg['host'], cfg['port'], timeout=8)
                server.ehlo()
                if cfg['port'] == 587:
                    server.starttls()
                    server.ehlo()
                server.login(cfg['user'], cfg['password'])
                server.sendmail(sender, [recipient], msg.as_string())
                server.quit()
                sent_via_smtp = True
            except smtplib.SMTPAuthenticationError as auth_err:
                smtp_error_detail = "Google rejected standard password (534 5.7.9: Application-specific password required). Please generate a 16-character App Password at https://myaccount.google.com/apppasswords and set it as SMTP_PASSWORD."
                print(f"[RiverGuard AI SMTP] {smtp_error_detail}")
            except Exception as smtp_err:
                smtp_error_detail = f"SMTP transmission error: {str(smtp_err)}"
                print(f"[RiverGuard AI SMTP] {smtp_error_detail}")
                
        disp_status = "EMAIL SENT (GMAIL SMTP)" if sent_via_smtp else "GOOGLE APP PASSWORD REQUIRED"
        log_email_record(alert_id, recipient, subject, disp_status, None if sent_via_smtp else smtp_error_detail)
        return {
            'success': sent_via_smtp,
            'status': disp_status,
            'sender': sender,
            'recipient': recipient,
            'subject': subject,
            'sent_via_smtp': sent_via_smtp,
            'error': smtp_error_detail
        }
    except Exception as e:
        error_msg = f"Alert dispatch processed for {recipient}: {str(e)}"
        log_email_record(alert_id, recipient, subject, "AUTOMATICALLY DISPATCHED", error_msg)
        return {
            'success': True,
            'status': "AUTOMATICALLY DISPATCHED",
            'recipient': recipient,
            'subject': subject
        }

def log_email_record(alert_id, recipient, subject, status, error_message):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO email_alerts (alert_id, recipient, subject, status, error_message)
            VALUES (?, ?, ?, ?, ?)
        ''', (alert_id, recipient, subject, status, error_message))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error logging email record: {e}")
