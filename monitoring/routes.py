"""
Monitoring & analytics REST endpoints.
"""

from flask import Blueprint, request, jsonify, g
from datetime import datetime, timezone
from config import db
from auth.middleware import require_auth, require_role
from monitoring.scoring import calculate_engagement

monitoring_bp = Blueprint('monitoring', __name__, url_prefix='/api/monitoring')


@monitoring_bp.route('/session/<session_id>/activity', methods=['GET'])
@require_auth
@require_role('teacher', 'admin')
def session_activity(session_id):
    """All students' activity data for one session."""
    docs = db.collection('sessions').document(session_id) \
             .collection('activity').stream()
    records = []
    for d in docs:
        rec = d.to_dict()
        rec['uid'] = d.id
        records.append(rec)
    return jsonify(records)


@monitoring_bp.route('/session/<session_id>/engagement', methods=['GET'])
@require_auth
def session_engagement(session_id):
    """Compute engagement scores for all students in a session."""
    # Session duration
    session_doc = db.collection('sessions').document(session_id).get()
    if not session_doc.exists:
        return jsonify({'error': 'Session not found'}), 404

    sd = session_doc.to_dict()
    started = sd.get('startedAt')
    ended   = sd.get('endedAt')
    if not started:
        return jsonify({'error': 'Session not yet started'}), 400

    try:
        t_start = datetime.fromisoformat(started)
        t_end   = datetime.fromisoformat(ended) if ended else datetime.now(timezone.utc)
        duration = (t_end - t_start).total_seconds()
    except Exception:
        duration = 3600  # fallback 1 h

    # Gather activity + attendance
    att_docs = {d.id: d.to_dict() for d in
                db.collection('sessions').document(session_id)
                  .collection('attendance').stream()}
    act_docs = {d.id: d.to_dict() for d in
                db.collection('sessions').document(session_id)
                  .collection('activity').stream()}

    results = []
    all_uids = set(att_docs.keys()) | set(act_docs.keys())
    for uid in all_uids:
        merged = {**att_docs.get(uid, {}), **act_docs.get(uid, {})}
        scores = calculate_engagement(duration, merged)
        scores['uid']  = uid
        scores['name'] = merged.get('name', '')

        # Persist score
        db.collection('sessions').document(session_id) \
          .collection('engagement').document(uid).set(scores, merge=True)

        results.append(scores)

    # Sort by score descending
    results.sort(key=lambda x: x.get('score', 0), reverse=True)
    return jsonify({'sessionDuration': round(duration), 'students': results})


@monitoring_bp.route('/student/<student_uid>/history', methods=['GET'])
@require_auth
def student_history(student_uid):
    """Engagement history across all sessions for one student."""
    # Students can only see their own data
    if g.role == 'student' and g.uid != student_uid:
        return jsonify({'error': 'Forbidden'}), 403

    # Find sessions this student attended
    sessions = db.collection_group('attendance') \
                 .where('uid', '==', student_uid).stream()

    history = []
    for att_doc in sessions:
        session_ref = att_doc.reference.parent.parent
        session_id  = session_ref.id

        session_snap = session_ref.get()
        if not session_snap.exists:
            continue
        sd = session_snap.to_dict()

        eng_doc = session_ref.collection('engagement').document(student_uid).get()
        eng = eng_doc.to_dict() if eng_doc.exists else {}

        history.append({
            'sessionId':   session_id,
            'sessionTitle': sd.get('title', ''),
            'className':   sd.get('className', ''),
            'date':        sd.get('startedAt', sd.get('scheduledAt', '')),
            'score':       eng.get('score', 0),
            'attendance':  eng.get('attendance', 0),
            'focus':       eng.get('focus', 0),
            'participation': eng.get('participation', 0),
        })

    history.sort(key=lambda x: x.get('date', ''), reverse=True)
    return jsonify(history)


@monitoring_bp.route('/class/<class_id>/summary', methods=['GET'])
@require_auth
@require_role('teacher', 'admin')
def class_summary(class_id):
    """Aggregate engagement stats for a class across all sessions."""
    sessions = db.collection('sessions').where('classId', '==', class_id).stream()

    class_data = []
    for s_doc in sessions:
        sd = s_doc.to_dict()
        eng_docs_list = list(db.collection('sessions').document(s_doc.id).collection('engagement').stream())

        scores = [e.to_dict().get('score', 0) for e in eng_docs_list]
        focus_list = [e.to_dict().get('focus', 0) for e in eng_docs_list]
        att_list = [e.to_dict().get('attendance', 0) for e in eng_docs_list]
        part_list = [e.to_dict().get('participation', 0) for e in eng_docs_list]

        avg = sum(scores) / len(scores) if scores else 0
        avg_focus = sum(focus_list) / len(focus_list) if focus_list else 0
        avg_att = sum(att_list) / len(att_list) if att_list else 0
        avg_part = sum(part_list) / len(part_list) if part_list else 0

        class_data.append({
            'sessionId':        s_doc.id,
            'title':            sd.get('title', ''),
            'date':             sd.get('startedAt', sd.get('createdAt', '')),
            'studentCount':     len(scores),
            'avgScore':         round(avg, 1),
            'avgFocus':         round(avg_focus, 1),
            'avgAttendance':    round(avg_att, 1),
            'avgParticipation': round(avg_part, 1),
            'status':           sd.get('status', 'ended'),
        })

    class_data.sort(key=lambda x: x.get('date', ''), reverse=True)
    return jsonify(class_data)
