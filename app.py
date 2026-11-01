"""
Student Monitoring System — Flask application entry point.
Run with:  python app.py
"""

from flask import Flask, send_from_directory
from flask_socketio import SocketIO
from flask_cors import CORS
from config import SECRET_KEY

# ── Create app ────────────────────────────────────────────────────
app = Flask(__name__, static_folder='static', static_url_path='/static')
app.config['SECRET_KEY'] = SECRET_KEY
CORS(app, resources={r"/api/*": {"origins": "*"}})

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

# ── Serve SPA ─────────────────────────────────────────────────────
@app.route('/')
@app.route('/<path:path>')
def serve_spa(path=''):
    if path and not path.startswith('api/'):
        try:
            return send_from_directory(app.static_folder, path)
        except Exception:
            pass
    return send_from_directory(app.static_folder, 'index.html')


# ── Run ───────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("[EduMonitor] Student Monitoring System starting on http://localhost:5000")
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)
