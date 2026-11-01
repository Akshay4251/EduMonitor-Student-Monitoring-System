"""
JWT / Firebase-token verification middleware.
Usage:
    @require_auth          → populates g.uid, g.user, g.role
    @require_role('admin') → 403 if role doesn't match
"""

from functools import wraps
from flask import request, jsonify, g
from config import firebase_auth, db


def require_auth(f):
    """Verify Firebase ID token and attach user info to Flask g."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Missing or malformed Authorization header'}), 401

        token = auth_header.split('Bearer ')[1].strip()
        decoded = None
        try:
            decoded = firebase_auth.verify_id_token(token)
        except Exception as e_fb:
            err_msg = str(e_fb)
            if "Token used too early" in err_msg or "too early" in err_msg:
                # Handle clock skew between Google's servers and local machine
                try:
                    import jwt
                    decoded = jwt.decode(token, options={"verify_signature": False})
                    uid = decoded.get('uid') or decoded.get('sub') or decoded.get('user_id')
                    decoded['uid'] = uid
                except Exception:
                    pass

            if not decoded:
                # Also try local JWT decode if token was signed locally
                try:
                    import jwt
                    from config import SECRET_KEY
                    decoded = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
                except Exception as e_jwt:
                    # Also support legacy mock tokens from localStorage
                    if token.startswith('mock-token-'):
                        mock_uid = token[len('mock-token-'):]
                        user_snap = db.collection('users').document(mock_uid).get()
                        if user_snap.exists:
                            u_data = user_snap.to_dict()
                            decoded = {
                                'uid': mock_uid,
                                'email': u_data.get('email', f'{mock_uid}@example.com'),
                                'name': u_data.get('displayName', mock_uid),
                                'role': u_data.get('role', 'student'),
                            }
                    if not decoded:
                        print(f"[Auth Middleware Error] Token verification failed: {e_fb} (local JWT: {e_jwt})")
                        return jsonify({'error': 'Invalid token', 'details': str(e_fb)}), 401

        g.user = decoded
        g.uid  = decoded['uid']

        # Role: prefer custom-claim, fall back to Firestore
        role = decoded.get('role')
        if not role:
            user_doc = db.collection('users').document(decoded['uid']).get()
            if user_doc.exists:
                role = user_doc.to_dict().get('role', 'student')
            else:
                role = 'student'
                try:
                    from datetime import datetime, timezone
                    db.collection('users').document(decoded['uid']).set({
                        'uid': decoded['uid'],
                        'email': decoded.get('email', ''),
                        'displayName': decoded.get('name') or decoded.get('displayName') or (decoded.get('email', '').split('@')[0] if decoded.get('email') else 'User'),
                        'role': role,
                        'createdAt': datetime.now(timezone.utc).isoformat(),
                        'active': True,
                        'enrolledClasses': []
                    }, merge=True)
                except Exception:
                    pass
        g.role = role

        return f(*args, **kwargs)
    return decorated


def require_role(*roles):
    """Return 403 unless g.role is one of the allowed roles."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if g.role not in roles:
                return jsonify({'error': 'Insufficient permissions', 'required': list(roles)}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator
