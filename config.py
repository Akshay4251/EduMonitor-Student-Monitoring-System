"""
Application configuration and Firebase initialization.
Place your Firebase service account key as 'firebase_admin_key.json' in the project root.
"""

import os
import firebase_admin
from firebase_admin import credentials, firestore, auth as firebase_auth_module
from dotenv import load_dotenv

load_dotenv()

# ── Firebase Admin SDK / Local Emulator Fallback ──────────────────
SECRET_KEY = os.getenv('SECRET_KEY', 'edumonitor-super-secure-secret-key-32-chars-long!')

_key_path = os.path.join(os.path.dirname(__file__), 'firebase_admin_key.json')
USE_MOCK = False

if os.path.exists(_key_path):
    try:
        _cred = credentials.Certificate(_key_path)
        firebase_admin.initialize_app(_cred)
        db = firestore.client()
        firebase_auth = firebase_auth_module
        print("[Firebase] Connected to Firebase Admin SDK via service account key.")
    except Exception as e:
        print(f"[Firebase Warning] Error initializing Firebase service account: {e}. Falling back to local emulator.")
        USE_MOCK = True
elif os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
    try:
        firebase_admin.initialize_app()
        db = firestore.client()
        firebase_auth = firebase_auth_module
        print("[Firebase] Connected to Firebase Admin SDK via GOOGLE_APPLICATION_CREDENTIALS.")
    except Exception as e:
        print(f"[Firebase Warning] Error initializing Firebase ADC: {e}. Falling back to local emulator.")
        USE_MOCK = True
else:
    USE_MOCK = True

def _bootstrap_live_firebase(firestore_db, auth_mod):
    """Auto-seed demo credentials and baseline collection on live Firebase projects."""
    try:
        from datetime import datetime, timezone
        demo_accounts = [
            ('teacher@example.com', 'password123', 'Prof. Sarah Jenkins', 'teacher'),
            ('student@example.com', 'password123', 'Alex Rivera', 'student'),
            ('admin@example.com', 'password123', 'System Administrator', 'admin'),
        ]
        uids = {}
        for email, password, name, role in demo_accounts:
            uid = None
            try:
                user = auth_mod.get_user_by_email(email)
                uid = user.uid
            except Exception:
                try:
                    user = auth_mod.create_user(email=email, password=password, display_name=name)
                    uid = user.uid
                except Exception:
                    pass
            if uid:
                uids[role] = uid
                try:
                    auth_mod.set_custom_user_claims(uid, {'role': role})
                except Exception:
                    pass
                try:
                    firestore_db.collection('users').document(uid).set({
                        'uid': uid,
                        'email': email,
                        'displayName': name,
                        'role': role,
                        'active': True,
                        'createdAt': datetime.now(timezone.utc).isoformat(),
                        'enrolledClasses': []
                    }, merge=True)
                except Exception:
                    pass

        # Seed initial class if database is completely empty
        try:
            existing_classes = list(firestore_db.collection('classes').limit(1).stream())
            if not existing_classes and 'teacher' in uids:
                firestore_db.collection('classes').document('class-cs101').set({
                    'id': 'class-cs101',
                    'name': 'CS 101: Computer Science Foundations',
                    'subject': 'Computer Science',
                    'description': 'Introduction to algorithms, data structures, and computational thinking.',
                    'schedule': 'Mon / Wed 10:00 AM',
                    'joinCode': 'CS101X',
                    'teacherId': uids['teacher'],
                    'teacherName': 'Prof. Sarah Jenkins',
                    'createdAt': datetime.now(timezone.utc).isoformat(),
                    'active': True,
                    'students': [uids['student']] if 'student' in uids else []
                }, merge=True)

                # Seed sample assignment
                firestore_db.collection('assignments').document('assign-cs101').set({
                    'id': 'assign-cs101',
                    'classId': 'class-cs101',
                    'className': 'CS 101: Computer Science Foundations',
                    'teacherId': uids['teacher'],
                    'teacherName': 'Prof. Sarah Jenkins',
                    'title': 'Problem Set 1: Graph Traversal & BFS/DFS',
                    'description': 'Implement Depth-First Search and Breadth-First Search in Python with unit tests.',
                    'dueDate': datetime.now(timezone.utc).isoformat(),
                    'points': 100,
                    'resources': 'https://docs.python.org/3/tutorial/datastructures.html',
                    'createdAt': datetime.now(timezone.utc).isoformat(),
                }, merge=True)

                # Seed sample study material
                firestore_db.collection('materials').document('mat-cs101').set({
                    'id': 'mat-cs101',
                    'classId': 'class-cs101',
                    'className': 'CS 101: Computer Science Foundations',
                    'teacherId': uids['teacher'],
                    'teacherName': 'Prof. Sarah Jenkins',
                    'title': 'Graph Traversal Visualizer & DFS Walkthrough',
                    'type': 'youtube',
                    'url': 'https://www.youtube.com/watch?v=pcKY4hjDrxk',
                    'youtubeId': 'pcKY4hjDrxk',
                    'content': 'Comprehensive video walkthrough of graph algorithms and recursion stack behavior.',
                    'createdAt': datetime.now(timezone.utc).isoformat(),
                }, merge=True)

                print("[Firebase] Live Firebase project auto-seeded with starter class and demo credentials.")
        except Exception as e:
            print(f"[Firebase] Class bootstrap info: {e}")
    except Exception as e:
        print(f"[Firebase Warning] Auto-bootstrap info: {e}")

if USE_MOCK:
    from mock_firebase import MockFirestore, MockFirebaseAuth
    db = MockFirestore()
    firebase_auth = MockFirebaseAuth(db)
    print("[Firebase] Running in Local Emulated Mode (pre-seeded with demo teacher, student, and admin).")
else:
    _bootstrap_live_firebase(db, firebase_auth)

ENGAGEMENT_WEIGHTS = {
    'attendance': 0.25,
    'focus':      0.30,
    'participation': 0.30,
    'face_presence': 0.15,
}

IDLE_THRESHOLD_SECONDS   = 60   # 1 minute with no input → idle
ALERT_THRESHOLD_MINUTES  = 3    # Alert teacher after 3 min inactive
ACTIVITY_PING_INTERVAL   = 10   # Client pings every 10 s
BATCH_WRITE_INTERVAL     = 30   # Server flushes to Firestore every 30 s
