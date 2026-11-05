"""
Admin management endpoints — user listing, deactivation, system stats.
"""

from flask import Blueprint, request, jsonify, g
from config import firebase_auth, db
from auth.middleware import require_auth, require_role

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')


@admin_bp.route('/stats', methods=['GET'])
@require_auth
@require_role('admin')
def system_stats():
    """High-level platform statistics computed dynamically from database."""
    docs    = list(db.collection('users').stream())
    classes = list(db.collection('classes').where('active', '==', True).stream())
    sessions_live = list(db.collection('sessions').where('status', '==', 'live').stream())
    sessions_all  = list(db.collection('sessions').stream())

    # Count unique users by canonical UID to avoid double-counting alias records
    unique_users = {}
    for d in docs:
        u = d.to_dict()
        uid = u.get('uid') or d.id
        if uid not in unique_users:
            unique_users[uid] = u

    role_counts = {'student': 0, 'teacher': 0, 'admin': 0}
    for u in unique_users.values():
        r = u.get('role', 'student')
        role_counts[r] = role_counts.get(r, 0) + 1

    return jsonify({
        'totalUsers':    len(unique_users),
        'roleCounts':    role_counts,
        'activeClasses': len(classes),
        'liveSessions':  len(sessions_live),
        'totalSessions': len(sessions_all),
    })


@admin_bp.route('/users', methods=['GET'])
@require_auth
@require_role('admin')
def list_users():
    docs = db.collection('users').stream()
    users = []
    seen = set()
    for d in docs:
        u = d.to_dict()
        uid = u.get('uid') or d.id
        # Skip duplicate alias representations
        if uid in seen:
            continue
        if '@' in d.id and d.id != u.get('email'):
            continue
        seen.add(uid)
        u['uid'] = uid
        users.append(u)
    # Sort with newest registered users at the top!
    users.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
    return jsonify(users)


@admin_bp.route('/users/<uid>', methods=['PUT'])
@require_auth
@require_role('admin')
def update_user(uid):
    data = request.get_json(force=True)
    allowed = {'displayName', 'role', 'active'}
    updates = {k: v for k, v in data.items() if k in allowed}

    if 'role' in updates:
        firebase_auth.set_custom_user_claims(uid, {'role': updates['role']})
    if 'active' in updates and not updates['active']:
        firebase_auth.update_user(uid, disabled=True)
    elif 'active' in updates and updates['active']:
        firebase_auth.update_user(uid, disabled=False)

    if updates:
        db.collection('users').document(uid).update(updates)

    return jsonify({'message': 'User updated'})


@admin_bp.route('/users/<uid>', methods=['DELETE'])
@require_auth
@require_role('admin')
def deactivate_user(uid):
    firebase_auth.update_user(uid, disabled=True)
    db.collection('users').document(uid).update({'active': False})
    return jsonify({'message': 'User deactivated'})


@admin_bp.route('/classes', methods=['GET'])
@require_auth
@require_role('admin')
def list_all_classes():
    docs = db.collection('classes').stream()
    return jsonify([{**d.to_dict(), 'id': d.id} for d in docs])


@admin_bp.route('/sessions', methods=['GET'])
@require_auth
@require_role('admin')
def list_all_sessions():
    status = request.args.get('status')
    query = db.collection('sessions')
    if status:
        query = query.where('status', '==', status)
    docs = query.stream()
    return jsonify([d.to_dict() for d in docs])
