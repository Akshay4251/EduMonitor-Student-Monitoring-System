/**
 * dashboard.js — Teacher live monitoring dashboard.
 * Renders a real-time grid of student activity cards with status indicators.
 */

let currentMonitorSessionId = null;

async function initMonitorDashboard(sessionId) {
  if (!sessionId) return;
  currentMonitorSessionId = sessionId;
  const container = document.getElementById('monitor-content');
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><span>Connecting to monitoring…</span></div>';

  try {
    const session = await Auth.apiFetch(`/api/sessions/${sessionId}`);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-header__title">Live Monitor: ${session.title}</div>
          <div class="page-header__subtitle">${session.className} • <span class="badge badge--live"><span class="badge-dot badge-dot--live"></span> LIVE</span></div>
        </div>
        <div class="d-flex gap-sm">
          <button class="btn btn-ghost btn-sm" onclick="navigate('session', {sessionId:'${sessionId}'})"><i class="fas fa-video"></i> Back to Session</button>
          <button class="btn btn-danger btn-sm" onclick="endSessionFromMonitor('${sessionId}')"><i class="fas fa-stop"></i> End Session</button>
        </div>
      </div>

      <div id="alert-container"></div>

      <div class="grid-stats mb-xl">
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--primary"><i class="fas fa-users"></i></div>
          <div><div class="stat-card__value" id="monitor-total">0</div><div class="stat-card__label">Total Students</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--success"><i class="fas fa-eye"></i></div>
          <div><div class="stat-card__value" id="monitor-active">0</div><div class="stat-card__label">Active</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--warning"><i class="fas fa-moon"></i></div>
          <div><div class="stat-card__value" id="monitor-idle">0</div><div class="stat-card__label">Idle</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--danger"><i class="fas fa-exclamation-triangle"></i></div>
          <div><div class="stat-card__value" id="monitor-alert">0</div><div class="stat-card__label">Tab Away</div></div>
        </div>
      </div>

      <h3 class="fw-700 mb-md">Student Activity</h3>
      <div class="monitor-grid" id="monitor-grid">
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-state__icon"><i class="fas fa-satellite-dish"></i></div>
          <div class="empty-state__title">Waiting for activity data…</div>
          <div class="empty-state__text">Student activity will appear here in real-time</div>
        </div>
      </div>
    `;

    // Connect socket if not already
    if (!SocketClient || !sessionId) return;
    // Make sure we're in the teacher room
    SocketClient.connect(sessionId);

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__title">Error</div><div class="empty-state__text">${err.message}</div></div>`;
  }
}

/**
 * Called by SocketClient when 'live_activity' event arrives.
 */
function updateMonitorGrid(data) {
  const grid = document.getElementById('monitor-grid');
  if (!grid || App.currentPage !== 'monitor') return;

  const students = data.students || [];

  // Update stat counters
  const total  = students.length;
  const active = students.filter(s => s.tabVisible && !s.isIdle).length;
  const idle   = students.filter(s => s.isIdle).length;
  const tabAway = students.filter(s => !s.tabVisible).length;

  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setVal('monitor-total', total);
  setVal('monitor-active', active);
  setVal('monitor-idle', idle);
  setVal('monitor-alert', tabAway);

  if (students.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state__icon"><i class="fas fa-user-slash"></i></div>
        <div class="empty-state__title">No students connected</div>
      </div>`;
    return;
  }

  // Sort: alert first, then idle, then active
  students.sort((a, b) => {
    const scoreA = (!a.tabVisible ? 0 : a.isIdle ? 1 : 2);
    const scoreB = (!b.tabVisible ? 0 : b.isIdle ? 1 : 2);
    return scoreA - scoreB;
  });

  grid.innerHTML = students.map(s => {
    const isAlert   = !s.tabVisible || s.idleSeconds > 180;
    const isWarning = s.isIdle && s.idleSeconds > 60;
    const isActive  = s.tabVisible && !s.isIdle;
    const initials  = (s.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const idleMin   = Math.floor(s.idleSeconds / 60);
    const idleSec   = s.idleSeconds % 60;

    let statusText = 'Active';
    let statusIcon = 'fa-check-circle';
    let statusColor = 'text-success';
    if (!s.tabVisible) {
      statusText = 'Tab Away';
      statusIcon = 'fa-eye-slash';
      statusColor = 'text-danger';
    } else if (s.isIdle) {
      statusText = `Idle ${idleMin}m ${idleSec}s`;
      statusIcon = 'fa-moon';
      statusColor = 'text-warning';
    }

    return `
      <div class="student-card ${isAlert ? 'student-card--alert' : isWarning ? 'student-card--warning' : isActive ? 'student-card--active' : ''}">
        <div class="student-card__avatar">${initials}</div>
        <div class="student-card__name">${s.name}</div>
        <div class="student-card__status ${statusColor}">
          <i class="fas ${statusIcon}"></i> ${statusText}
        </div>
        <div class="student-card__metrics">
          <div class="student-card__metric" title="Chat messages">
            <i class="fas fa-comment"></i> ${s.chatCount || 0}
          </div>
          <div class="student-card__metric" title="Poll responses">
            <i class="fas fa-poll"></i> ${s.pollResponses || 0}
          </div>
          <div class="student-card__metric" title="Hand raises">
            <i class="fas fa-hand-paper"></i> ${s.handRaiseCount || 0}
          </div>
          <div class="student-card__metric" title="Tab switches">
            <i class="fas fa-exchange-alt"></i> ${s.tabSwitchCount || 0}
          </div>
        </div>
        ${s.facePresent !== undefined ? `
          <div class="text-xs mt-sm ${s.facePresent ? 'text-success' : 'text-danger'}">
            <i class="fas fa-${s.facePresent ? 'smile' : 'meh'}"></i> Face ${s.facePresent ? 'detected' : 'not detected'}
          </div>` : ''}
      </div>`;
  }).join('');
}

async function endSessionFromMonitor(sessionId) {
  if (!confirm('End this session? All students will be disconnected.')) return;
  try {
    await Auth.apiFetch(`/api/sessions/${sessionId}/end`, { method: 'POST' });
    showToast('Session ended', 'info');
    navigate('dashboard');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
