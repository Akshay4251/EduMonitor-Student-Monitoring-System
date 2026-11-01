"""
Study Materials REST endpoints.
Teachers share YouTube videos, lecture notes, slide docs, and learning resources with students.
"""

from flask import Blueprint, request, jsonify, g
from datetime import datetime, timezone
from config import db
from auth.middleware import require_auth, require_role
import uuid
import re

materials_bp = Blueprint('materials', __name__, url_prefix='/api/materials')


def extract_youtube_id(url):
    """Extract 11-char YouTube ID from any standard or shortened link."""
    if not url:
        return ''
    url = url.strip()
    pattern = r'(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})'
    match = re.search(pattern, url)
    if match:
        return match.group(1)
    if len(url) == 11 and ' ' not in url and '/' not in url:
        return url
    return ''


@materials_bp.route('', methods=['POST'])
@require_auth
@require_role('teacher', 'admin')
def create_material():
    """Teacher adds study material for a class."""
    data = request.get_json(force=True) or {}
    class_id = data.get('classId')
    if not class_id:
        return jsonify({'error': 'Class ID is required'}), 400

    class_doc = db.collection('classes').document(class_id).get()
    if not class_doc.exists:
        return jsonify({'error': 'Class not found'}), 404

    class_info = class_doc.to_dict()
    mat_id = str(uuid.uuid4())[:10]
    mat_type = data.get('type', 'notes')  # youtube | notes | document | link
    url = data.get('url', '').strip()
    now = datetime.now(timezone.utc).isoformat()

    youtube_id = extract_youtube_id(url) if mat_type == 'youtube' or 'youtu' in url.lower() else ''
    if youtube_id and mat_type != 'youtube':
        mat_type = 'youtube'

    material = {
        'id':          mat_id,
        'classId':     class_id,
        'className':   class_info.get('name', 'Class'),
        'teacherId':   g.uid,
        'teacherName': g.user.get('name', 'Teacher'),
        'title':       data.get('title', 'Study Material'),
        'type':        mat_type,
        'url':         url,
        'youtubeId':   youtube_id,
        'content':     data.get('content', '').strip(),
        'createdAt':   now,
    }

    db.collection('materials').document(mat_id).set(material)
    return jsonify(material), 201


@materials_bp.route('', methods=['GET'])
@require_auth
def list_materials():
    """
    List study materials.
    - Teachers: materials they published (or filtered by ?classId=)
    - Students: materials for their enrolled classes
    - Admin: all materials
    """
    class_id = request.args.get('classId')

    if g.role == 'admin':
        query = db.collection('materials')
        if class_id:
            query = query.where('classId', '==', class_id)
        docs = list(query.stream())
    elif g.role == 'teacher':
        query = db.collection('materials').where('teacherId', '==', g.uid)
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

        all_materials = list(db.collection('materials').stream())
        docs = [d for d in all_materials if d.to_dict().get('classId') in enrolled]
        if class_id:
            docs = [d for d in docs if d.to_dict().get('classId') == class_id]

    items = []
    for d in docs:
        it = d.to_dict()
        it['id'] = d.id
        items.append(it)
    items.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
    return jsonify(items)


@materials_bp.route('/<material_id>', methods=['GET'])
@require_auth
def get_material(material_id):
    doc = db.collection('materials').document(material_id).get()
    if not doc.exists:
        return jsonify({'error': 'Material not found'}), 404
    return jsonify(doc.to_dict())


@materials_bp.route('/<material_id>', methods=['DELETE'])
@require_auth
@require_role('teacher', 'admin')
def delete_material(material_id):
    db.collection('materials').document(material_id).delete()
    return jsonify({'message': 'Material deleted successfully'})
