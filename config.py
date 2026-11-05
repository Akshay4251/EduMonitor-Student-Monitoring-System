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
_custom_cred_path = os.getenv('FIREBASE_ADMIN_CREDENTIALS') or os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
_service_account_json = os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON')

USE_MOCK = os.getenv('USE_MOCK', '').lower() in ('true', '1')

if not USE_MOCK:
    if os.path.exists(_key_path):
        try:
            _cred = credentials.Certificate(_key_path)
            firebase_admin.initialize_app(_cred)
            db = firestore.client()
            firebase_auth = firebase_auth_module
            print("[Firebase] Connected to Firebase Admin SDK via service account key file.")
        except Exception as e:
            print(f"[Firebase Warning] Error initializing Firebase key: {e}. Falling back to local mode.")
            USE_MOCK = True
    elif _custom_cred_path and os.path.exists(_custom_cred_path):
        try:
            _cred = credentials.Certificate(_custom_cred_path)
            firebase_admin.initialize_app(_cred)
            db = firestore.client()
            firebase_auth = firebase_auth_module
            print(f"[Firebase] Connected to Firebase Admin SDK via {_custom_cred_path}.")
        except Exception as e:
            print(f"[Firebase Warning] Error initializing Firebase custom path: {e}. Falling back to local mode.")
            USE_MOCK = True
    elif os.getenv('FIREBASE_PRIVATE_KEY') and os.getenv('FIREBASE_CLIENT_EMAIL'):
        try:
            pk = os.getenv('FIREBASE_PRIVATE_KEY', '').replace('\\n', '\n')
            cred_dict = {
                "type": "service_account",
                "project_id": os.getenv("FIREBASE_PROJECT_ID"),
                "private_key": pk,
                "client_email": os.getenv("FIREBASE_CLIENT_EMAIL"),
                "token_uri": "https://oauth2.googleapis.com/token",
            }
            _cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(_cred)
            db = firestore.client()
            firebase_auth = firebase_auth_module
            print(f"[Firebase] Connected to Firebase Admin SDK via .env service account credentials for project: {os.getenv('FIREBASE_PROJECT_ID')}.")
        except Exception as e:
            print(f"[Firebase Warning] Error initializing .env credentials: {e}. Falling back to local mode.")
            USE_MOCK = True
    elif _service_account_json:
        try:
            import json
            cred_dict = json.loads(_service_account_json)
            _cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(_cred)
            db = firestore.client()
            firebase_auth = firebase_auth_module
            print("[Firebase] Connected to Firebase Admin SDK via FIREBASE_SERVICE_ACCOUNT_JSON.")
        except Exception as e:
            print(f"[Firebase Warning] Error initializing service account JSON: {e}. Falling back to local mode.")
            USE_MOCK = True
    elif os.getenv('FIREBASE_PROJECT_ID'):
        try:
            firebase_admin.initialize_app()
            db = firestore.client()
            firebase_auth = firebase_auth_module
            print("[Firebase] Connected to Firebase Admin SDK via ADC.")
        except Exception as e:
            print(f"[Firebase Warning] Default ADC fallback: {e}.")
            USE_MOCK = True
    else:
        USE_MOCK = True

def _bootstrap_live_firebase(firestore_db, auth_mod):
    """Auto-seed real academic baseline dataset on live Firebase projects."""
    try:
        # Check if already seeded to prevent slow startup
        try:
            sample_class = firestore_db.collection('classes').document('class-101').get()
            if sample_class.exists:
                print("[Firebase] Live Firebase project is already populated with academic data.")
                return
        except Exception:
            pass
        import copy
        from datetime import datetime, timezone
        from seed_data import get_seed_data
        seed = get_seed_data()
        now = datetime.now(timezone.utc).isoformat()

        # Seed Faculty and Students in Firebase Auth + Firestore
        for u in seed['users']:
            email = u['email']
            name = u['displayName']
            role = u['role']
            uid = u['uid']
            try:
                existing = auth_mod.get_user_by_email(email)
                uid = existing.uid
            except Exception:
                try:
                    user_rec = auth_mod.create_user(uid=uid, email=email, password='password123', display_name=name)
                    uid = user_rec.uid
                except Exception:
                    pass

            try:
                auth_mod.set_custom_user_claims(uid, {'role': role})
            except Exception:
                pass

            try:
                u_doc = copy.deepcopy(u)
                u_doc['uid'] = uid
                firestore_db.collection('users').document(uid).set(u_doc, merge=True)
            except Exception:
                pass

        # Seed Legacy Aliases so automated tests and demo quick-sign-in work seamlessly
        for alias_email, target_uid, target_name, target_role in seed['legacy_aliases']:
            try:
                try:
                    existing = auth_mod.get_user_by_email(alias_email)
                    a_uid = existing.uid
                except Exception:
                    a_uid = f"alias-{target_uid}"
                    try:
                        user_rec = auth_mod.create_user(uid=a_uid, email=alias_email, password='password123', display_name=target_name)
                        a_uid = user_rec.uid
                    except Exception:
                        pass
                auth_mod.set_custom_user_claims(a_uid, {'role': target_role})
                firestore_db.collection('users').document(a_uid).set({
                    'uid': a_uid, 'email': alias_email, 'displayName': target_name,
                    'role': target_role, 'active': True, 'createdAt': now,
                    'enrolledClasses': ['class-101']
                }, merge=True)
            except Exception:
                pass

        # Seed Classes
        try:
            for c in seed['classes']:
                firestore_db.collection('classes').document(c['id']).set(c, merge=True)
        except Exception as e:
            print(f"[Firebase] Classes bootstrap info: {e}")

        # Seed Sessions
        try:
            for s in seed['sessions']:
                firestore_db.collection('sessions').document(s['id']).set(s, merge=True)
        except Exception as e:
            print(f"[Firebase] Sessions bootstrap info: {e}")

        # Seed Assignments & Submissions
        try:
            for a in seed['assignments']:
                aid = a['id']
                subs = a.pop('submissions', {})
                firestore_db.collection('assignments').document(aid).set(a, merge=True)
                for suid, sub_data in subs.items():
                    firestore_db.collection('assignments').document(aid).collection('submissions').document(suid).set(sub_data, merge=True)
        except Exception as e:
            print(f"[Firebase] Assignments bootstrap info: {e}")

        # Seed Materials
        try:
            for m in seed['materials']:
                firestore_db.collection('materials').document(m['id']).set(m, merge=True)
        except Exception as e:
            print(f"[Firebase] Materials bootstrap info: {e}")

        print("[Firebase] Live Firebase project auto-seeded with 5 university courses and faculty roster.")
    except Exception as e:
        print(f"[Firebase Warning] Live bootstrap info: {e}")

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
