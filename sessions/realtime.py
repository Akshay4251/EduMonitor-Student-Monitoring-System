"""
Socket.IO event handlers for live sessions.
Handles: chat, hand-raise, polls, quizzes, activity pings, alerts.
"""

from datetime import datetime, timezone
from config import db, ALERT_THRESHOLD_MINUTES
import time

# In-memory stores (per-session, keyed by session_id)
_participants  = {}   # { session_id: { uid: {name, joinTime, ...} } }
_hand_raises   = {}   # { session_id: set(uid) }
_activity_data = {}   # { session_id: { uid: { last_active, tab_visible, ... } } }
_sid_to_user   = {}   # { socket_sid: (uid, session_id, name) }
_socketio_instance = None


def broadcast_session_event(event_name, session_id, data):
    """Broadcast a custom event to all clients in a session room."""
    if _socketio_instance:
        try:
            _socketio_instance.emit(event_name, data, room=session_id)
        except Exception as e:
            print(f"[Socket Warning] Broadcast error: {e}")


def register_socket_events(socketio):
    """Register all Socket.IO event handlers."""
    global _socketio_instance
    _socketio_instance = socketio

    # ── Join / Leave ──────────────────────────────────────────────
    @socketio.on('join_session')
    def on_join(data):
        from flask_socketio import join_room, emit
        from flask import request as freq

        sid        = freq.sid
        session_id = data['sessionId']
        uid        = data['uid']
        name       = data.get('name', 'Anonymous')
        role       = data.get('role', 'student')

        join_room(session_id)
        join_room(f'{session_id}__{role}')   # role-specific sub-room

        # Track participant
        _participants.setdefault(session_id, {})[uid] = {
            'name': name, 'role': role,
            'joinTime': datetime.now(timezone.utc).isoformat(),
            'sid': sid,
        }
        _sid_to_user[sid] = (uid, session_id, name)

        # Write attendance record
        db.collection('sessions').document(session_id) \
          .collection('attendance').document(uid).set({
              'uid': uid, 'name': name,
              'joinTime': datetime.now(timezone.utc).isoformat(),
              'leaveTime': None, 'duration': 0, 'status': 'present',
          }, merge=True)

        # Init activity tracking
        _activity_data.setdefault(session_id, {})[uid] = {
            'lastActive': time.time(),
            'tabVisible': True, 'isIdle': False, 'facePresent': False,
            'tabSwitchCount': 0, 'tabAwayDuration': 0,
            'idleDuration': 0, 'faceDetectedDuration': 0, 'chatCount': 0,
            'pollResponses': 0, 'quizResponses': 0, 'handRaiseCount': 0,
            'lastTabAway': None, 'lastIdleStart': None,
            'lastFacePing': time.time(), 'lastFlush': time.time(),
        }

        emit('participant_update', {
            'participants': _safe_participants(session_id),
            'joined': {'uid': uid, 'name': name},
        }, room=session_id)

    @socketio.on('leave_session')
    def on_leave(data):
        _handle_leave(data.get('sessionId'), data.get('uid'))

    @socketio.on('disconnect')
    def on_disconnect():
        from flask import request as freq
        info = _sid_to_user.pop(freq.sid, None)
        if info:
            uid, session_id, _ = info
            _handle_leave(session_id, uid)

    def _handle_leave(session_id, uid):
        from flask_socketio import leave_room, emit

        if not session_id or not uid:
            return

        leave_room(session_id)
        p = _participants.get(session_id, {}).pop(uid, None)
        if p:
            join_time = p.get('joinTime', '')
            if join_time:
                try:
                    jt = datetime.fromisoformat(join_time)
                    dur = (datetime.now(timezone.utc) - jt).total_seconds()
                except Exception:
                    dur = 0
            else:
                dur = 0

            db.collection('sessions').document(session_id) \
              .collection('attendance').document(uid).update({
                  'leaveTime': datetime.now(timezone.utc).isoformat(),
                  'duration': dur,
              })

        # Flush activity data
        act = _activity_data.get(session_id, {}).pop(uid, None)
        if act:
            _flush_activity(session_id, uid, act)

        emit('participant_update', {
            'participants': _safe_participants(session_id),
            'left': {'uid': uid},
        }, room=session_id)

    # ── Chat ──────────────────────────────────────────────────────
    @socketio.on('chat_message')
    def on_chat(data):
        from flask_socketio import emit
        session_id = data['sessionId']
        uid        = data['uid']
        name       = data.get('name', 'Anonymous')
        message    = data.get('message', '')

        if not message.strip():
            return

        msg_data = {
            'uid': uid, 'name': name,
            'message': message,
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }
        db.collection('sessions').document(session_id) \
          .collection('chat').add(msg_data)

        # Bump participation
        act = _activity_data.get(session_id, {}).get(uid)
        if act:
            act['chatCount'] += 1
            act['lastActive'] = time.time()

        emit('new_chat_message', msg_data, room=session_id)

    # ── Hand Raise ────────────────────────────────────────────────
    @socketio.on('hand_raise')
    def on_hand_raise(data):
        from flask_socketio import emit
        session_id = data['sessionId']
        uid        = data['uid']
        raised     = data.get('raised', True)

        _hand_raises.setdefault(session_id, set())
        if raised:
            _hand_raises[session_id].add(uid)
        else:
            _hand_raises[session_id].discard(uid)

        act = _activity_data.get(session_id, {}).get(uid)
        if act and raised:
            act['handRaiseCount'] += 1
            act['lastActive'] = time.time()

        emit('hand_raised', {
            'uid': uid, 'name': data.get('name', ''),
            'raised': raised,
            'allRaised': list(_hand_raises[session_id]),
        }, room=session_id)

    # ── Poll Response ─────────────────────────────────────────────
    @socketio.on('poll_response')
    def on_poll_response(data):
        from flask_socketio import emit
        session_id = data['sessionId']
        uid        = data['uid']
        poll_id    = data['pollId']
        option     = data['optionIndex']

        db.collection('sessions').document(session_id) \
          .collection('polls').document(poll_id) \
          .update({f'responses.{uid}': option})

        act = _activity_data.get(session_id, {}).get(uid)
        if act:
            act['pollResponses'] += 1
            act['lastActive'] = time.time()

        # Broadcast updated results to teacher room
        poll_doc = db.collection('sessions').document(session_id) \
                     .collection('polls').document(poll_id).get()
        if poll_doc.exists:
            emit('poll_update', poll_doc.to_dict(), room=f'{session_id}__teacher')

    # ── Quiz Response ─────────────────────────────────────────────
    @socketio.on('quiz_response')
    def on_quiz_response(data):
        from flask_socketio import emit
        session_id = data['sessionId']
        uid        = data['uid']
        quiz_id    = data['quizId']
        answers    = data['answers']

        db.collection('sessions').document(session_id) \
          .collection('quizzes').document(quiz_id) \
          .update({f'responses.{uid}': answers})

        act = _activity_data.get(session_id, {}).get(uid)
        if act:
            act['quizResponses'] += 1
            act['lastActive'] = time.time()

        emit('quiz_submitted', {'uid': uid, 'quizId': quiz_id}, room=f'{session_id}__teacher')

    # ── Activity Ping (every 10 s from client) ────────────────────
    @socketio.on('activity_ping')
    def on_activity_ping(data):
        from flask_socketio import emit
        session_id = data['sessionId']
        uid        = data['uid']

        act = _activity_data.get(session_id, {}).get(uid)
        if not act:
            return

        now = time.time()
        tab_visible  = data.get('tabVisible', True)
        is_idle      = data.get('isIdle', False)
        face_present = data.get('facePresent', False)

        # ── Tab away tracking ──
        if not tab_visible and act['tabVisible']:
            act['lastTabAway'] = now
            act['tabSwitchCount'] += 1
        elif tab_visible and not act['tabVisible'] and act['lastTabAway']:
            act['tabAwayDuration'] += now - act['lastTabAway']
            act['lastTabAway'] = None

        # ── Idle tracking ──
        if is_idle and not act['isIdle']:
            act['lastIdleStart'] = now
        elif not is_idle and act['isIdle'] and act['lastIdleStart']:
            act['idleDuration'] += now - act['lastIdleStart']
            act['lastIdleStart'] = None

        # ── Face presence tracking ──
        last_face = act.get('lastFacePing', now)
        dt = max(0.0, min(now - last_face, 15.0))
        act['lastFacePing'] = now
        if face_present:
            act['faceDetectedDuration'] = act.get('faceDetectedDuration', 0) + dt

        act['tabVisible']  = tab_visible
        act['isIdle']      = is_idle
        act['facePresent'] = face_present
        if not is_idle:
            act['lastActive'] = now

        # ── Periodic batch flush (every 30s) ──
        if now - act.get('lastFlush', 0) >= 30:
            _flush_activity(session_id, uid, act)
            act['lastFlush'] = now

        # ── Alert check ──
        inactive_students = []
        for s_uid, s_act in _activity_data.get(session_id, {}).items():
            if s_uid == uid:
                continue
            idle_min = (now - s_act.get('lastActive', now)) / 60
            if idle_min >= ALERT_THRESHOLD_MINUTES or not s_act.get('tabVisible', True):
                p_info = _participants.get(session_id, {}).get(s_uid, {})
                inactive_students.append({
                    'uid': s_uid,
                    'name': p_info.get('name', 'Unknown'),
                    'idleMinutes': round(idle_min, 1),
                    'tabVisible': s_act.get('tabVisible', True),
                    'facePresent': s_act.get('facePresent', False),
                })

        if inactive_students:
            emit('activity_alert', {
                'students': inactive_students,
                'message': f'{len(inactive_students)} student(s) inactive for {ALERT_THRESHOLD_MINUTES}+ min',
            }, room=f'{session_id}__teacher')

        # Send live activity grid to teacher
        emit('live_activity', _build_activity_grid(session_id), room=f'{session_id}__teacher')

    # ── WebRTC Signalling ─────────────────────────────────────────
    @socketio.on('webrtc_offer')
    def on_offer(data):
        from flask_socketio import emit
        target_sid = _get_sid(data['sessionId'], data['to'])
        if target_sid:
            emit('webrtc_offer', {
                'from': data['from'], 'offer': data['offer'],
            }, room=target_sid)

    @socketio.on('webrtc_answer')
    def on_answer(data):
        from flask_socketio import emit
        target_sid = _get_sid(data['sessionId'], data['to'])
        if target_sid:
            emit('webrtc_answer', {
                'from': data['from'], 'answer': data['answer'],
            }, room=target_sid)

    @socketio.on('webrtc_ice')
    def on_ice(data):
        from flask_socketio import emit
        target_sid = _get_sid(data['sessionId'], data['to'])
        if target_sid:
            emit('webrtc_ice', {
                'from': data['from'], 'candidate': data['candidate'],
            }, room=target_sid)

    # ── Broadcast poll / quiz to students ─────────────────────────
    @socketio.on('broadcast_poll')
    def on_broadcast_poll(data):
        from flask_socketio import emit
        emit('new_poll', data['poll'], room=data['sessionId'])

    @socketio.on('end_poll')
    def on_end_poll(data):
        from flask_socketio import emit
        session_id = data['sessionId']
        poll_id    = data['pollId']
        db.collection('sessions').document(session_id) \
          .collection('polls').document(poll_id).update({'active': False})
        poll_doc = db.collection('sessions').document(session_id) \
                     .collection('polls').document(poll_id).get()
        if poll_doc.exists:
            emit('poll_ended', poll_doc.to_dict(), room=session_id)

    @socketio.on('broadcast_quiz')
    def on_broadcast_quiz(data):
        from flask_socketio import emit
        emit('new_quiz', data['quiz'], room=data['sessionId'])


# ── Helpers ───────────────────────────────────────────────────────
def _safe_participants(session_id):
    """Return serialisable participant list."""
    return [
        {'uid': uid, 'name': info.get('name'), 'role': info.get('role')}
        for uid, info in _participants.get(session_id, {}).items()
    ]


def _get_sid(session_id, uid):
    """Look up Socket.IO sid for a user in a session."""
    p = _participants.get(session_id, {}).get(uid)
    return p.get('sid') if p else None


def _build_activity_grid(session_id):
    """Build a snapshot of all students' activity for the teacher dashboard."""
    now = time.time()
    grid = []
    for uid, act in _activity_data.get(session_id, {}).items():
        p = _participants.get(session_id, {}).get(uid, {})
        if p.get('role') == 'teacher':
            continue
        grid.append({
            'uid': uid,
            'name': p.get('name', 'Unknown'),
            'tabVisible': act.get('tabVisible', True),
            'isIdle': act.get('isIdle', False),
            'facePresent': act.get('facePresent', False),
            'idleSeconds': round(now - act.get('lastActive', now)),
            'chatCount': act.get('chatCount', 0),
            'pollResponses': act.get('pollResponses', 0),
            'handRaiseCount': act.get('handRaiseCount', 0),
            'tabSwitchCount': act.get('tabSwitchCount', 0),
        })
    return {'students': grid, 'timestamp': datetime.now(timezone.utc).isoformat()}


def _flush_activity(session_id, uid, act):
    """Write accumulated activity data to Firestore."""
    try:
        db.collection('sessions').document(session_id) \
          .collection('activity').document(uid).set({
              'uid': uid,
              'tabSwitchCount': act.get('tabSwitchCount', 0),
              'tabAwayDuration': round(act.get('tabAwayDuration', 0)),
              'idleDuration': round(act.get('idleDuration', 0)),
              'faceDetectedDuration': round(act.get('faceDetectedDuration', 0)),
              'chatCount': act.get('chatCount', 0),
              'pollResponses': act.get('pollResponses', 0),
              'quizResponses': act.get('quizResponses', 0),
              'handRaiseCount': act.get('handRaiseCount', 0),
              'flushedAt': datetime.now(timezone.utc).isoformat(),
          }, merge=True)
    except Exception:
        pass   # best-effort flush
