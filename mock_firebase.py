"""
mock_firebase.py — Local in-memory / JSON-backed Firestore and Firebase Auth emulator.
Allows full development, demonstration, and testing without requiring cloud credentials.
Automatically switches to official Firebase Admin SDK when 'firebase_admin_key.json' is provided.
"""

import os
import json
import time
import copy
import jwt
from datetime import datetime, timezone
from google.cloud.firestore_v1.transforms import ArrayUnion

SECRET_KEY = os.getenv('SECRET_KEY', 'edumonitor-super-secure-secret-key-32-chars-long!')

class MockUserRecord:
    def __init__(self, uid, email, display_name=None):
        self.uid = uid
        self.email = email
        self.display_name = display_name


class MockDocumentReference:
    def __init__(self, db, path_parts):
        self._db = db
        self._path = path_parts  # list of strings: ['classes', 'c1', 'attendance', 'u1']
        self.id = path_parts[-1]

    @property
    def parent(self):
        # returns parent CollectionReference or DocumentReference
        if len(self._path) > 1:
            return MockCollectionReference(self._db, self._path[:-1])
        return None

    def get(self):
        data = self._db._get_doc_data(self._path)
        if data is None:
            return MockDocumentSnapshot(False, self.id, {}, self)
        return MockDocumentSnapshot(True, self.id, copy.deepcopy(data), self)

    def set(self, data, merge=False):
        self._db._set_doc_data(self._path, data, merge=merge)

    def update(self, updates):
        self._db._update_doc_data(self._path, updates)

    def delete(self):
        self._db._delete_doc_data(self._path)

    def collection(self, name):
        return MockCollectionReference(self._db, self._path + [name])


class MockCollectionReference:
    def __init__(self, db, path_parts):
        self._db = db
        self._path = path_parts
        self.id = path_parts[-1]

    @property
    def parent(self):
        if len(self._path) > 1:
            return MockDocumentReference(self._db, self._path[:-1])
        return None

    def document(self, doc_id):
        return MockDocumentReference(self._db, self._path + [doc_id])

    def add(self, data):
        import uuid
        doc_id = str(uuid.uuid4())[:10]
        ref = self.document(doc_id)
        ref.set(data)
        return None, ref

    def where(self, field, op, value):
        query = MockQuery(self._db, self._path)
        return query.where(field, op, value)

    def stream(self):
        return MockQuery(self._db, self._path).stream()


class MockDocumentSnapshot:
    def __init__(self, exists, doc_id, data, reference=None):
        self.exists = exists
        self.id = doc_id
        self._data = data
        self.reference = reference

    def to_dict(self):
        return copy.deepcopy(self._data) if self.exists else None


class MockQuery:
    def __init__(self, db, path_parts, is_group=False, group_name=None):
        self._db = db
        self._path = path_parts
        self._is_group = is_group
        self._group_name = group_name
        self._filters = []  # list of (field, op, value)

    def where(self, field, op, value):
        self._filters.append((field, op, value))
        return self

    def stream(self):
        if self._is_group:
            all_snapshots = self._db._get_collection_group_docs(self._group_name)
        else:
            all_snapshots = self._db._get_collection_docs(self._path)

        results = []
        for snap in all_snapshots:
            data = snap.to_dict()
            match = True
            for field, op, value in self._filters:
                doc_val = data.get(field)
                if op == '==':
                    if doc_val != value:
                        match = False
                        break
                elif op == '!=':
                    if doc_val == value:
                        match = False
                        break
                elif op == 'array_contains':
                    if not isinstance(doc_val, list) or value not in doc_val:
                        match = False
                        break
                elif op == 'in':
                    if doc_val not in value:
                        match = False
                        break
            if match:
                results.append(snap)
        return iter(results)


class MockFirestore:
    def __init__(self):
        self._storage = {}  # tuple(path_parts) -> dict
        if not self._load_from_disk():
            self._seed_sample_data()
            self._save_to_disk()

    def collection(self, name):
        return MockCollectionReference(self, [name])

    def collection_group(self, name):
        return MockQuery(self, [], is_group=True, group_name=name)

    def _get_doc_data(self, path_parts):
        return self._storage.get(tuple(path_parts))

    def _set_doc_data(self, path_parts, data, merge=False):
        key = tuple(path_parts)
        if merge and key in self._storage:
            self._storage[key].update(copy.deepcopy(data))
        else:
            self._storage[key] = copy.deepcopy(data)
        self._save_to_disk()

    def _delete_doc_data(self, path_parts):
        key = tuple(path_parts)
        self._storage.pop(key, None)
        subkeys = [k for k in self._storage if len(k) > len(key) and k[:len(key)] == key]
        for sk in subkeys:
            self._storage.pop(sk, None)
        self._save_to_disk()

    def _update_doc_data(self, path_parts, updates):
        key = tuple(path_parts)
        if key not in self._storage:
            self._storage[key] = {}
        target = self._storage[key]

        for k, v in updates.items():
            if isinstance(v, ArrayUnion):
                current_list = target.get(k, [])
                if not isinstance(current_list, list):
                    current_list = []
                for item in v.values:
                    if item not in current_list:
                        current_list.append(item)
                target[k] = current_list
            elif '.' in k:
                # nested dot notation e.g. 'responses.uid1': 2
                parts = k.split('.')
                curr = target
                for p in parts[:-1]:
                    if p not in curr or not isinstance(curr[p], dict):
                        curr[p] = {}
                    curr = curr[p]
                curr[parts[-1]] = v
            else:
                target[k] = copy.deepcopy(v)
        self._save_to_disk()

    def _save_to_disk(self):
        try:
            data_dir = os.path.join(os.path.dirname(__file__), 'data')
            os.makedirs(data_dir, exist_ok=True)
            db_path = os.path.join(data_dir, 'edumonitor_db.json')
            serializable = {":::".join(k): v for k, v in self._storage.items()}
            with open(db_path, 'w', encoding='utf-8') as f:
                json.dump(serializable, f, indent=2)
        except Exception:
            pass

    def _load_from_disk(self):
        try:
            db_path = os.path.join(os.path.dirname(__file__), 'data', 'edumonitor_db.json')
            if os.path.exists(db_path):
                with open(db_path, 'r', encoding='utf-8') as f:
                    raw = json.load(f)
                loaded = {tuple(k.split(":::")): v for k, v in raw.items()}
                # If loaded data still contains obsolete dummy Sarah or lacks multi-class data, reseed freshly
                sample_str = str(list(loaded.values())[:10])
                if 'Sarah' in sample_str or len([k for k in loaded if len(k) == 2 and k[0] == 'classes']) < 3:
                    return False
                self._storage = loaded
                return True
        except Exception:
            pass
        return False

    def _get_collection_docs(self, path_parts):
        prefix_len = len(path_parts)
        snaps = []
        for key, data in self._storage.items():
            # A doc in this collection has path length prefix_len + 1
            if len(key) == prefix_len + 1 and key[:prefix_len] == tuple(path_parts):
                doc_id = key[-1]
                ref = MockDocumentReference(self, list(key))
                snaps.append(MockDocumentSnapshot(True, doc_id, copy.deepcopy(data), ref))
        return snaps

    def _get_collection_group_docs(self, group_name):
        snaps = []
        for key, data in self._storage.items():
            # A collection group doc has key[-2] == group_name
            if len(key) >= 2 and key[-2] == group_name:
                doc_id = key[-1]
                ref = MockDocumentReference(self, list(key))
                snaps.append(MockDocumentSnapshot(True, doc_id, copy.deepcopy(data), ref))
        return snaps

    def _seed_sample_data(self):
        from seed_data import get_seed_data
        data = get_seed_data()
        now = datetime.now(timezone.utc).isoformat()

        # 1. Seed Accredited Faculty and Students
        for u in data['users']:
            self._storage[('users', u['uid'])] = copy.deepcopy(u)

        # 2. Seed Legacy Aliases so automated test suites and 1-click personas work without breakages
        for alias_email, target_uid, target_name, target_role in data['legacy_aliases']:
            alias_doc = copy.deepcopy(self._storage[('users', target_uid)])
            alias_doc['email'] = alias_email
            alias_doc['displayName'] = target_name
            alias_doc['role'] = target_role
            alias_doc['uid'] = target_uid
            self._storage[('users', alias_email)] = alias_doc

        # 3. Seed 5 Real University Courses / Classes
        for c in data['classes']:
            self._storage[('classes', c['id'])] = copy.deepcopy(c)

        # 4. Seed 5 Real Sessions (Live, Past, and Scheduled)
        for s in data['sessions']:
            sid = s['id']
            self._storage[('sessions', sid)] = copy.deepcopy(s)

        # 5. Seed Attendance, Activity, and Engagement Analytics
        student_analytics = [
            ('student-201', 'Liam Chen', 98.2, 100.0, 99.0, 96.0, 95.0),
            ('student-202', 'Sophia Rodriguez', 94.6, 100.0, 95.0, 92.0, 91.0),
            ('student-203', 'Ethan Wright', 91.8, 100.0, 92.0, 88.0, 89.0),
            ('student-204', 'Aisha Patel', 93.4, 100.0, 94.0, 90.0, 92.0),
            ('student-205', 'Noah Kim', 89.5, 95.0, 90.0, 82.0, 86.0),
        ]

        for s in data['sessions']:
            sid = s['id']
            if s['status'] in ('ended', 'live'):
                for uid, name, eng_score, att_rate, focus_rate, part_rate, face_rate in student_analytics:
                    self._storage[('sessions', sid, 'attendance', uid)] = {
                        'uid': uid,
                        'name': name,
                        'joinTime': s.get('startedAt', now),
                        'leaveTime': s.get('endedAt', now),
                        'duration': 3600 if s['status'] == 'ended' else 1800,
                        'status': 'present'
                    }
                    self._storage[('sessions', sid, 'activity', uid)] = {
                        'uid': uid,
                        'tabSwitchCount': 1,
                        'tabAwayDuration': 35,
                        'idleDuration': 45,
                        'faceDetectedDuration': 3450,
                        'chatCount': 7,
                        'pollResponses': 3,
                        'quizResponses': 2,
                        'handRaiseCount': 1
                    }
                    self._storage[('sessions', sid, 'engagement', uid)] = {
                        'uid': uid,
                        'name': name,
                        'score': eng_score,
                        'attendance': att_rate,
                        'focus': focus_rate,
                        'participation': part_rate,
                        'facePresence': face_rate
                    }

        # 6. Seed Interactive Concept Quiz and Real-Time Poll
        self._storage[('sessions', 'session-001', 'quizzes', 'quiz-001')] = {
            'id': 'quiz-001',
            'sessionId': 'session-001',
            'title': 'Mid-Lecture Concept Check: Graph Algorithms & Dynamic Programming',
            'questions': [
                {
                    'question': 'What is the tightest upper bound for Dijkstra algorithm with a binary min-heap?',
                    'options': ['O(V + E)', 'O((V + E) log V)', 'O(V^2)', 'O(E^2)'],
                    'answer': 1
                },
                {
                    'question': 'Which algorithm detects negative-weight cycles in directed graphs?',
                    'options': ['Dijkstra Algorithm', 'Bellman-Ford Algorithm', 'Breadth-First Search', 'Kruskal Algorithm'],
                    'answer': 1
                }
            ],
            'createdAt': now,
        }

        self._storage[('sessions', 'session-001', 'polls', 'poll-001')] = {
            'id': 'poll-001',
            'sessionId': 'session-001',
            'question': 'Are you confident with the edge relaxation invariant dist[v] > dist[u] + w(u, v)?',
            'options': ['Fully understood', 'Need one more code trace example', 'Review negative weight constraints'],
            'responses': {'student-201': 0, 'student-202': 0, 'student-203': 1},
            'createdAt': now,
        }

        # 7. Seed 5 Real University Assignments & Graded Submissions
        for a in data['assignments']:
            aid = a['id']
            subs = a.pop('submissions', {})
            self._storage[('assignments', aid)] = copy.deepcopy(a)
            for suid, sub_data in subs.items():
                self._storage[('assignments', aid, 'submissions', suid)] = copy.deepcopy(sub_data)

        # 8. Seed 5 Real Study Materials (YouTube Lectures, Notes, Guides)
        for m in data['materials']:
            self._storage[('materials', m['id'])] = copy.deepcopy(m)


class MockFirebaseAuth:
    def __init__(self, db: MockFirestore):
        self._db = db

    def create_user(self, email, password=None, display_name=None, **kwargs):
        # Check if email exists
        for key, doc in self._db._storage.items():
            if len(key) == 2 and key[0] == 'users' and doc.get('email') == email:
                return MockUserRecord(doc['uid'], email, doc.get('displayName'))

        import uuid
        uid = f"user-{str(uuid.uuid4())[:8]}"
        user_data = {
            'uid': uid,
            'email': email,
            'displayName': display_name or email.split('@')[0],
            'role': 'student',
            'active': True,
            'createdAt': datetime.now(timezone.utc).isoformat(),
            'password': password or 'password123',
            'enrolledClasses': ['class-101'],
        }
        self._db._storage[('users', uid)] = user_data
        self._db._save_to_disk()
        return MockUserRecord(uid, email, display_name)

    def get_user_by_email(self, email):
        for key, doc in self._db._storage.items():
            if len(key) == 2 and key[0] == 'users' and doc.get('email') == email:
                return MockUserRecord(doc['uid'], email, doc.get('displayName'))
        raise ValueError(f"No user found for email {email}")

    def set_custom_user_claims(self, uid, claims):
        key = ('users', uid)
        if key in self._db._storage:
            self._db._storage[key].update(claims)
            self._db._save_to_disk()

    def update_user(self, uid, display_name=None, disabled=None, **kwargs):
        key = ('users', uid)
        if key in self._db._storage:
            if display_name is not None:
                self._db._storage[key]['displayName'] = display_name
            if disabled is not None:
                self._db._storage[key]['active'] = not disabled
            self._db._save_to_disk()

    def verify_id_token(self, token):
        if not token:
            raise ValueError("Empty token")

        if token.startswith("mock-token-"):
            uid = token[len("mock-token-"):]
            user_doc = self._db._get_doc_data(['users', uid]) or {}
            return {
                'uid': uid,
                'email': user_doc.get('email', f'{uid}@example.com'),
                'name': user_doc.get('displayName', uid),
                'role': user_doc.get('role', 'student'),
            }

        try:
            decoded = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            return decoded
        except Exception:
            pass

        raise ValueError("Invalid ID token")

    def create_mock_token(self, uid, email, name, role):
        payload = {
            'uid': uid,
            'email': email,
            'name': name,
            'role': role,
            'iat': int(time.time()),
            'exp': int(time.time()) + 86400 * 7,
        }
        return jwt.encode(payload, SECRET_KEY, algorithm='HS256')
