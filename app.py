"""
Student Monitoring System — Flask application entry point.
Run with:  python app.py
"""

from flask import Flask, send_from_directory, jsonify, request
from flask_socketio import SocketIO
from flask_cors import CORS
from config import SECRET_KEY

# ── Create app ────────────────────────────────────────────────────
app = Flask(__name__, static_folder='static', static_url_path='/static')
app.config['SECRET_KEY'] = SECRET_KEY
app.url_map.strict_slashes = False
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# ── Register blueprints ──────────────────────────────────────────
from auth.routes        import auth_bp
from classes.routes     import classes_bp
from sessions.routes    import sessions_bp
from monitoring.routes  import monitoring_bp
from reports.routes     import reports_bp
from admin.routes       import admin_bp
from assignments.routes import assignments_bp
from materials.routes   import materials_bp

app.register_blueprint(auth_bp)
app.register_blueprint(classes_bp)
app.register_blueprint(sessions_bp)
app.register_blueprint(monitoring_bp)
app.register_blueprint(reports_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(assignments_bp)
app.register_blueprint(materials_bp)

# ── Register Socket.IO events ────────────────────────────────────
from sessions.realtime import register_socket_events
register_socket_events(socketio)

# ── Firebase Client Configuration Endpoint ────────────────────────
@app.route('/api/config/firebase', methods=['GET'])
def get_firebase_client_config():
    """Exposes Firebase client initialization parameters if configured, without exposing private keys."""
    import os, json
    from config import USE_MOCK

    api_key = os.getenv('FIREBASE_API_KEY', '')
    project_id = os.getenv('FIREBASE_PROJECT_ID', '')

    # If project_id not set in env, inspect key file if present
    key_path = os.path.join(os.path.dirname(__file__), 'firebase_admin_key.json')
    if not project_id and os.path.exists(key_path):
        try:
            with open(key_path, 'r', encoding='utf-8') as f:
                kdata = json.load(f)
                project_id = kdata.get('project_id', '')
        except Exception:
            pass

    auth_domain = os.getenv('FIREBASE_AUTH_DOMAIN', f"{project_id}.firebaseapp.com" if project_id else "")
    storage_bucket = os.getenv('FIREBASE_STORAGE_BUCKET', f"{project_id}.appspot.com" if project_id else "")
    messaging_sender_id = os.getenv('FIREBASE_MESSAGING_SENDER_ID', '')
    app_id = os.getenv('FIREBASE_APP_ID', '')

    is_configured = bool(api_key and project_id and api_key != "YOUR_API_KEY")

    return jsonify({
        'configured': is_configured,
        'projectId': project_id or None,
        'mode': 'live' if not USE_MOCK else 'local',
        'config': {
            'apiKey': api_key,
            'authDomain': auth_domain,
            'projectId': project_id,
            'storageBucket': storage_bucket,
            'messagingSenderId': messaging_sender_id,
            'appId': app_id,
        } if is_configured else None
    })


# ── Serve SPA ─────────────────────────────────────────────────────
@app.route('/')
@app.route('/<path:path>')
def serve_spa(path=''):
    # Never return index.html for API requests - return 404 JSON instead!
    if path.startswith('api') or request.path.startswith('/api'):
        return jsonify({'error': f'API endpoint not found: /{path}'}), 404

    if path:
        try:
            return send_from_directory(app.static_folder, path)
        except Exception:
            pass
    return send_from_directory(app.static_folder, 'index.html')


@app.errorhandler(404)
def handle_404(e):
    if request.path.startswith('/api'):
        return jsonify({'error': f'API endpoint not found: {request.path}'}), 404
    return send_from_directory(app.static_folder, 'index.html')


@app.errorhandler(500)
def handle_500(e):
    if request.path.startswith('/api'):
        return jsonify({'error': 'Internal server error'}), 500
    return jsonify({'error': 'Server error'}), 500


# ── Run ───────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("[EduMonitor] Student Monitoring System starting on http://localhost:5000")
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)
