"""
Session lifecycle REST endpoints.
Teachers create / start / end sessions; students join / leave.
"""

from flask import Blueprint, request, jsonify, g
from datetime import datetime, timezone
from config import db
from auth.middleware import require_auth, require_role
from sessions.realtime import broadcast_session_event
import uuid

sessions_bp = Blueprint('sessions', __name__, url_prefix='/api/sessions')


@sessions_bp.route('', methods=['POST'])
@require_auth
@require_role('teacher', 'admin')
def create_session():
    data = request.get_json(force=True)
    session_id = str(uuid.uuid4())[:10]
    join_code  = str(uuid.uuid4())[:6].upper()
    class_id   = data.get('classId')

    # Verify class exists
    class_doc = db.collection('classes').document(class_id).get()
    if not class_doc.exists:
        return jsonify({'error': 'Class not found'}), 404

    session_data = {
        'id':           session_id,
        'classId':      class_id,
        'className':    class_doc.to_dict().get('name', ''),
        'teacherId':    g.uid,
        'teacherName':  g.user.get('name', ''),
        'title':        data.get('title', 'Live Session'),
        'description':  data.get('description', ''),
        'scheduledAt':  data.get('scheduledAt', ''),
        'startedAt':    None,
        'endedAt':      None,
        'status':       'scheduled',   # scheduled → live → ended
        'joinCode':     join_code,
        'participants': [],
        'createdAt':    datetime.now(timezone.utc).isoformat(),
    }
    db.collection('sessions').document(session_id).set(session_data)
    return jsonify(session_data), 201


@sessions_bp.route('', methods=['GET'])
@require_auth
def list_sessions():
    class_id = request.args.get('classId')
    status   = request.args.get('status')

    query = db.collection('sessions')
    if class_id:
        query = query.where('classId', '==', class_id)
    if status:
        query = query.where('status', '==', status)
    if g.role == 'teacher':
        query = query.where('teacherId', '==', g.uid)

    docs = query.stream()
    return jsonify([d.to_dict() for d in docs])


@sessions_bp.route('/join', methods=['POST'])
@require_auth
def join_session():
    """Join session by join code or session ID."""
    data = request.get_json(force=True) or {}
    raw_code = data.get('joinCode', '').strip()
    if not raw_code:
        return jsonify({'error': 'Join code or Session ID is required'}), 400

    # 1. Direct document ID lookup
    doc = db.collection('sessions').document(raw_code).get()
    if doc.exists:
        sdata = doc.to_dict()
        return jsonify({'message': 'Session found', 'session': sdata, 'sessionId': sdata.get('id', doc.id)})

    # 2. Join code lookup (case-insensitive)
    docs = list(db.collection('sessions').where('joinCode', '==', raw_code.upper()).stream())
    if docs:
        sdata = docs[0].to_dict()
        return jsonify({'message': 'Session found', 'session': sdata, 'sessionId': sdata.get('id', docs[0].id)})

    # 3. Fallback search by title or prefix
    all_docs = db.collection('sessions').stream()
    for d in all_docs:
        sd = d.to_dict()
        if (sd.get('id') and sd['id'].lower() == raw_code.lower()) or \
           (sd.get('joinCode') and sd['joinCode'].upper() == raw_code.upper()):
            return jsonify({'message': 'Session found', 'session': sd, 'sessionId': sd.get('id', d.id)})

    return jsonify({'error': f'No session found with code or ID: {raw_code}'}), 404


@sessions_bp.route('/<session_id>', methods=['GET'])
@require_auth
def get_session(session_id):
    doc = db.collection('sessions').document(session_id).get()
    if not doc.exists:
        # Check by joinCode fallback
        docs = list(db.collection('sessions').where('joinCode', '==', session_id.strip().upper()).stream())
        if docs:
            return jsonify(docs[0].to_dict())
        return jsonify({'error': 'Session not found'}), 404
    return jsonify(doc.to_dict())


@sessions_bp.route('/<session_id>/start', methods=['POST'])
@require_auth
@require_role('teacher', 'admin')
def start_session(session_id):
    now = datetime.now(timezone.utc).isoformat()
    db.collection('sessions').document(session_id).update({
        'status': 'live',
        'startedAt': now,
    })
    broadcast_session_event('session_started', session_id, {'sessionId': session_id, 'startedAt': now})
    return jsonify({'message': 'Session started', 'startedAt': now})


@sessions_bp.route('/<session_id>/end', methods=['POST'])
@require_auth
@require_role('teacher', 'admin')
def end_session(session_id):
    now = datetime.now(timezone.utc).isoformat()
    db.collection('sessions').document(session_id).update({
        'status': 'ended',
        'endedAt': now,
    })
    broadcast_session_event('session_ended', session_id, {'sessionId': session_id, 'endedAt': now})
    return jsonify({'message': 'Session ended', 'endedAt': now})


# ── Attendance sub-collection ─────────────────────────────────────
@sessions_bp.route('/<session_id>/attendance', methods=['GET'])
@require_auth
@require_role('teacher', 'admin')
def get_attendance(session_id):
    docs = db.collection('sessions').document(session_id) \
             .collection('attendance').stream()
    records = []
    for d in docs:
        rec = d.to_dict()
        rec['uid'] = d.id
        records.append(rec)
    return jsonify(records)


@sessions_bp.route('/<session_id>/polls', methods=['POST'])
@require_auth
@require_role('teacher')
def create_poll(session_id):
    data = request.get_json(force=True)
    poll_id = str(uuid.uuid4())[:8]
    poll = {
        'id':        poll_id,
        'question':  data.get('question', ''),
        'options':   data.get('options', []),
        'responses': {},
        'active':    True,
        'createdAt': datetime.now(timezone.utc).isoformat(),
    }
    db.collection('sessions').document(session_id) \
      .collection('polls').document(poll_id).set(poll)
    return jsonify(poll), 201


@sessions_bp.route('/<session_id>/polls', methods=['GET'])
@require_auth
def list_polls(session_id):
    docs = db.collection('sessions').document(session_id) \
             .collection('polls').stream()
    return jsonify([d.to_dict() for d in docs])


@sessions_bp.route('/<session_id>/quizzes', methods=['POST'])
@require_auth
@require_role('teacher')
def create_quiz(session_id):
    data = request.get_json(force=True)
    quiz_id = str(uuid.uuid4())[:8]
    quiz = {
        'id':        quiz_id,
        'title':     data.get('title', 'Quiz'),
        'questions': data.get('questions', []),
        'responses': {},
        'active':    True,
        'duration':  data.get('duration', 300),  # seconds
        'createdAt': datetime.now(timezone.utc).isoformat(),
    }
    db.collection('sessions').document(session_id) \
      .collection('quizzes').document(quiz_id).set(quiz)
    return jsonify(quiz), 201


@sessions_bp.route('/<session_id>/quizzes', methods=['GET'])
@require_auth
def list_quizzes(session_id):
    docs = db.collection('sessions').document(session_id) \
             .collection('quizzes').stream()
    return jsonify([d.to_dict() for d in docs])
