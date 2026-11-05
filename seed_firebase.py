"""
seed_firebase.py — Standalone Demo Data Seeder for Real Firebase & Firestore
═══════════════════════════════════════════════════════════════════════════
Populates 4-5 accredited items per model directly into your Firebase project:
  • 5 Users (Faculty, Scholars, System Admin)
  • 5 Classes (Computer Science, Artificial Intelligence, Cybersecurity, etc.)
  • 5 Sessions (Live & completed interactive lectures with telemetry)
  • 5 Coursework Assignments & Submissions
  • 5 Academic Study Materials & Curated Videos

Usage:
  python seed_firebase.py
"""

import os
import copy
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

from config import db, firebase_auth, USE_MOCK
from seed_data import get_seed_data


def run_seed():
    print("=" * 70)
    print("  EduMonitor — Academic Baseline Data Seeder")
    print("=" * 70)

    if USE_MOCK:
        print("[Mode] Running in Local Database Mode (saving to data/edumonitor_db.json).")
        print("       To seed your LIVE Google Firebase Cloud project, configure your")
        print("       FIREBASE_PROJECT_ID & credentials in .env and re-run this script!\n")
    else:
        proj_id = os.getenv('FIREBASE_PROJECT_ID', 'Google Cloud Project')
        print(f"[Mode] Connected to LIVE Firebase Cloud Project: '{proj_id}'")
        print("       Seeding real Firestore collections and Firebase Auth records...\n")

    seed = get_seed_data()
    now = datetime.now(timezone.utc).isoformat()

    # 1. Seed Users
    print("--> 1. Seeding Faculty, Scholars, and Administrators...")
    user_count = 0
    for u in seed['users']:
        uid = u['uid']
        email = u['email']
        name = u['displayName']
        role = u['role']

        if not USE_MOCK:
            # Create in Firebase Auth if not already existing
            try:
                existing = firebase_auth.get_user_by_email(email)
                uid = existing.uid
            except Exception:
                try:
                    user_rec = firebase_auth.create_user(
                        uid=uid,
                        email=email,
                        password='password123',
                        display_name=name
                    )
                    uid = user_rec.uid
                except Exception as e:
                    pass

            try:
                firebase_auth.set_custom_user_claims(uid, {'role': role})
            except Exception:
                pass

        u_doc = copy.deepcopy(u)
        u_doc['uid'] = uid
        u_doc['password'] = 'password123'
        db.collection('users').document(uid).set(u_doc, merge=True)
        user_count += 1
        print(f"    [+] User: {name} ({email}) [{role.upper()}]")

    # Also seed alias pointers for quick sign-in
    for alias_email, target_uid, target_name, target_role in seed['legacy_aliases']:
        alias_doc = copy.deepcopy(seed['users'][0] if target_role == 'teacher' else seed['users'][3])
        alias_doc['email'] = alias_email
        alias_doc['displayName'] = target_name
        alias_doc['role'] = target_role
        alias_doc['uid'] = target_uid
        alias_doc['password'] = 'password123'
        db.collection('users').document(alias_email).set(alias_doc, merge=True)

    print(f"    [OK] {user_count} User accounts successfully synchronized.\n")

    # 2. Seed Classes
    print("--> 2. Seeding Academic Courses / Classes...")
    class_count = 0
    for c in seed['classes']:
        db.collection('classes').document(c['id']).set(c, merge=True)
        class_count += 1
        print(f"    [+] Class: {c['name']} (Code: {c['joinCode']})")
    print(f"    [OK] {class_count} University courses active.\n")

    # 3. Seed Sessions & Telemetry
    print("--> 3. Seeding Lecture Sessions & Student Telemetry...")
    sess_count = 0
    for s in seed['sessions']:
        sid = s['id']
        db.collection('sessions').document(sid).set(s, merge=True)
        sess_count += 1

        # Seed attendance & engagement analytics for past sessions
        if s.get('status') in ('ended', 'live'):
            student_analytics = [
                ('student-201', 'Liam Chen', 98.2, 100.0, 99.0),
                ('student-202', 'Sophia Rodriguez', 94.6, 100.0, 95.0),
                ('student-203', 'Ethan Wright', 91.8, 100.0, 92.0),
                ('student-204', 'Aisha Patel', 93.4, 100.0, 94.0),
                ('student-205', 'Noah Kim', 89.5, 95.0, 90.0),
            ]
            for uid, name, eng, att, foc in student_analytics:
                db.collection('sessions').document(sid).collection('attendance').document(uid).set({
                    'uid': uid, 'name': name, 'status': 'present',
                    'joinTime': s.get('startedAt', now), 'duration': 3600
                }, merge=True)
                db.collection('sessions').document(sid).collection('engagement').document(uid).set({
                    'uid': uid, 'name': name, 'score': eng, 'attendance': att, 'focus': foc
                }, merge=True)

        print(f"    [+] Session: {s['title']} ({s['status'].upper()})")
    print(f"    [OK] {sess_count} Sessions seeded with engagement telemetry.\n")

    # 4. Seed Assignments & Submissions
    print("--> 4. Seeding Coursework Assignments & Submissions...")
    assign_count = 0
    for a in seed['assignments']:
        aid = a['id']
        subs = a.pop('submissions', {})
        db.collection('assignments').document(aid).set(a, merge=True)
        assign_count += 1
        sub_count = 0
        for suid, sub_data in subs.items():
            db.collection('assignments').document(aid).collection('submissions').document(suid).set(sub_data, merge=True)
            sub_count += 1
        print(f"    [+] Assignment: {a['title']} ({sub_count} submissions)")
    print(f"    [OK] {assign_count} Coursework assignments active.\n")

    # 5. Seed Study Materials
    print("--> 5. Seeding Academic Study Materials & Video Walkthroughs...")
    mat_count = 0
    for m in seed['materials']:
        db.collection('materials').document(m['id']).set(m, merge=True)
        mat_count += 1
        print(f"    [+] Material: {m['title']} [{m['type'].upper()}]")
    print(f"    [OK] {mat_count} Study resources active.\n")

    print("=" * 70)
    print("  [SUCCESS] All 5 models populated with 4-5 items each!")
    print("  You can now start your app with 'python app.py'")
    print("=" * 70)


if __name__ == '__main__':
    run_seed()
