import io
import json
from pathlib import Path
from backend.app import app
from backend.config import Config

def run_tests():
    # Tests must not depend on real SMS delivery: enable the OTP dev fallback for this run only
    Config.OTP_DEV_MODE = True
    print("============================================================")
    print(" RIVERGUARD AI COMPREHENSIVE AUTOMATED VERIFICATION SUITE   ")
    print("============================================================")
    client = app.test_client()
    passed = 0
    total = 0

    def assert_test(name, condition, details=""):
        nonlocal passed, total
        total += 1
        if condition:
            passed += 1
            print(f"[PASS] {name}")
        else:
            print(f"[FAIL] {name}: {details}")

    # 1. Test Static Frontend Route
    res = client.get('/')
    assert_test("Frontend Index Route (HTTP 200)", res.status_code == 200 and (b"RiverGuard" in res.data or b"RIVERGUARD" in res.data))

    # 2. Test Dashboard Summary API
    res = client.get('/api/dashboard')
    data = res.get_json()
    assert_test("Dashboard API (HTTP 200)", res.status_code == 200 and data.get('success') is True)
    assert_test("System Status Online", data.get('system_status', {}).get('status') == 'ONLINE')
    assert_test("Configurable Thresholds Returned", 'thresholds' in data and data['thresholds']['safe'] == Config.SAFE_THRESHOLD)

    # 3. Test Alerts Stats API
    res = client.get('/api/alerts/stats')
    data = res.get_json()
    assert_test("Alerts Stats API (HTTP 200)", res.status_code == 200 and 'counts' in data)
    assert_test("Safe Color is Strictly Green #16A34A", data.get('colors', {}).get('safe') == "#16A34A")

    # 4. Test Analytics API
    res = client.get('/api/analytics')
    data = res.get_json()
    assert_test("Analytics API (HTTP 200)", res.status_code == 200 and data.get('success') is True)
    assert_test("Analytics Sufficient Data Flag", data.get('sufficient_data') is True)
    assert_test("Analytics Time Series Array Present", len(data.get('time_series', [])) > 0)

    # 5. Test Prediction API (Rule 28 & 42: Data sufficiency & separated logic)
    res = client.get('/api/prediction')
    data = res.get_json()
    pred = data.get('prediction', {})
    assert_test("Prediction API (HTTP 200)", res.status_code == 200 and data.get('success') is True)
    assert_test("Prediction Calculation Integrity", pred.get('available') is True and len(pred.get('forecast', [])) == 4)

    # 6. Test Authentication Routes
    from backend.database import get_db_connection
    conn = get_db_connection()
    conn.execute("UPDATE users SET is_verified = 0 WHERE email = 'analyst@riverguard.ai'")
    conn.commit()
    conn.close()

    # Login with unverified analyst
    res = client.post('/api/auth/login', json={'email': 'analyst@riverguard.ai', 'password': 'RiverGuard2026!'})
    login_data = res.get_json()
    assert_test("Auth Login Valid Credentials", res.status_code == 200 and login_data.get('success') is True)

    # Login with bad credentials
    res = client.post('/api/auth/login', json={'email': 'analyst@riverguard.ai', 'password': 'WrongPassword123'})
    assert_test("Auth Login Reject Bad Credentials (HTTP 401)", res.status_code == 401)

    # 6b. Test Unverified User Upload Block (Security Requirement)
    client.post('/api/auth/login', json={'email': 'analyst@riverguard.ai', 'password': 'RiverGuard2026!'})
    dummy_txt = io.BytesIO(b"dummy")
    res = client.post('/api/analyze-image', data={'image': (dummy_txt, 'document.txt')}, content_type='multipart/form-data')
    assert_test("Unverified User Upload Blocked (HTTP 403)", res.status_code == 403)

    # 6c. Login as Primary Administrator krishnaprasath720@gmail.com
    res = client.post('/api/auth/login', json={'email': 'krishnaprasath720@gmail.com', 'password': '123456'})
    assert_test("Admin krishnaprasath720@gmail.com Login (HTTP 200)", res.status_code == 200 and res.get_json().get('user', {}).get('is_verified') == 1)

    # 6d. Test Admin User Verification Endpoint
    res = client.post('/api/auth/users/1/verify')
    assert_test("Admin Verifies Operator analyst@riverguard.ai (HTTP 200)", res.status_code == 200 and res.get_json().get('success') is True)

    # 6e. Test Admin Protected from Deletion Safeguard
    res = client.delete('/api/auth/users/3')
    assert_test("Safeguard: Admin Cannot Be Deleted (HTTP 400)", res.status_code == 400)

    # 6f. Test Direct Operator Registration with Phone
    test_email = 'kaviya.operator@riverguard.ai'
    conn = get_db_connection()
    conn.execute('DELETE FROM users WHERE email = ?', (test_email,))
    conn.commit()
    conn.close()

    res = client.post('/api/auth/register', json={
        'name': 'Officer Kaviya',
        'phone': '+919876543299',
        'email': test_email,
        'password': 'OperatorPass2026!'
    })
    reg_data = res.get_json()
    assert_test("Direct Register Operator with Mobile (HTTP 201)", res.status_code == 201 and reg_data.get('success') is True)
    assert_test("Operator Phone Number Stored in DB", reg_data.get('user', {}).get('phone') == '+919876543299')

    # 6g. Test Duplicate Registration Rejected
    res = client.post('/api/auth/register', json={
        'name': 'Officer Kaviya',
        'phone': '+919876543299',
        'email': test_email,
        'password': 'OperatorPass2026!'
    })
    assert_test("Duplicate Email Rejected (HTTP 409)", res.status_code == 409)

    # 6h. Test Short Password Rejected
    res = client.post('/api/auth/register', json={
        'name': 'Officer Short',
        'phone': '+919876543299',
        'email': 'shortpass@riverguard.ai',
        'password': '123'
    })
    assert_test("Short Password Rejected (HTTP 400)", res.status_code == 400)

    # 6i. Test Missing Required Fields Rejected
    res = client.post('/api/auth/register', json={
        'name': '',
        'phone': '',
        'email': '',
        'password': ''
    })
    assert_test("Missing Fields Rejected (HTTP 400)", res.status_code == 400)


    # Re-login as Verified Administrator for subsequent operational pipeline tests
    client.post('/api/auth/login', json={'email': 'krishnaprasath720@gmail.com', 'password': '123456'})

    # 7. Test Image Validation (Invalid Extension) with Verified Operator

    dummy_txt = io.BytesIO(b"Hello world invalid file")
    res = client.post('/api/analyze-image', data={'image': (dummy_txt, 'document.txt')}, content_type='multipart/form-data')
    assert_test("Reject Unsupported File Extension (HTTP 400)", res.status_code == 400)

    # 8. Test Image Analysis Pipeline with Verified Sample 1 (SAFE / Normal Water)
    sample_safe_path = Path(Config.UPLOAD_FOLDER) / 'sample_river_normal_safe.jpg'
    if sample_safe_path.exists():
        with open(sample_safe_path, 'rb') as f:
            res = client.post('/api/analyze-image', data={'image': (f, 'test_sample_safe.jpg')}, content_type='multipart/form-data')
        data = res.get_json()
        assert_test("Analyze Safe River Image (HTTP 201)", res.status_code == 201 and data.get('success') is True)
        analysis = data.get('data', {})
        assert_test("Safe Risk Classification is SAFE", analysis.get('risk_level') == 'SAFE')
        assert_test("Safe Status Color is Strictly #16A34A (Green)", analysis.get('status_color') == '#16A34A')
        assert_test("Safe Water Level in Normal Metric Range", analysis.get('water_level') is not None and analysis.get('water_level') < 2.0)
        assert_test("Annotated HUD Image Generated", (Config.BASE_DIR / analysis.get('annotated_image_path')).exists())

    # 9. Test Image Analysis Pipeline with Sample 4 (EMERGENCY / Flood)
    sample_emerg_path = Path(Config.UPLOAD_FOLDER) / 'sample_river_flood_emergency.jpg'
    if sample_emerg_path.exists():
        with open(sample_emerg_path, 'rb') as f:
            res = client.post('/api/analyze-image', data={'image': (f, 'test_sample_emerg.jpg')}, content_type='multipart/form-data')
        data = res.get_json()
        assert_test("Analyze Emergency Flood Image (HTTP 201)", res.status_code == 201 and data.get('success') is True)
        analysis = data.get('data', {})
        assert_test("Emergency Classification is EMERGENCY", analysis.get('risk_level') == 'EMERGENCY')
        assert_test("Emergency Status Color is #DC2626 (Red)", analysis.get('status_color') == '#DC2626')

    # 10. Test Image Analysis Pipeline with Sample 5 (UNCALIBRATED / No Gauge)
    sample_uncalib_path = Path(Config.UPLOAD_FOLDER) / 'sample_river_uncalibrated_nogauge.jpg'
    if sample_uncalib_path.exists():
        with open(sample_uncalib_path, 'rb') as f:
            res = client.post('/api/analyze-image', data={'image': (f, 'test_sample_uncalib.jpg')}, content_type='multipart/form-data')
        data = res.get_json()
        assert_test("Analyze Uncalibrated Image (HTTP 201)", res.status_code == 201 and data.get('success') is True)
        analysis = data.get('data', {})
        assert_test("Water Level is None (Does NOT fabricate number)", analysis.get('water_level') is None)
        assert_test("Calibration Required Flag is True", analysis.get('calibration_required') is True)

    # 11. Test Non-River Scene Rejection (Anti-Hallucination Gate)
    import cv2
    import numpy as np
    non_water = np.full((480, 640, 3), 245, dtype=np.uint8)
    cv2.putText(non_water, "NOT A RIVER", (150, 240), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 0), 3)
    _, buf = cv2.imencode('.jpg', non_water)
    non_water_bytes = io.BytesIO(buf.tobytes())
    res = client.post('/api/analyze-image', data={'image': (non_water_bytes, 'document_sample.jpg')}, content_type='multipart/form-data')
    assert_test("Reject Non-River Image (HTTP 422)", res.status_code == 422 and "NON-RIVER" in res.get_json().get('message', ''))

    print("============================================================")
    print(f" TEST SUITE SUMMARY: {passed} / {total} TESTS PASSED")
    print("============================================================")
    return passed == total

if __name__ == '__main__':
    success = run_tests()
    exit(0 if success else 1)
