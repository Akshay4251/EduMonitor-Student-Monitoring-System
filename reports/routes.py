"""
Report generation endpoints — CSV and PDF.
"""

import csv
import io
from flask import Blueprint, request, jsonify, g, Response, make_response
from datetime import datetime, timezone
from config import db
from auth.middleware import require_auth, require_role
from monitoring.scoring import calculate_engagement

reports_bp = Blueprint('reports', __name__, url_prefix='/api/reports')


@reports_bp.route('/session/<session_id>/csv', methods=['GET'])
@require_auth
@require_role('teacher', 'admin')
def session_csv(session_id):
    """Download session engagement data as CSV."""
    session_doc = db.collection('sessions').document(session_id).get()
    if not session_doc.exists:
        return jsonify({'error': 'Session not found'}), 404

    sd = session_doc.to_dict()

    # Collect engagement data
    eng_docs = db.collection('sessions').document(session_id) \
                 .collection('engagement').stream()
    att_docs = {d.id: d.to_dict() for d in
                db.collection('sessions').document(session_id)
                  .collection('attendance').stream()}
    act_docs = {d.id: d.to_dict() for d in
                db.collection('sessions').document(session_id)
                  .collection('activity').stream()}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'Student UID', 'Name', 'Join Time', 'Leave Time', 'Duration (min)',
        'Engagement Score', 'Attendance %', 'Focus %', 'Participation %',
        'Face Presence %', 'Chat Messages', 'Poll Responses', 'Hand Raises',
        'Tab Switches', 'Tab Away (min)', 'Idle Time (min)',
    ])

    for eng_doc in eng_docs:
        e   = eng_doc.to_dict()
        uid = eng_doc.id
        att = att_docs.get(uid, {})
        act = act_docs.get(uid, {})

        writer.writerow([
            uid,
            e.get('name', att.get('name', '')),
            att.get('joinTime', ''),
            att.get('leaveTime', ''),
            round(att.get('duration', 0) / 60, 1),
            e.get('score', 0),
            e.get('attendance', 0),
            e.get('focus', 0),
            e.get('participation', 0),
            e.get('facePresence', 0),
            act.get('chatCount', 0),
            act.get('pollResponses', 0),
            act.get('handRaiseCount', 0),
            act.get('tabSwitchCount', 0),
            round(act.get('tabAwayDuration', 0) / 60, 1),
            round(act.get('idleDuration', 0) / 60, 1),
        ])

    resp = make_response(output.getvalue())
    resp.headers['Content-Type'] = 'text/csv'
    resp.headers['Content-Disposition'] = \
        f'attachment; filename=session_{session_id}_report.csv'
    return resp


@reports_bp.route('/session/<session_id>/pdf', methods=['GET'])
@require_auth
@require_role('teacher', 'admin')
def session_pdf(session_id):
    """Download session engagement data as PDF."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import inch, cm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT

    session_doc = db.collection('sessions').document(session_id).get()
    if not session_doc.exists:
        return jsonify({'error': 'Session not found'}), 404
    sd = session_doc.to_dict()

    eng_docs = list(db.collection('sessions').document(session_id)
                      .collection('engagement').stream())
    att_docs = {d.id: d.to_dict() for d in
                db.collection('sessions').document(session_id)
                  .collection('attendance').stream()}
    act_docs = {d.id: d.to_dict() for d in
                db.collection('sessions').document(session_id)
                  .collection('activity').stream()}

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4),
                            topMargin=1*cm, bottomMargin=1*cm)
    styles = getSampleStyleSheet()
    elements = []

    # Title
    title_style = ParagraphStyle('Title', parent=styles['Title'],
                                  fontSize=18, spaceAfter=12,
                                  alignment=TA_CENTER)
    elements.append(Paragraph(f"Session Report: {sd.get('title', session_id)}", title_style))
    elements.append(Paragraph(
        f"Class: {sd.get('className', '')} | Date: {sd.get('startedAt', '')[:10]}",
        styles['Normal']))
    elements.append(Spacer(1, 0.4 * inch))

    # Table
    headers = ['Name', 'Score', 'Attendance', 'Focus', 'Participation',
               'Chats', 'Polls', 'Hand Raises', 'Tab Switches']
    data = [headers]

    for eng_doc in eng_docs:
        e   = eng_doc.to_dict()
        uid = eng_doc.id
        att = att_docs.get(uid, {})
        act = act_docs.get(uid, {})
        data.append([
            e.get('name', att.get('name', uid[:8])),
            f"{e.get('score', 0)}%",
            f"{e.get('attendance', 0)}%",
            f"{e.get('focus', 0)}%",
            f"{e.get('participation', 0)}%",
            str(act.get('chatCount', 0)),
            str(act.get('pollResponses', 0)),
            str(act.get('handRaiseCount', 0)),
            str(act.get('tabSwitchCount', 0)),
        ])

    if len(data) == 1:
        data.append(['No data'] + [''] * (len(headers) - 1))

    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND',  (0, 0), (-1, 0), colors.HexColor('#667eea')),
        ('TEXTCOLOR',   (0, 0), (-1, 0), colors.white),
        ('FONTSIZE',    (0, 0), (-1, 0), 11),
        ('FONTSIZE',    (0, 1), (-1, -1), 9),
        ('ALIGN',       (1, 0), (-1, -1), 'CENTER'),
        ('GRID',        (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING',    (0, 0), (-1, -1), 6),
    ]))
    elements.append(table)

    doc.build(elements)
    buffer.seek(0)

    resp = make_response(buffer.getvalue())
    resp.headers['Content-Type'] = 'application/pdf'
    resp.headers['Content-Disposition'] = \
        f'attachment; filename=session_{session_id}_report.pdf'
    return resp


@reports_bp.route('/class/<class_id>/csv', methods=['GET'])
@require_auth
@require_role('teacher', 'admin')
def class_csv(class_id):
    """Aggregate CSV across all sessions in a class."""
    sessions = db.collection('sessions').where('classId', '==', class_id).stream()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Session', 'Date', 'Student', 'Score', 'Attendance',
                     'Focus', 'Participation'])

    for s_doc in sessions:
        sd = s_doc.to_dict()
        eng_docs = db.collection('sessions').document(s_doc.id) \
                     .collection('engagement').stream()
        for e_doc in eng_docs:
            e = e_doc.to_dict()
            writer.writerow([
                sd.get('title', s_doc.id),
                sd.get('startedAt', '')[:10],
                e.get('name', e_doc.id[:8]),
                e.get('score', 0),
                e.get('attendance', 0),
                e.get('focus', 0),
                e.get('participation', 0),
            ])

    resp = make_response(output.getvalue())
    resp.headers['Content-Type'] = 'text/csv'
    resp.headers['Content-Disposition'] = \
        f'attachment; filename=class_{class_id}_report.csv'
    return resp


@reports_bp.route('/class/<class_id>/pdf', methods=['GET'])
@require_auth
@require_role('teacher', 'admin')
def class_pdf(class_id):
    """Aggregate PDF across all sessions in a class."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import inch, cm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER

    class_doc = db.collection('classes').document(class_id).get()
    class_name = class_doc.to_dict().get('name', class_id) if class_doc.exists else class_id

    sessions = list(db.collection('sessions').where('classId', '==', class_id).stream())

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), topMargin=1*cm, bottomMargin=1*cm)
    styles = getSampleStyleSheet()
    elements = []

    title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=18, spaceAfter=12, alignment=TA_CENTER)
    elements.append(Paragraph(f"Class Analytics Report: {class_name}", title_style))
    elements.append(Paragraph(f"Class ID: {class_id} | Total Sessions: {len(sessions)}", styles['Normal']))
    elements.append(Spacer(1, 0.4 * inch))

    headers = ['Session Title', 'Date', 'Student Name', 'Engagement Score', 'Attendance', 'Focus', 'Participation']
    data = [headers]

    for s_doc in sessions:
        sd = s_doc.to_dict()
        eng_docs = list(db.collection('sessions').document(s_doc.id).collection('engagement').stream())
        for e_doc in eng_docs:
            e = e_doc.to_dict()
            data.append([
                sd.get('title', s_doc.id),
                sd.get('startedAt', '')[:10] or '—',
                e.get('name', e_doc.id[:8]),
                f"{e.get('score', 0)}%",
                f"{e.get('attendance', 0)}%",
                f"{e.get('focus', 0)}%",
                f"{e.get('participation', 0)}%",
            ])

    if len(data) == 1:
        data.append(['No data recorded yet'] + [''] * (len(headers) - 1))

    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND',  (0, 0), (-1, 0), colors.HexColor('#667eea')),
        ('TEXTCOLOR',   (0, 0), (-1, 0), colors.white),
        ('FONTSIZE',    (0, 0), (-1, 0), 10),
        ('FONTSIZE',    (0, 1), (-1, -1), 9),
        ('ALIGN',       (3, 0), (-1, -1), 'CENTER'),
        ('GRID',        (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING',    (0, 0), (-1, -1), 5),
    ]))
    elements.append(table)
    doc.build(elements)
    buffer.seek(0)

    resp = make_response(buffer.getvalue())
    resp.headers['Content-Type'] = 'application/pdf'
    resp.headers['Content-Disposition'] = f'attachment; filename=class_{class_id}_report.pdf'
    return resp
