"""
Assignments management and submission REST endpoints.
Teachers assign tasks; students submit work; teachers review and give remarks.
"""

from flask import Blueprint, request, jsonify, g
from datetime import datetime, timezone
from config import db
from auth.middleware import require_auth, require_role
import uuid

assignments_bp = Blueprint('assignments', __name__, url_prefix='/api/assignments')


@assignments_bp.route('', methods=['POST'])
@require_auth
@require_role('teacher', 'admin')
def create_assignment():
    """Teacher creates an assignment for a class."""
    data = request.get_json(force=True) or {}
    class_id = data.get('classId')
    if not class_id:
        return jsonify({'error': 'Class ID is required'}), 400

    # Verify class
    class_doc = db.collection('classes').document(class_id).get()
    if not class_doc.exists:
        return jsonify({'error': 'Class not found'}), 404

    class_info = class_doc.to_dict()
    assignment_id = str(uuid.uuid4())[:10]
    now = datetime.now(timezone.utc).isoformat()

    assignment_data = {
        'id':          assignment_id,
        'classId':     class_id,
        'className':   class_info.get('name', 'Class'),
        'teacherId':   g.uid,
        'teacherName': g.user.get('name', 'Teacher'),
        'title':       data.get('title', 'Untitled Assignment'),
        'description': data.get('description', ''),
        'dueDate':     data.get('dueDate', ''),
        'points':      int(data.get('points', 100)),
        'resources':   data.get('resources', ''),
        'createdAt':   now,
    }

    db.collection('assignments').document(assignment_id).set(assignment_data)
    return jsonify(assignment_data), 201


@assignments_bp.route('', methods=['GET'])
@require_auth
def list_assignments():
    """
    List assignments.
    - Teachers: all assignments they created (or filtered by ?classId=)
    - Students: all assignments for classes they are enrolled in
    - Admin: all assignments
    """
    class_id = request.args.get('classId')

    if g.role == 'admin':
        query = db.collection('assignments')
        if class_id:
            query = query.where('classId', '==', class_id)
        docs = list(query.stream())
    elif g.role == 'teacher':
        query = db.collection('assignments').where('teacherId', '==', g.uid)
        if class_id:
            query = query.where('classId', '==', class_id)
        docs = list(query.stream())
    else:
        # Student: get enrolled classes (from classes.students array or user.enrolledClasses)
        enrolled_docs = list(db.collection('classes').where('students', 'array_contains', g.uid).stream())
        enrolled = [cd.id for cd in enrolled_docs]
        if not enrolled:
            udoc = db.collection('users').document(g.uid).get()
            enrolled = udoc.to_dict().get('enrolledClasses', []) if udoc.exists else []

        if not enrolled:
            return jsonify([])

        all_assignments = list(db.collection('assignments').stream())
        docs = [d for d in all_assignments if d.to_dict().get('classId') in enrolled]
        if class_id:
            docs = [d for d in docs if d.to_dict().get('classId') == class_id]

    results = []
    for d in docs:
        item = d.to_dict()
        aid = d.id
        item['id'] = aid

        # Attach submission counts & student's own submission
        try:
            subs = list(d.reference.collection('submissions').stream())
            item['submissionsCount'] = len(subs)
            item['submissionCount'] = len(subs)

            if g.role == 'student':
                my_sub = d.reference.collection('submissions').document(g.uid).get()
                if my_sub.exists:
                    sdict = my_sub.to_dict()
                    sub_info = {
                        'submittedAt': sdict.get('submittedAt'),
                        'content': sdict.get('content', ''),
                        'submissionUrl': sdict.get('submissionUrl') or sdict.get('attachmentUrl', ''),
                        'attachmentUrl': sdict.get('submissionUrl') or sdict.get('attachmentUrl', ''),
                        'grade': sdict.get('grade'),
                        'remarks': sdict.get('remarks', ''),
                        'status': 'graded' if sdict.get('grade') is not None else 'submitted',
                    }
                    item['submitted'] = True
                    item['submission'] = sub_info
                    item['mySubmission'] = sub_info
                else:
                    item['submitted'] = False
                    item['submission'] = None
                    item['mySubmission'] = None
            else:
                item['submitted'] = False
                item['submission'] = None
                item['mySubmission'] = None
        except Exception:
            item['submissionsCount'] = 0
            item['submissionCount'] = 0
            item['submitted'] = False
            item['submission'] = None
            item['mySubmission'] = None

        results.append(item)

    # Sort newest first
    results.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
    return jsonify(results)


@assignments_bp.route('/<assignment_id>', methods=['GET'])
@require_auth
def get_assignment(assignment_id):
    doc = db.collection('assignments').document(assignment_id).get()
    if not doc.exists:
        return jsonify({'error': 'Assignment not found'}), 404
    return jsonify(doc.to_dict())


@assignments_bp.route('/<assignment_id>', methods=['DELETE'])
@require_auth
@require_role('teacher', 'admin')
def delete_assignment(assignment_id):
    db.collection('assignments').document(assignment_id).delete()
    return jsonify({'message': 'Assignment deleted successfully'})


@assignments_bp.route('/<assignment_id>/submit', methods=['POST'])
@require_auth
@require_role('student')
def submit_assignment(assignment_id):
    """Student submits answers/links for an assignment."""
    adoc = db.collection('assignments').document(assignment_id).get()
    if not adoc.exists:
        return jsonify({'error': 'Assignment not found'}), 404

    data = request.get_json(force=True) or {}
    now = datetime.now(timezone.utc).isoformat()

    sub_data = {
        'studentId':     g.uid,
        'studentUid':    g.uid,
        'uid':           g.uid,
        'studentName':   g.user.get('name') or g.user.get('displayName') or g.user.get('email', 'Student'),
        'studentEmail':  g.user.get('email', ''),
        'assignmentId':  assignment_id,
        'content':       data.get('content', '').strip(),
        'submissionUrl': (data.get('submissionUrl') or data.get('attachmentUrl') or '').strip(),
        'attachmentUrl': (data.get('submissionUrl') or data.get('attachmentUrl') or '').strip(),
        'submittedAt':   now,
        'status':        'submitted',
        'grade':         None,
        'remarks':       None,
        'reviewedAt':    None,
    }

    db.collection('assignments').document(assignment_id) \
      .collection('submissions').document(g.uid).set(sub_data, merge=True)

    return jsonify({'message': 'Assignment submitted successfully', 'submission': sub_data}), 200


@assignments_bp.route('/<assignment_id>/submissions', methods=['GET'])
@require_auth
@require_role('teacher', 'admin')
def list_submissions(assignment_id):
    """Teacher reviews all submissions for an assignment."""
    adoc = db.collection('assignments').document(assignment_id).get()
    if not adoc.exists:
        return jsonify({'error': 'Assignment not found'}), 404

    subs = list(adoc.reference.collection('submissions').stream())
    results = []
    for s in subs:
        sdict = s.to_dict()
        sdict['uid'] = s.id
        sdict['studentUid'] = s.id
        sdict['studentId'] = s.id
        results.append(sdict)

    # Sort recent submissions first
    results.sort(key=lambda x: x.get('submittedAt', ''), reverse=True)
    return jsonify({'assignment': adoc.to_dict(), 'submissions': results})


@assignments_bp.route('/<assignment_id>/submissions/<student_uid>/grade', methods=['POST'])
@require_auth
@require_role('teacher', 'admin')
def grade_submission(assignment_id, student_uid):
    """Teacher enters marks/grade and remarks for a student's submission."""
    data = request.get_json(force=True) or {}
    grade = data.get('grade')
    remarks = data.get('remarks', '').strip()

    if grade is None:
        return jsonify({'error': 'Grade is required'}), 400

    now = datetime.now(timezone.utc).isoformat()
    sub_ref = db.collection('assignments').document(assignment_id) \
                .collection('submissions').document(student_uid)

    sub_snap = sub_ref.get()
    if not sub_snap.exists:
        return jsonify({'error': 'Submission not found'}), 404

    updates = {
        'grade':      float(grade) if str(grade).replace('.', '', 1).isdigit() else str(grade),
        'remarks':    remarks,
        'status':     'graded',
        'reviewedAt': now,
        'reviewedBy': g.uid,
    }
    sub_ref.update(updates)

    return jsonify({'message': 'Grade and remarks saved successfully', 'updates': updates})
