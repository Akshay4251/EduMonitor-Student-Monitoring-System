"""
Auth REST endpoints.
Registration creates user in Firebase Auth + Firestore and sets role claim.
"""

from flask import Blueprint, request, jsonify, g
from datetime import datetime, timezone
from config import firebase_auth, db
from auth.middleware import require_auth, require_role

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


# ── Registration ──────────────────────────────────────────────────
@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json(force=True)
    email        = data.get('email')
    password     = data.get('password')
    display_name = data.get('displayName', '')
    role         = data.get('role', 'student')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400
    if role not in ('student', 'teacher', 'admin'):
        return jsonify({'error': 'Invalid role'}), 400

    try:
        uid = None
        # Check if client passed an authorized token
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token_str = auth_header.split('Bearer ')[1]
            try:
                decoded = firebase_auth.verify_id_token(token_str)
                uid = decoded.get('uid')
            except Exception:
                pass

        if not uid:
            try:
                user = firebase_auth.create_user(
                    email=email,
                    password=password,
                    display_name=display_name,
                )
                uid = getattr(user, 'uid', None)
            except Exception:
                # Check if user already exists
                if hasattr(firebase_auth, 'get_user_by_email'):
                    try:
                        existing = firebase_auth.get_user_by_email(email)
                        uid = getattr(existing, 'uid', None)
                    except Exception:
                        pass
                if not uid:
                    docs = db.collection('users').where('email', '==', email).stream()
                    for d in docs:
                        uid = d.id
                        break

        if not uid:
            import uuid
            uid = f"user-{str(uuid.uuid4())[:8]}"

        try:
            firebase_auth.set_custom_user_claims(uid, {'role': role})
        except Exception:
            pass

        user_doc = {
            'uid': uid,
            'email': email,
            'displayName': display_name or email.split('@')[0],
            'role': role,
            'createdAt': datetime.now(timezone.utc).isoformat(),
            'active': True,
            'enrolledClasses': [],
            'password': password,
        }
        db.collection('users').document(uid).set(user_doc, merge=True)

        token = None
        if hasattr(firebase_auth, 'create_mock_token'):
            token = firebase_auth.create_mock_token(uid, email, user_doc['displayName'], role)
        else:
            import jwt, time
            from config import SECRET_KEY
            payload = {'uid': uid, 'email': email, 'name': user_doc['displayName'], 'role': role, 'iat': int(time.time()), 'exp': int(time.time()) + 86400 * 7}
            token = jwt.encode(payload, SECRET_KEY, algorithm='HS256')

        return jsonify({'message': 'User created', 'uid': uid, 'role': role, 'token': token}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400


# ── Direct / Local Login ─────────────────────────────────────────
@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(force=True)
    email    = data.get('email', '').strip()
    password = data.get('password', '').strip()

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    user_doc = None
    docs = list(db.collection('users').where('email', '==', email).stream())
    if docs:
        user_doc = docs[0]
    else:
        # Check aliases array for institutional users
        alias_docs = list(db.collection('users').where('aliases', 'array_contains', email).stream())
        if alias_docs:
            user_doc = alias_docs[0]

    if not user_doc:
        return jsonify({'error': 'No account found with this email'}), 404

    u = user_doc.to_dict()
    if not u.get('active', True):
        return jsonify({'error': 'Account is disabled. Contact your administrator.'}), 403

    stored_pw = u.get('password')
    if stored_pw and stored_pw != password:
        return jsonify({'error': 'Invalid email or password'}), 401

    uid  = u.get('uid') or user_doc.id
    role = u.get('role', 'student')
    name = u.get('displayName', email)

    if hasattr(firebase_auth, 'create_mock_token'):
        token = firebase_auth.create_mock_token(uid, email, name, role)
    else:
        import jwt, time
        from config import SECRET_KEY
        payload = {'uid': uid, 'email': email, 'name': name, 'role': role, 'iat': int(time.time()), 'exp': int(time.time()) + 86400 * 7}
        token = jwt.encode(payload, SECRET_KEY, algorithm='HS256')

    return jsonify({
        'token': token,
        'user': {
            'uid': uid,
            'email': email,
            'displayName': name,
            'role': role,
        }
    })


# ── Profile ───────────────────────────────────────────────────────
@auth_bp.route('/profile', methods=['GET'])
@require_auth
def get_profile():
    doc = db.collection('users').document(g.uid).get()
    if not doc.exists:
        profile = {
            'uid': g.uid,
            'email': g.user.get('email', ''),
            'displayName': g.user.get('name') or g.user.get('displayName') or (g.user.get('email', '').split('@')[0] if g.user.get('email') else 'User'),
            'role': g.role,
            'createdAt': datetime.now(timezone.utc).isoformat(),
            'active': True,
            'enrolledClasses': []
        }
        db.collection('users').document(g.uid).set(profile, merge=True)
    else:
        profile = doc.to_dict()
    profile['uid'] = g.uid
    return jsonify(profile)


@auth_bp.route('/profile', methods=['PUT'])
@require_auth
def update_profile():
    data = request.get_json(force=True)
    allowed = {'displayName', 'avatar'}
    updates = {k: v for k, v in data.items() if k in allowed}
    if updates:
        db.collection('users').document(g.uid).update(updates)
        if 'displayName' in updates:
            firebase_auth.update_user(g.uid, display_name=updates['displayName'])
    return jsonify({'message': 'Profile updated'})


# ── Role Management (Admin only) ─────────────────────────────────
@auth_bp.route('/set-role', methods=['POST'])
@require_auth
@require_role('admin')
def set_role():
    data = request.get_json(force=True)
    uid  = data.get('uid')
    role = data.get('role')

    if role not in ('student', 'teacher', 'admin'):
        return jsonify({'error': 'Invalid role'}), 400
    try:
        firebase_auth.set_custom_user_claims(uid, {'role': role})
        db.collection('users').document(uid).update({'role': role})
        return jsonify({'message': f'Role set to {role}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400


# ── List all users (Admin only) ──────────────────────────────────
@auth_bp.route('/users', methods=['GET'])
@require_auth
@require_role('admin')
def list_users():
    docs = db.collection('users').stream()
    users = []
    for d in docs:
        u = d.to_dict()
        u['uid'] = d.id
        users.append(u)
    return jsonify(users)
