"""
RIVERGUARD AI — TWILIO SMS VERIFICATION SERVICE
Sends and checks mobile OTP codes through the Twilio Verify V2 API.
SMS to the user's own mobile number is the only delivery channel.

If Twilio refuses to send, the failure is reported to the caller as-is.
The terminal fallback and test codes exist only when Config.OTP_DEV_MODE is True.
"""

import re
import json
import random
import time
import base64
import urllib.request
import urllib.parse
import urllib.error
from backend.config import Config

# Dev-mode only: { normalized_phone: { 'code': '123456', 'expires_at': timestamp } }
_SANDBOX_OTP_STORE = {}

# Twilio error codes → message shown to the person registering
_TWILIO_ERROR_MESSAGES = {
    21608: ("SMS could not be sent to {phone}. The RiverGuard Twilio account is in trial mode and can only "
            "text verified numbers. Ask the administrator to verify this number in the Twilio Console "
            "(or upgrade the Twilio account), then try again."),
    21211: "{phone} is not a valid mobile number. Check the number and country code.",
    60200: "{phone} is not a valid mobile number. Check the number and country code.",
    60203: "Too many OTP requests for {phone}. Wait 10 minutes and try again.",
    60205: "{phone} cannot receive SMS (it may be a landline). Use a mobile number.",
    60410: "SMS to {phone} was blocked by Twilio fraud protection. Contact the administrator.",
    20003: "SMS service authentication failed. The administrator must check the Twilio credentials.",
    20404: "SMS service is misconfigured (Verify Service not found). Contact the administrator.",
}


def normalize_phone_number(phone: str) -> str:
    """
    Normalizes a phone number to E.164. A bare 10-digit number is treated as Indian (+91).
    """
    if not phone:
        return ""
    cleaned = re.sub(r'[\s\-\(\)\.]', '', str(phone).strip())
    if cleaned.startswith('00'):
        cleaned = '+' + cleaned[2:]
    if not cleaned.startswith('+'):
        if len(cleaned) == 10:
            cleaned = '+91' + cleaned
        else:
            cleaned = '+' + cleaned
    return cleaned


def get_twilio_auth_header() -> str:
    creds = f"{Config.TWILIO_ACCOUNT_SID}:{Config.TWILIO_AUTH_TOKEN}"
    return "Basic " + base64.b64encode(creds.encode('utf-8')).decode('utf-8')


def _dev_fallback(normalized: str, reason: str) -> dict:
    """Dev mode only: generate a code, print it to the terminal, accept it on verify."""
    code = f"{random.randint(100000, 999999)}"
    _SANDBOX_OTP_STORE[normalized] = {'code': code, 'expires_at': time.time() + 600}
    print("\n============================================================", flush=True)
    print(" RIVERGUARD OTP — DEV MODE FALLBACK (no SMS was delivered)", flush=True)
    print(f" Mobile : {normalized}", flush=True)
    print(f" Code   : {code}", flush=True)
    print(f" Reason : {reason}", flush=True)
    print("============================================================\n", flush=True)
    return {
        'success': True,
        'status': 'dev_fallback',
        'to': normalized,
        'message': f"Developer mode: SMS was not delivered. The code for {normalized} is in the server terminal."
    }


def send_verification_otp(phone: str) -> dict:
    """
    Asks Twilio Verify to text a 6-digit code to the given mobile number.
    Returns success only when Twilio accepted the SMS (or dev mode is on).
    """
    normalized = normalize_phone_number(phone)
    if not normalized or not re.fullmatch(r'\+\d{8,15}', normalized):
        return {
            'success': False,
            'message': 'Enter a valid mobile number with country code (e.g. +91 98765 43210).'
        }

    if not (Config.TWILIO_ACCOUNT_SID and Config.TWILIO_AUTH_TOKEN and Config.TWILIO_VERIFY_SERVICE_SID):
        if Config.OTP_DEV_MODE:
            return _dev_fallback(normalized, 'Twilio credentials not configured')
        return {'success': False, 'message': 'SMS service is not configured. Contact the administrator.'}

    url = f"https://verify.twilio.com/v2/Services/{Config.TWILIO_VERIFY_SERVICE_SID}/Verifications"
    payload = urllib.parse.urlencode({'To': normalized, 'Channel': 'sms'}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={
        'Authorization': get_twilio_auth_header(),
        'Content-Type': 'application/x-www-form-urlencoded'
    })

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            print(f"[TWILIO VERIFY] SMS accepted by Twilio for {normalized} (status: {res_data.get('status')})", flush=True)
            return {
                'success': True,
                'status': 'sms_dispatched',
                'to': normalized,
                'message': f"Verification code sent by SMS to {normalized}."
            }
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='replace')
        try:
            err_json = json.loads(err_body)
            err_code = err_json.get('code')
            err_msg = err_json.get('message', '')
        except Exception:
            err_code, err_msg = e.code, err_body
        print(f"[TWILIO VERIFY ERROR] HTTP {e.code} code {err_code} for {normalized}: {err_msg}", flush=True)

        if Config.OTP_DEV_MODE:
            return _dev_fallback(normalized, f"Twilio error {err_code}: {err_msg}")

        template = _TWILIO_ERROR_MESSAGES.get(err_code,
                                              "SMS could not be sent to {phone} (Twilio error {code}). Try again later.")
        return {
            'success': False,
            'status': 'sms_failed',
            'to': normalized,
            'twilio_error_code': err_code,
            'message': template.format(phone=normalized, code=err_code)
        }
    except Exception as ex:
        print(f"[TWILIO VERIFY ERROR] Could not reach Twilio for {normalized}: {ex}", flush=True)
        if Config.OTP_DEV_MODE:
            return _dev_fallback(normalized, f"Network error: {ex}")
        return {
            'success': False,
            'status': 'sms_failed',
            'to': normalized,
            'message': 'Could not reach the SMS service. Check the server internet connection and try again.'
        }


def check_verification_otp(phone: str, code: str) -> dict:
    """Checks a 6-digit code with Twilio Verify (and the dev-mode store when enabled)."""
    normalized = normalize_phone_number(phone)
    code = str(code or '').strip()

    if not normalized or not re.fullmatch(r'\d{4,10}', code):
        return {'success': False, 'approved': False, 'message': 'Enter the 6-digit code sent to your phone.'}

    # Fast path for local development / automated tests
    if Config.OTP_DEV_MODE:
        cached = _SANDBOX_OTP_STORE.get(normalized)
        if cached and time.time() <= cached['expires_at'] and cached['code'] == code:
            _SANDBOX_OTP_STORE.pop(normalized, None)
            return {'success': True, 'approved': True, 'message': 'Mobile number verified (dev mode).'}
        if code in ('123456', '888888'):
            return {'success': True, 'approved': True, 'message': 'Mobile number verified (dev test code).'}

    if Config.TWILIO_ACCOUNT_SID and Config.TWILIO_AUTH_TOKEN and Config.TWILIO_VERIFY_SERVICE_SID:
        url = f"https://verify.twilio.com/v2/Services/{Config.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck"
        payload = urllib.parse.urlencode({'To': normalized, 'Code': code}).encode('utf-8')
        req = urllib.request.Request(url, data=payload, headers={
            'Authorization': get_twilio_auth_header(),
            'Content-Type': 'application/x-www-form-urlencoded'
        })
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                if res_data.get('status') == 'approved':
                    print(f"[TWILIO VERIFY] Code approved for {normalized}", flush=True)
                    _SANDBOX_OTP_STORE.pop(normalized, None)
                    return {'success': True, 'approved': True, 'message': 'Mobile number verified.'}
        except urllib.error.HTTPError as e:
            # 404 = no pending verification (expired, already used, or never sent)
            print(f"[TWILIO VERIFY] Check failed for {normalized}: HTTP {e.code}", flush=True)
        except Exception as ex:
            print(f"[TWILIO VERIFY] Check error for {normalized}: {ex}", flush=True)

    return {
        'success': False,
        'approved': False,
        'message': 'Incorrect or expired code. Check the SMS or tap "Resend code".'
    }
