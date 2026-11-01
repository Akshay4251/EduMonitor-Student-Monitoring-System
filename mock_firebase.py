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
        self._seed_sample_data()

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
        now = datetime.now(timezone.utc).isoformat()

        # Seed Users
        users = [
            {
                'uid': 'teacher-101',
                'email': 'teacher@example.com',
                'displayName': 'Prof. Sarah Jenkins',
                'role': 'teacher',
                'createdAt': now,
                'active': True,
                'enrolledClasses': ['class-101'],
                'password': 'password123',
            },
            {
                'uid': 'student-201',
                'email': 'student@example.com',
                'displayName': 'Alex Rivera',
                'role': 'student',
                'createdAt': now,
                'active': True,
                'enrolledClasses': ['class-101'],
                'password': 'password123',
            },
            {
                'uid': 'student-202',
                'email': 'student2@example.com',
                'displayName': 'Maya Lin',
                'role': 'student',
                'createdAt': now,
                'active': True,
                'enrolledClasses': ['class-101'],
                'password': 'password123',
            },
            {
                'uid': 'admin-301',
                'email': 'admin@example.com',
                'displayName': 'System Administrator',
                'role': 'admin',
                'createdAt': now,
                'active': True,
                'enrolledClasses': [],
                'password': 'password123',
            },
        ]
        for u in users:
            self._storage[('users', u['uid'])] = u

        # Seed Class
        cls = {
            'id': 'class-101',
            'name': 'CS101: Introduction to Algorithms',
            'description': 'Core computer science fundamentals, graph algorithms, and data structures.',
            'subject': 'Computer Science',
            'teacherId': 'teacher-101',
            'teacherName': 'Prof. Sarah Jenkins',
            'schedule': 'Mon / Wed 10:00 AM',
            'students': ['student-201', 'student-202'],
            'joinCode': 'ALG101',
            'createdAt': now,
            'active': True,
        }
        self._storage[('classes', 'class-101')] = cls

        # Seed Past Sessions for Analytics & Reports
        past_sessions = [
            {
                'id': 'session-002',
                'classId': 'class-101',
                'className': 'CS101: Introduction to Algorithms',
                'teacherId': 'teacher-101',
                'teacherName': 'Prof. Sarah Jenkins',
                'title': 'Lecture 1: Asymptotic Complexity & Big-O Notation',
                'description': 'Time and space complexity analysis, recurrence relations.',
                'scheduledAt': '2026-10-25T10:00:00Z',
                'startedAt': '2026-10-25T10:02:00Z',
                'endedAt': '2026-10-25T11:00:00Z',
                'status': 'ended',
                'joinCode': 'ASMY01',
                'participants': ['student-201', 'student-202'],
                'createdAt': '2026-10-25T09:30:00Z',
            },
            {
                'id': 'session-003',
                'classId': 'class-101',
                'className': 'CS101: Introduction to Algorithms',
                'teacherId': 'teacher-101',
                'teacherName': 'Prof. Sarah Jenkins',
                'title': 'Lecture 2: Dynamic Arrays, Stacks & Queues',
                'description': 'Amortized bounds, circular buffers, stack/queue applications.',
                'scheduledAt': '2026-10-27T10:00:00Z',
                'startedAt': '2026-10-27T10:01:00Z',
                'endedAt': '2026-10-27T11:02:00Z',
                'status': 'ended',
                'joinCode': 'STCK02',
                'participants': ['student-201', 'student-202'],
                'createdAt': '2026-10-27T09:30:00Z',
            },
            {
                'id': 'session-004',
                'classId': 'class-101',
                'className': 'CS101: Introduction to Algorithms',
                'teacherId': 'teacher-101',
                'teacherName': 'Prof. Sarah Jenkins',
                'title': 'Lecture 3: Binary Trees, Heaps & Priority Queues',
                'description': 'Tree traversals, heapify operations, priority queue implementations.',
                'scheduledAt': '2026-10-29T10:00:00Z',
                'startedAt': '2026-10-29T10:00:00Z',
                'endedAt': '2026-10-29T11:05:00Z',
                'status': 'ended',
                'joinCode': 'TREE03',
                'participants': ['student-201', 'student-202'],
                'createdAt': '2026-10-29T09:30:00Z',
            },
        ]

        for s in past_sessions:
            sid = s['id']
            self._storage[('sessions', sid)] = s

            # Seed Attendance
            self._storage[('sessions', sid, 'attendance', 'student-201')] = {
                'uid': 'student-201', 'name': 'Alex Rivera',
                'joinTime': s['startedAt'], 'leaveTime': s['endedAt'],
                'duration': 3600, 'status': 'present'
            }
            self._storage[('sessions', sid, 'attendance', 'student-202')] = {
                'uid': 'student-202', 'name': 'Maya Lin',
                'joinTime': s['startedAt'], 'leaveTime': s['endedAt'],
                'duration': 3420, 'status': 'present'
            }

            # Seed Activity
            self._storage[('sessions', sid, 'activity', 'student-201')] = {
                'uid': 'student-201', 'tabSwitchCount': 1, 'tabAwayDuration': 45,
                'idleDuration': 60, 'faceDetectedDuration': 3240, 'chatCount': 5,
                'pollResponses': 3, 'quizResponses': 2, 'handRaiseCount': 1
            }
            self._storage[('sessions', sid, 'activity', 'student-202')] = {
                'uid': 'student-202', 'tabSwitchCount': 3, 'tabAwayDuration': 180,
                'idleDuration': 120, 'faceDetectedDuration': 2880, 'chatCount': 3,
                'pollResponses': 2, 'quizResponses': 2, 'handRaiseCount': 0
            }

        # Seed Engagement Scores for Past Sessions
        self._storage[('sessions', 'session-002', 'engagement', 'student-201')] = {
            'uid': 'student-201', 'name': 'Alex Rivera', 'score': 92.5,
            'attendance': 100.0, 'focus': 97.0, 'participation': 85.0, 'facePresence': 90.0
        }
        self._storage[('sessions', 'session-002', 'engagement', 'student-202')] = {
            'uid': 'student-202', 'name': 'Maya Lin', 'score': 84.2,
            'attendance': 95.0, 'focus': 90.0, 'participation': 70.0, 'facePresence': 80.0
        }

        self._storage[('sessions', 'session-003', 'engagement', 'student-201')] = {
            'uid': 'student-201', 'name': 'Alex Rivera', 'score': 95.8,
            'attendance': 100.0, 'focus': 98.0, 'participation': 92.0, 'facePresence': 92.0
        }
        self._storage[('sessions', 'session-003', 'engagement', 'student-202')] = {
            'uid': 'student-202', 'name': 'Maya Lin', 'score': 88.5,
            'attendance': 100.0, 'focus': 92.0, 'participation': 80.0, 'facePresence': 85.0
        }

        self._storage[('sessions', 'session-004', 'engagement', 'student-201')] = {
            'uid': 'student-201', 'name': 'Alex Rivera', 'score': 94.2,
            'attendance': 100.0, 'focus': 95.0, 'participation': 90.0, 'facePresence': 91.0
        }
        self._storage[('sessions', 'session-004', 'engagement', 'student-202')] = {
            'uid': 'student-202', 'name': 'Maya Lin', 'score': 81.0,
            'attendance': 95.0, 'focus': 82.0, 'participation': 68.0, 'facePresence': 78.0
        }

        # Seed Live Session
        sess = {
            'id': 'session-001',
            'classId': 'class-101',
            'className': 'CS101: Introduction to Algorithms',
            'teacherId': 'teacher-101',
            'teacherName': 'Prof. Sarah Jenkins',
            'title': 'Live Demo: Graph Search Algorithms',
            'description': 'Exploring BFS, DFS, and real-time visualization with engagement tracking.',
            'scheduledAt': now,
            'startedAt': now,
            'endedAt': None,
            'status': 'live',
            'joinCode': 'GRAPHS',
            'participants': [],
            'createdAt': now,
        }
        self._storage[('sessions', 'session-001')] = sess

        # Also seed attendance & engagement for session-001 so it has immediate report data
        self._storage[('sessions', 'session-001', 'engagement', 'student-201')] = {
            'uid': 'student-201', 'name': 'Alex Rivera', 'score': 93.0,
            'attendance': 100.0, 'focus': 95.0, 'participation': 88.0, 'facePresence': 90.0
        }
        self._storage[('sessions', 'session-001', 'engagement', 'student-202')] = {
            'uid': 'student-202', 'name': 'Maya Lin', 'score': 86.5,
            'attendance': 100.0, 'focus': 89.0, 'participation': 75.0, 'facePresence': 82.0
        }

        # Seed Sample Assignments
        self._storage[('assignments', 'assign-001')] = {
            'id': 'assign-001',
            'classId': 'class-101',
            'className': 'CS101: Introduction to Algorithms',
            'teacherId': 'teacher-101',
            'teacherName': 'Prof. Sarah Jenkins',
            'title': 'Problem Set 1: Graph Traversal & BFS/DFS',
            'description': 'Implement Depth-First Search and Breadth-First Search in Python. Include unit tests and time complexity analysis.',
            'dueDate': '2026-11-15T23:59:00Z',
            'points': 100,
            'resources': 'https://docs.python.org/3/tutorial/datastructures.html',
            'createdAt': now,
        }
        self._storage[('assignments', 'assign-001', 'submissions', 'student-201')] = {
            'studentId': 'student-201',
            'studentName': 'Alex Rivera',
            'studentEmail': 'student@example.com',
            'assignmentId': 'assign-001',
            'content': 'Implemented both BFS and DFS with recursive and queue-based iterations. Added test cases covering cyclic graphs.',
            'attachmentUrl': 'https://github.com/example/cs101-ps1',
            'submittedAt': now,
            'status': 'graded',
            'grade': 96.0,
            'remarks': 'Excellent recursive DFS implementation! Clean code comments and thorough complexity analysis.',
            'reviewedAt': now,
            'reviewedBy': 'teacher-101',
        }

        # Seed Sample Study Materials
        self._storage[('materials', 'mat-001')] = {
            'id': 'mat-001',
            'classId': 'class-101',
            'className': 'CS101: Introduction to Algorithms',
            'teacherId': 'teacher-101',
            'teacherName': 'Prof. Sarah Jenkins',
            'title': 'Graph Traversal Visualizer & DFS Walkthrough',
            'type': 'youtube',
            'url': 'https://www.youtube.com/watch?v=pcKY4hjDrxk',
            'youtubeId': 'pcKY4hjDrxk',
            'content': 'Comprehensive video walkthrough of graph algorithms, adjacency list representations, and recursion stack behavior.',
            'createdAt': now,
        }
        self._storage[('materials', 'mat-002')] = {
            'id': 'mat-002',
            'classId': 'class-101',
            'className': 'CS101: Introduction to Algorithms',
            'teacherId': 'teacher-101',
            'teacherName': 'Prof. Sarah Jenkins',
            'title': 'Lecture 3 Notes: Time Complexity & Big-O Master Theorem',
            'type': 'notes',
            'url': '',
            'youtubeId': '',
            'content': 'Key Topics:\n- O(1): Constant lookup\n- O(log N): Binary Search\n- O(N): Linear scan\n- O(N log N): Merge Sort\n- O(V + E): BFS/DFS Graph Traversal\n\nRemember to account for worst-case recursion depth when calculating space complexity!',
            'createdAt': now,
        }


class MockFirebaseAuth:
    def __init__(self, db: MockFirestore):
        self._db = db

    def create_user(self, email, password=None, display_name=None, **kwargs):
        # Check if email exists
        for key, doc in self._db._storage.items():
            if len(key) == 2 and key[0] == 'users' and doc.get('email') == email:
                # User already exists
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
        }
        self._db._storage[('users', uid)] = user_data
        return MockUserRecord(uid, email, display_name)

    def set_custom_user_claims(self, uid, claims):
        key = ('users', uid)
        if key in self._db._storage:
            self._db._storage[key].update(claims)

    def update_user(self, uid, display_name=None, disabled=None, **kwargs):
        key = ('users', uid)
        if key in self._db._storage:
            if display_name is not None:
                self._db._storage[key]['displayName'] = display_name
            if disabled is not None:
                self._db._storage[key]['active'] = not disabled

    def verify_id_token(self, token):
        if not token:
            raise ValueError("Empty token")

        # Mock token format: "mock-token-<uid>" or JWT
        if token.startswith("mock-token-"):
            uid = token[len("mock-token-"):]
            user_doc = self._db._get_doc_data(['users', uid]) or {}
            return {
                'uid': uid,
                'email': user_doc.get('email', f'{uid}@example.com'),
                'name': user_doc.get('displayName', uid),
                'role': user_doc.get('role', 'student'),
            }

        # Attempt to decode as JWT signed with SECRET_KEY
        try:
            decoded = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            return decoded
        except Exception:
            # Fallback mock decode
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
