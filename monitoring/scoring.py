"""
Engagement score calculation.

Score = w₁·Attendance% + w₂·Focus% + w₃·Participation% + w₄·FacePresence%

All percentages are clamped to [0, 1].  The final score is 0–100.
"""

from config import ENGAGEMENT_WEIGHTS


def calculate_engagement(session_duration_sec: float, activity: dict, max_participation: int = 20) -> dict:
    """
    Parameters
    ----------
    session_duration_sec : total session length in seconds
    activity : dict with keys from Firestore activity sub-collection
    max_participation : normalisation cap for participation events

    Returns
    -------
    dict with breakdown and final score (0–100)
    """
    if session_duration_sec <= 0:
        return {'score': 0, 'attendance': 0, 'focus': 0, 'participation': 0, 'facePresence': 0}

    w = ENGAGEMENT_WEIGHTS
    dur = session_duration_sec

    # ── Attendance ────────────────────────────────────────────────
    present_time = activity.get('duration', dur)
    attendance = _clamp(present_time / dur)

    # ── Focus ─────────────────────────────────────────────────────
    tab_away   = activity.get('tabAwayDuration', 0)
    idle_time  = activity.get('idleDuration', 0)
    distracted = tab_away + idle_time * 0.5        # idle counts half
    focus = _clamp(1 - distracted / dur)

    # ── Participation ─────────────────────────────────────────────
    chats       = activity.get('chatCount', 0)
    polls       = activity.get('pollResponses', 0)
    quizzes     = activity.get('quizResponses', 0)
    hand_raises = activity.get('handRaiseCount', 0)

    total_events = chats + polls * 2 + quizzes * 3 + hand_raises  # weighted raw
    participation = _clamp(total_events / max_participation)

    # ── Face Presence (opt-in) ────────────────────────────────────
    face_time = activity.get('faceDetectedDuration', 0)
    face_presence = _clamp(face_time / dur) if face_time > 0 else 0.0

    # ── Final score ───────────────────────────────────────────────
    score = (
        w['attendance']     * attendance +
        w['focus']          * focus +
        w['participation']  * participation +
        w['face_presence']  * face_presence
    ) * 100

    return {
        'score':         round(score, 1),
        'attendance':    round(attendance * 100, 1),
        'focus':         round(focus * 100, 1),
        'participation': round(participation * 100, 1),
        'facePresence':  round(face_presence * 100, 1),
    }


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))
