"""
Comprehensive test suite for EduMonitor (Student Monitoring System).
Tests Auth, Classes, Sessions, Monitoring, Scoring, Reports, Admin, and Socket.IO.
"""

import os
os.environ.setdefault('USE_MOCK', 'true')
import unittest
import json
import io
from app import app, socketio
from config import db, firebase_auth
from monitoring.scoring import calculate_engagement

class EduMonitorTestCase(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True

        # Log in as teacher to get teacher token
        resp = self.app.post('/api/auth/login', json={
            'email': 'teacher@example.com',
            'password': 'password123'
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.teacher_token = data['token']
        self.teacher_headers = {'Authorization': f"Bearer {self.teacher_token}"}

        # Log in as student to get student token
        resp = self.app.post('/api/auth/login', json={
            'email': 'student@example.com',
            'password': 'password123'
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.student_token = data['token']
        self.student_headers = {'Authorization': f"Bearer {self.student_token}"}

        # Log in as admin to get admin token
        resp = self.app.post('/api/auth/login', json={
            'email': 'admin@example.com',
            'password': 'password123'
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.admin_token = data['token']
        self.admin_headers = {'Authorization': f"Bearer {self.admin_token}"}

    def test_01_scoring_algorithm(self):
        # Full attendance, perfect focus, high participation, opt-in face
        activity = {
            'duration': 3600,
            'tabAwayDuration': 0,
            'idleDuration': 0,
            'chatCount': 10,
            'pollResponses': 3,
            'quizResponses': 2,
            'handRaiseCount': 2,
            'faceDetectedDuration': 3600,
        }
        res = calculate_engagement(3600, activity)
        self.assertGreaterEqual(res['score'], 90)
        self.assertEqual(res['attendance'], 100.0)
        self.assertEqual(res['focus'], 100.0)
        self.assertEqual(res['facePresence'], 100.0)

    def test_02_auth_register_and_profile(self):
        import uuid
        test_email = f"newuser_{str(uuid.uuid4())[:6]}@example.com"
        resp = self.app.post('/api/auth/register', json={
            'email': test_email,
            'password': 'password123',
            'displayName': 'Test User',
            'role': 'student'
        })
        self.assertEqual(resp.status_code, 201)
        data = resp.get_json()
        self.assertIn('token', data)

        token = data['token']
        profile_resp = self.app.get('/api/auth/profile', headers={'Authorization': f"Bearer {token}"})
        self.assertEqual(profile_resp.status_code, 200)
        pdata = profile_resp.get_json()
        self.assertEqual(pdata['email'], test_email)

    def test_03_class_lifecycle(self):
        # Teacher creates class
        create_resp = self.app.post('/api/classes', json={
            'name': 'Physics 101',
            'subject': 'Physics',
            'description': 'Mechanics & Optics',
            'schedule': 'Tue/Thu 2:00 PM'
        }, headers=self.teacher_headers)
        self.assertEqual(create_resp.status_code, 201)
        cdata = create_resp.get_json()
        class_id = cdata['id']
        join_code = cdata['joinCode']

        # Student joins class using code
        join_resp = self.app.post('/api/classes/join', json={
            'joinCode': join_code
        }, headers=self.student_headers)
        self.assertEqual(join_resp.status_code, 200)

        # Teacher verifies student list
        students_resp = self.app.get(f'/api/classes/{class_id}/students', headers=self.teacher_headers)
        self.assertEqual(students_resp.status_code, 200)
        slist = students_resp.get_json()
        self.assertTrue(any(s['email'] == 'student@example.com' for s in slist))

    def test_04_session_lifecycle_and_quizzes(self):
        # Teacher creates session
        sess_resp = self.app.post('/api/sessions', json={
            'classId': 'class-101',
            'title': 'Test Session Alpha',
            'description': 'Testing session flow'
        }, headers=self.teacher_headers)
        self.assertEqual(sess_resp.status_code, 201)
        session_id = sess_resp.get_json()['id']

        # Start session
        start_resp = self.app.post(f'/api/sessions/{session_id}/start', headers=self.teacher_headers)
        self.assertEqual(start_resp.status_code, 200)

        # Create Quiz
        quiz_resp = self.app.post(f'/api/sessions/{session_id}/quizzes', json={
            'title': 'Pop Quiz',
            'questions': [{'question': '1 + 1 = ?', 'options': ['1', '2', '3']}]
        }, headers=self.teacher_headers)
        self.assertEqual(quiz_resp.status_code, 201)

        # List Quizzes
        quizzes = self.app.get(f'/api/sessions/{session_id}/quizzes', headers=self.student_headers)
        self.assertEqual(quizzes.status_code, 200)
        self.assertEqual(len(quizzes.get_json()), 1)

    def test_05_reports_csv_and_pdf(self):
        # Session CSV
        csv_resp = self.app.get('/api/reports/session/session-001/csv', headers=self.teacher_headers)
        self.assertEqual(csv_resp.status_code, 200)
        self.assertIn('text/csv', csv_resp.headers.get('Content-Type', ''))

        # Session PDF
        pdf_resp = self.app.get('/api/reports/session/session-001/pdf', headers=self.teacher_headers)
        self.assertEqual(pdf_resp.status_code, 200)
        self.assertIn('application/pdf', pdf_resp.headers.get('Content-Type', ''))

        # Class CSV
        c_csv_resp = self.app.get('/api/reports/class/class-101/csv', headers=self.teacher_headers)
        self.assertEqual(c_csv_resp.status_code, 200)
        self.assertIn('text/csv', c_csv_resp.headers.get('Content-Type', ''))

        # Class PDF
        c_pdf_resp = self.app.get('/api/reports/class/class-101/pdf', headers=self.teacher_headers)
        self.assertEqual(c_pdf_resp.status_code, 200)
        self.assertIn('application/pdf', c_pdf_resp.headers.get('Content-Type', ''))

    def test_06_admin_panel(self):
        stats_resp = self.app.get('/api/admin/stats', headers=self.admin_headers)
        self.assertEqual(stats_resp.status_code, 200)
        sdata = stats_resp.get_json()
        self.assertIn('totalUsers', sdata)
        self.assertIn('activeClasses', sdata)

        users_resp = self.app.get('/api/admin/users', headers=self.admin_headers)
        self.assertEqual(users_resp.status_code, 200)

    def test_07_socketio_realtime(self):
        client = socketio.test_client(app)
        self.assertTrue(client.is_connected())

        # Join session
        client.emit('join_session', {
            'sessionId': 'session-001',
            'uid': 'student-201',
            'name': 'Alex Rivera',
            'role': 'student'
        })
        received = client.get_received()
        self.assertTrue(any(ev['name'] == 'participant_update' for ev in received))

        # Send chat message
        client.emit('chat_message', {
            'sessionId': 'session-001',
            'uid': 'student-201',
            'name': 'Alex Rivera',
            'message': 'Hello everyone!'
        })
        received = client.get_received()
        self.assertTrue(any(ev['name'] == 'new_chat_message' for ev in received))

        # Raise hand
        client.emit('hand_raise', {
            'sessionId': 'session-001',
            'uid': 'student-201',
            'name': 'Alex Rivera',
            'raised': True
        })
        received = client.get_received()
        self.assertTrue(any(ev['name'] == 'hand_raised' for ev in received))

        # Activity Ping with face detection
        client.emit('activity_ping', {
            'sessionId': 'session-001',
            'uid': 'student-201',
            'tabVisible': True,
            'isIdle': False,
            'facePresent': True
        })

        client.disconnect()

    def test_08_teacher_students_directory_and_dossier(self):
        # Teacher views aggregated student directory
        resp = self.app.get('/api/classes/teacher/students', headers=self.teacher_headers)
        self.assertEqual(resp.status_code, 200)
        students = resp.get_json()
        self.assertIsInstance(students, list)
        self.assertGreater(len(students), 0)

        first = students[0]
        self.assertIn('uid', first)
        self.assertIn('attendanceRate', first)
        self.assertIn('focusIndex', first)

        # Deep dossier for individual student
        target_uid = first['uid']
        dossier_resp = self.app.get(f'/api/classes/teacher/students/{target_uid}', headers=self.teacher_headers)
        self.assertEqual(dossier_resp.status_code, 200)
        dossier = dossier_resp.get_json()
        self.assertEqual(dossier['uid'], target_uid)
        self.assertIn('sessions', dossier)
        self.assertIn('submissions', dossier)

        # Role check: student cannot access teacher directory
        forbidden = self.app.get('/api/classes/teacher/students', headers=self.student_headers)
        self.assertEqual(forbidden.status_code, 403)

    def test_09_assignments_lifecycle_submit_grade_remarks(self):
        # 1. Teacher creates assignment
        create_resp = self.app.post('/api/assignments', json={
            'classId': 'class-101',
            'title': 'Binary Trees Lab Assignment',
            'dueDate': '2026-11-15T23:59:00',
            'points': 100,
            'description': 'Implement BFS and DFS tree traversal with recursion.',
            'resourceUrl': 'https://github.com/edumonitor/trees-starter'
        }, headers=self.teacher_headers)
        self.assertEqual(create_resp.status_code, 201)
        assignment = create_resp.get_json()
        assignment_id = assignment['id']

        # 2. Student views assignments
        list_resp = self.app.get('/api/assignments', headers=self.student_headers)
        self.assertEqual(list_resp.status_code, 200)
        items = list_resp.get_json()
        target = next((a for a in items if a['id'] == assignment_id), None)
        self.assertIsNotNone(target)
        self.assertFalse(target['submitted'])

        # 3. Student submits assignment
        submit_resp = self.app.post(f'/api/assignments/{assignment_id}/submit', json={
            'content': 'Completed BFS and DFS traversal algorithms. All unit tests passed.',
            'submissionUrl': 'https://github.com/student/binary-trees-solution'
        }, headers=self.student_headers)
        self.assertEqual(submit_resp.status_code, 200)

        # 4. Teacher reviews submissions
        sub_resp = self.app.get(f'/api/assignments/{assignment_id}/submissions', headers=self.teacher_headers)
        self.assertEqual(sub_resp.status_code, 200)
        sdata = sub_resp.get_json()
        self.assertGreater(len(sdata['submissions']), 0)
        student_submission = sdata['submissions'][0]
        student_uid = student_submission['studentUid']

        # 5. Teacher grades and leaves remarks
        grade_resp = self.app.post(f'/api/assignments/{assignment_id}/submissions/{student_uid}/grade', json={
            'grade': 98,
            'remarks': 'Outstanding tree traversal implementation! Elegant recursion and clean time complexity.'
        }, headers=self.teacher_headers)
        self.assertEqual(grade_resp.status_code, 200)

        # 6. Student views assignments again and sees grade and remarks
        recheck = self.app.get('/api/assignments', headers=self.student_headers)
        self.assertEqual(recheck.status_code, 200)
        recheck_items = recheck.get_json()
        updated = next((a for a in recheck_items if a['id'] == assignment_id), None)
        self.assertIsNotNone(updated)
        self.assertTrue(updated['submitted'])
        self.assertEqual(updated['submission']['grade'], 98)
        self.assertIn('Outstanding', updated['submission']['remarks'])

    def test_10_study_materials_crud_and_youtube(self):
        # 1. Teacher creates YouTube video material
        yt_resp = self.app.post('/api/materials', json={
            'classId': 'class-101',
            'type': 'youtube',
            'title': 'Binary Trees & Heaps Video Walkthrough',
            'url': 'https://www.youtube.com/watch?v=7h1s2SojIRw',
            'content': 'Walkthrough covering max-heaps and heap sort.'
        }, headers=self.teacher_headers)
        self.assertEqual(yt_resp.status_code, 201)
        yt_data = yt_resp.get_json()
        material_id = yt_data['id']
        self.assertEqual(yt_data.get('youtubeId'), '7h1s2SojIRw')

        # 2. Student views materials
        list_resp = self.app.get('/api/materials', headers=self.student_headers)
        self.assertEqual(list_resp.status_code, 200)
        materials = list_resp.get_json()
        self.assertTrue(any(m['id'] == material_id for m in materials))

        # 3. Teacher deletes material
        del_resp = self.app.delete(f'/api/materials/{material_id}', headers=self.teacher_headers)
        self.assertEqual(del_resp.status_code, 200)

    def test_11_session_join_by_code_and_id(self):
        # Join by 6-char joinCode
        join_code_resp = self.app.post('/api/sessions/join', json={
            'joinCode': 'BST001'
        }, headers=self.student_headers)
        self.assertEqual(join_code_resp.status_code, 200)
        sdata = join_code_resp.get_json()
        self.assertEqual(sdata['session']['joinCode'], 'BST001')
        self.assertIn('sessionId', sdata)

        # Join by direct session ID
        session_id = sdata['sessionId']
        join_id_resp = self.app.post('/api/sessions/join', json={
            'joinCode': session_id
        }, headers=self.student_headers)
        self.assertEqual(join_id_resp.status_code, 200)

        # Invalid join code returns 404
        bad_resp = self.app.post('/api/sessions/join', json={
            'joinCode': 'INVALID999'
        }, headers=self.student_headers)
        self.assertEqual(bad_resp.status_code, 404)

if __name__ == '__main__':
    unittest.main()

