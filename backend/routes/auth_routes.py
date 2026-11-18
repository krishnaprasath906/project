import re
from flask import Blueprint, request, jsonify, session
from backend.database import get_db_connection, hash_password, verify_password

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

PRIMARY_ADMIN_EMAIL = 'krishnaprasath720@gmail.com'

def normalize_phone_number(phone: str) -> str:
    """Normalizes a phone number to standard E.164 (+91 for 10 digits)."""
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

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    phone = data.get('phone', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    
    if not name or not phone or not email or not password:
        return jsonify({'success': False, 'message': 'Full name, mobile number, station email, and password are required.'}), 400
        
    if len(password) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters.'}), 400

    norm_phone = normalize_phone_number(phone) if phone else ''

    # Duplicate check first
    conn = get_db_connection()
    existing = conn.execute('SELECT id FROM users WHERE email = ?', (email,)).fetchone()
    conn.close()
    if existing:
        return jsonify({'success': False, 'message': 'An account with this email already exists.'}), 409

    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('SELECT id FROM users WHERE email = ?', (email,))
        if cursor.fetchone():
            conn.close()
            return jsonify({'success': False, 'message': 'An account with this email already exists.'}), 409
            
        pwd_hash = hash_password(password)
        is_admin = (email == PRIMARY_ADMIN_EMAIL)
        is_verified = 1 if is_admin else 0
        role = 'administrator' if is_admin else 'analyst'

        cursor.execute('''
            INSERT INTO users (name, email, password_hash, role, is_verified, phone)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (name, email, pwd_hash, role, is_verified, norm_phone))
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()
        
        # Registration requires subsequent email/password login on the sign-in page
        session.clear()
        
        msg = ('Registration successful. Please sign in with your email and password.')

        return jsonify({
            'success': True,
            'message': msg,
            'user': {
                'id': user_id, 
                'name': name, 
                'email': email,
                'phone': norm_phone,
                'role': role,
                'is_verified': is_verified
            }
        }), 201
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': f'Registration error: {str(e)}'}), 500


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json() or {}
    email_or_phone = data.get('email', '').strip()
    new_password = data.get('password', '')
    
    if not email_or_phone or not new_password:
        return jsonify({'success': False, 'message': 'Email or mobile number and new password are required.'}), 400
        
    if len(new_password) < 6:
        return jsonify({'success': False, 'message': 'New password must be at least 6 characters long.'}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    query_identifier = email_or_phone.lower()
    norm_phone = normalize_phone_number(email_or_phone)
    
    cursor.execute('''
        SELECT id, name, email, phone 
        FROM users 
        WHERE LOWER(email) = LOWER(?) OR phone = ? OR phone = ?
    ''', (query_identifier, email_or_phone, norm_phone))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        return jsonify({'success': False, 'message': 'No registered account found with that email or mobile number.'}), 404
        
    pwd_hash = hash_password(new_password)
    cursor.execute('UPDATE users SET password_hash = ? WHERE id = ?', (pwd_hash, user['id']))
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'message': f"Password for '{user['name']}' ({user['email']}) has been successfully updated. Please sign in with your new password.",
        'email': user['email']
    })


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email_or_phone = data.get('email', '').strip()
    password = data.get('password', '')
    
    if not email_or_phone or not password:
        return jsonify({'success': False, 'message': 'Email/Phone and password are required.'}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    query_identifier = email_or_phone.lower()
    if query_identifier in ('admin', 'administrator', 'analyst'):
        query_identifier = PRIMARY_ADMIN_EMAIL
        
    norm_phone = normalize_phone_number(email_or_phone)
    cursor.execute('''
        SELECT id, name, email, phone, password_hash, role, is_verified 
        FROM users 
        WHERE LOWER(email) = LOWER(?) OR phone = ? OR phone = ?
    ''', (query_identifier, email_or_phone, norm_phone))
    user = cursor.fetchone()
    conn.close()
    
    if not user or not verify_password(password, user['password_hash']):
        return jsonify({'success': False, 'message': 'Invalid credentials or operator not found.'}), 401
        
    is_verified = int(user['is_verified'] if 'is_verified' in user.keys() and user['is_verified'] is not None else (1 if user['email'] == PRIMARY_ADMIN_EMAIL else 0))
    session['user_id'] = user['id']
    session['user_name'] = user['name']
    session['user_email'] = user['email']
    session['user_role'] = user['role']
    session['user_verified'] = is_verified
    
    return jsonify({
        'success': True,
        'message': 'Authentication successful.',
        'user': {
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'phone': user['phone'],
            'role': user['role'],
            'is_verified': is_verified
        }
    })

@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True, 'message': 'Successfully logged out.'})

@auth_bp.route('/me', methods=['GET'])
def get_current_user():
    user_id = session.get('user_id')
    user_email = session.get('user_email')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if user_id:
        cursor.execute('SELECT id, name, email, phone, role, is_verified, created_at FROM users WHERE id = ?', (user_id,))
        user = cursor.fetchone()
    elif user_email:
        cursor.execute('SELECT id, name, email, phone, role, is_verified, created_at FROM users WHERE email = ?', (user_email,))
        user = cursor.fetchone()
    else:
        # Default active session fallback
        cursor.execute('SELECT id, name, email, phone, role, is_verified, created_at FROM users WHERE email = ?', (PRIMARY_ADMIN_EMAIL,))
        user = cursor.fetchone()
        
    conn.close()
    
    if not user:
        return jsonify({'authenticated': False, 'user': None})
        
    is_verified = int(user['is_verified'] if 'is_verified' in user.keys() and user['is_verified'] is not None else (1 if user['email'] == PRIMARY_ADMIN_EMAIL else 0))
    is_admin = (user['email'] == PRIMARY_ADMIN_EMAIL or user['role'] == 'administrator')
    
    return jsonify({
        'authenticated': True,
        'user': {
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'phone': user['phone'],
            'role': user['role'],
            'is_verified': is_verified,
            'is_admin': is_admin,
            'created_at': user['created_at']
        }
    })

@auth_bp.route('/users', methods=['GET'])
def list_users():
    """
    Returns all registered platform users with verification status and mobile number.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, name, email, phone, role, is_verified, created_at 
        FROM users 
        ORDER BY id ASC
    ''')
    users = []
    for r in cursor.fetchall():
        d = dict(r)
        d['is_verified'] = int(d.get('is_verified') or 0)
        d['is_primary_admin'] = (d['email'] == PRIMARY_ADMIN_EMAIL)
        users.append(d)
    conn.close()
    return jsonify({'success': True, 'users': users})


@auth_bp.route('/users/<int:user_id>/verify', methods=['POST'])
def verify_user(user_id):
    """
    Admin action: Verifies a user so they can upload images and run analyses.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id, name, email FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return jsonify({'success': False, 'message': 'Operator account not found.'}), 404
        
    cursor.execute('UPDATE users SET is_verified = 1 WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'message': f"Operator '{user['name']}' ({user['email']}) has been verified. Image upload and analysis features are now authorized for this account.",
        'user_id': user_id
    })

@auth_bp.route('/users/<int:user_id>/revoke', methods=['POST'])
def revoke_user(user_id):
    """
    Admin action: Suspends/revokes a user's verification.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id, name, email FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return jsonify({'success': False, 'message': 'Operator account not found.'}), 404
        
    if user['email'] == PRIMARY_ADMIN_EMAIL:
        conn.close()
        return jsonify({'success': False, 'message': 'Cannot revoke verification for the primary administrator.'}), 400
        
    cursor.execute('UPDATE users SET is_verified = 0 WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'message': f"Verification revoked for '{user['name']}'. Upload permissions suspended.",
        'user_id': user_id
    })

@auth_bp.route('/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    """
    Admin action: Removes a user from the platform.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id, name, email FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return jsonify({'success': False, 'message': 'Operator account not found.'}), 404
        
    if user['email'] == PRIMARY_ADMIN_EMAIL:
        conn.close()
        return jsonify({'success': False, 'message': 'Primary administrator account cannot be deleted.'}), 400
        
    cursor.execute('DELETE FROM users WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'message': f"Operator '{user['name']}' ({user['email']}) was successfully removed from the system.",
        'deleted_id': user_id
    })

@auth_bp.route('/profile', methods=['GET', 'POST'])
def profile():
    user_id = session.get('user_id')
    user_email = session.get('user_email', PRIMARY_ADMIN_EMAIL)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'POST':
        data = request.get_json() or {}
        new_name = data.get('name')
        new_phone = data.get('phone')
        new_password = data.get('new_password')
        
        target_id = user_id
        if not target_id:
            cursor.execute('SELECT id FROM users WHERE email = ?', (user_email,))
            r = cursor.fetchone()
            if r: target_id = r['id']
            
        if target_id:
            if new_name:
                cursor.execute('UPDATE users SET name = ? WHERE id = ?', (new_name, target_id))
                session['user_name'] = new_name
                
            if new_phone:
                norm_p = normalize_phone_number(new_phone)
                cursor.execute('UPDATE users SET phone = ? WHERE id = ?', (norm_p, target_id))
                
            if new_password and len(new_password) >= 6:
                new_hash = hash_password(new_password)
                cursor.execute('UPDATE users SET password_hash = ? WHERE id = ?', (new_hash, target_id))
                
            conn.commit()
        
    if user_id:
        cursor.execute('SELECT id, name, email, phone, role, is_verified, created_at FROM users WHERE id = ?', (user_id,))
        user = cursor.fetchone()
    else:
        cursor.execute('SELECT id, name, email, phone, role, is_verified, created_at FROM users WHERE email = ?', (user_email,))
        user = cursor.fetchone()
    
    # Also fetch station settings
    cursor.execute("SELECT key, value FROM system_settings")
    settings = {row['key']: row['value'] for row in cursor.fetchall()}
    conn.close()
    
    user_dict = dict(user) if user else {'name': 'Krishna Prasath (Admin)', 'email': PRIMARY_ADMIN_EMAIL, 'role': 'administrator', 'is_verified': 1}
    user_dict['is_admin'] = (user_dict.get('email') == PRIMARY_ADMIN_EMAIL or user_dict.get('role') == 'administrator')
    
    return jsonify({
        'success': True,
        'user': user_dict,
        'settings': settings
    })
