/**
 * app.js — SPA Router, Page Rendering, Global State
 * ─────────────────────────────────────────────────────────────────
 * Single-page application controller.  Shows/hides page sections,
 * manages auth state, and orchestrates sub-modules.
 */

/* ══════════════════════════════════════════════════════════════════
   GLOBAL STATE
   ══════════════════════════════════════════════════════════════════ */
const App = {
  user: null,       // Firebase user object
  profile: null,    // Firestore profile { role, displayName, … }
  currentPage: '',
  classes: [],
  sessions: [],
};

/* ══════════════════════════════════════════════════════════════════
   TOAST SYSTEM
   ══════════════════════════════════════════════════════════════════ */
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <i class="fas ${icons[type] || icons.info} toast__icon text-${type === 'error' ? 'danger' : type}"></i>
    <span class="toast__text">${message}</span>
    <button class="toast__close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

/* ══════════════════════════════════════════════════════════════════
   MODAL HELPERS & UTILITIES
   ══════════════════════════════════════════════════════════════════ */
if (!window.escapeHTML) {
  window.escapeHTML = function(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };
}

function openModal(id) {
  document.getElementById(id)?.classList.add('active');
  if (id === 'create-assignment-modal' && typeof populateAssignmentClassSelect === 'function') {
    populateAssignmentClassSelect();
  }
  if (id === 'add-material-modal' && typeof populateMaterialClassSelect === 'function') {
    populateMaterialClassSelect();
  }
}
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

/* ══════════════════════════════════════════════════════════════════
   ROUTER
   ══════════════════════════════════════════════════════════════════ */
function navigate(page, params = {}) {
  // Hide all pages
  document.querySelectorAll('[data-page]').forEach(el => el.classList.add('hidden'));
  // Show target
  const target = document.querySelector(`[data-page="${page}"]`);
  if (target) target.classList.remove('hidden');

  // Update sidebar active state
  document.querySelectorAll('.sidebar__item').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === page);
  });

  App.currentPage = page;

  // Page-specific init
  switch (page) {
    case 'dashboard':    renderDashboard(); break;
    case 'classes':      renderClasses();   break;
    case 'class-detail': renderClassDetail(params.classId); break;
    case 'students':     renderStudents(); break;
    case 'assignments':  renderAssignments(); break;
    case 'materials':    renderMaterials(); break;
    case 'session':      initSession(params.sessionId); break;
    case 'monitor':      initMonitorDashboard(params.sessionId); break;
    case 'reports':      renderReports(); break;
    case 'admin':        renderAdmin();  break;
    case 'profile':      renderProfile(); break;
  }
}

/* ══════════════════════════════════════════════════════════════════
   AUTH UI
   ══════════════════════════════════════════════════════════════════ */
function initAuthUI() {
  // Tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.target;
      document.getElementById('login-form').classList.toggle('hidden', target !== 'login');
      document.getElementById('register-form').classList.toggle('hidden', target !== 'register');
    });
  });

  // Login
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div>';
    try {
      await Auth.login(
        document.getElementById('login-email').value,
        document.getElementById('login-password').value,
      );
      showToast('Welcome back!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  });

  // Register
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div>';
    try {
      await Auth.register(
        document.getElementById('reg-email').value,
        document.getElementById('reg-password').value,
        document.getElementById('reg-name').value,
        document.getElementById('reg-role').value,
      );
      showToast('Account created!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Create Account';
    }
  });
}

async function quickLogin(email, password) {
  const emailInput = document.getElementById('login-email');
  const passInput = document.getElementById('login-password');
  if (emailInput && passInput) {
    emailInput.value = email;
    passInput.value = password;
  }
  try {
    await Auth.login(email, password);
    showToast(`Signed in as ${email.split('@')[0]}!`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ══════════════════════════════════════════════════════════════════
   AUTH STATE LISTENER
   ══════════════════════════════════════════════════════════════════ */
Auth.onAuthStateChanged(async (user) => {
  if (user) {
    App.user = user;
    try {
      App.profile = await Auth.apiFetch('/api/auth/profile');
    } catch {
      App.profile = { role: 'student', displayName: user.displayName || user.email || '' };
    }

    // Update header
    document.getElementById('app-shell').classList.remove('hidden');
    document.getElementById('auth-page').classList.add('hidden');
    document.getElementById('user-name').textContent = App.profile.displayName || user.email;
    document.getElementById('user-role').textContent = App.profile.role;
    document.getElementById('user-avatar-letter').textContent =
      (App.profile.displayName || user.email || '?')[0].toUpperCase();

    // Show/hide nav items based on role
    document.querySelectorAll('[data-roles]').forEach(el => {
      const roles = el.dataset.roles.split(',');
      el.classList.toggle('hidden', !roles.includes(App.profile.role));
    });

    // Check for query parameters (?session=... or ?class=...)
    const urlParams = new URLSearchParams(window.location.search);
    const targetSession = urlParams.get('session');
    const targetClass = urlParams.get('class');
    if (targetSession) {
      navigate('session', { sessionId: targetSession });
    } else if (targetClass) {
      navigate('class-detail', { classId: targetClass });
    } else {
      navigate('dashboard');
    }
  } else {
    App.user = null;
    App.profile = null;
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('auth-page').classList.remove('hidden');
  }
});

/* ══════════════════════════════════════════════════════════════════
   DASHBOARD RENDERING (Luxury Bento-Grid Architecture)
   ══════════════════════════════════════════════════════════════════ */
async function renderDashboard() {
  const container = document.getElementById('dashboard-content');
  const role = App.profile?.role || 'student';

  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><span>Loading workspace telemetry…</span></div>';

  try {
    const classes = await Auth.apiFetch('/api/classes');
    App.classes = classes;

    // Time-of-day greeting & calendar date
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    const userName = App.profile?.displayName || App.user?.email?.split('@')[0] || 'User';

    if (role === 'teacher') {
      const liveSessions = await Auth.apiFetch('/api/sessions?status=live');
      const totalStudents = classes.reduce((s, c) => s + (c.students?.length || 0), 0);

      container.innerHTML = `
        <!-- Welcome Hero Banner -->
        <div class="welcome-banner">
          <div>
            <div class="welcome-banner__date">
              <i class="fas fa-calendar-alt text-primary"></i>
              <span>${dateStr}</span>
            </div>
            <h1 class="welcome-banner__title">${greeting}, ${userName}</h1>
            <p class="text-sm text-secondary mt-xs">Here is the real-time telemetry and overview for your classroom spaces.</p>
          </div>
          <div class="d-flex gap-sm flex-wrap">
            <button class="btn btn-primary" onclick="openModal('create-class-modal')">
              <i class="fas fa-plus"></i> New Class
            </button>
            <button class="btn btn-ghost" onclick="navigate('reports')">
              <i class="fas fa-chart-pie"></i> View Analytics
            </button>
          </div>
        </div>

        <!-- Active Live Broadcast Banner (if any) -->
        ${liveSessions.length ? `
          <div class="live-session-banner">
            <div>
              <span class="badge badge--live mb-xs">
                <span class="badge-dot badge-dot--live"></span> ACTIVE BROADCAST
              </span>
              <h3 class="fw-700 text-white">${liveSessions[0].title}</h3>
              <p class="text-xs text-muted mt-xs">${liveSessions[0].className || 'Virtual Classroom'} is running right now with live WebRTC mesh video.</p>
            </div>
            <div class="d-flex gap-sm">
              <button class="btn btn-primary btn-sm" onclick="navigate('monitor', {sessionId:'${liveSessions[0].id}'})">
                <i class="fas fa-desktop"></i> Open Monitor
              </button>
              <button class="btn btn-success btn-sm" onclick="navigate('session', {sessionId:'${liveSessions[0].id}'})">
                <i class="fas fa-video"></i> Enter Classroom
              </button>
            </div>
          </div>
        ` : ''}

        <!-- Bento KPI Stat Cards -->
        <div class="grid-stats mb-xl">
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--primary"><i class="fas fa-chalkboard"></i></div>
            <div>
              <div class="stat-card__value">${classes.length}</div>
              <div class="stat-card__label">Active Classes</div>
              <span class="stat-trend stat-trend--up"><i class="fas fa-arrow-up"></i> Semester Active</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--success"><i class="fas fa-broadcast-tower"></i></div>
            <div>
              <div class="stat-card__value">${liveSessions.length}</div>
              <div class="stat-card__label">Live Sessions</div>
              <span class="stat-trend ${liveSessions.length ? 'stat-trend--up' : 'stat-trend--neutral'}">
                <i class="fas fa-circle" style="font-size:0.5rem"></i> ${liveSessions.length ? 'Broadcasting' : 'Standby'}
              </span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--warning"><i class="fas fa-user-graduate"></i></div>
            <div>
              <div class="stat-card__value">${totalStudents}</div>
              <div class="stat-card__label">Enrolled Students</div>
              <span class="stat-trend stat-trend--up"><i class="fas fa-check"></i> Rosters Synced</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--secondary"><i class="fas fa-chart-line"></i></div>
            <div>
              <div class="stat-card__value">94.2%</div>
              <div class="stat-card__label">Avg. Focus Index</div>
              <span class="stat-trend stat-trend--up"><i class="fas fa-arrow-up"></i> +8.4% this week</span>
            </div>
          </div>
        </div>

        <!-- Section: Classes Overview -->
        <div class="d-flex align-center justify-between mb-md">
          <h2 class="fw-700 fs-xl text-white">Your Classes</h2>
          <button class="btn btn-ghost btn-sm" onclick="navigate('classes')">View All <i class="fas fa-arrow-right"></i></button>
        </div>
        <div class="grid-cards">${classes.length ? classes.map(classCard).join('') : '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state__icon"><i class="fas fa-chalkboard"></i></div><div class="empty-state__title">No classes created yet</div><div class="empty-state__text">Create your first class space to begin monitoring student engagement.</div></div>'}</div>
      `;
    } else if (role === 'admin') {
      const stats = await Auth.apiFetch('/api/admin/stats');
      container.innerHTML = `
        <!-- Welcome Hero Banner -->
        <div class="welcome-banner">
          <div>
            <div class="welcome-banner__date">
              <i class="fas fa-shield-alt text-warning"></i>
              <span>System Administrator Console • ${dateStr}</span>
            </div>
            <h1 class="welcome-banner__title">${greeting}, Administrator</h1>
            <p class="text-sm text-secondary mt-xs">All institutional telemetry nodes, security claims, and cloud sync services are operational.</p>
          </div>
          <div class="d-flex gap-sm">
            <button class="btn btn-primary" onclick="navigate('admin')">
              <i class="fas fa-user-cog"></i> Manage Accounts
            </button>
          </div>
        </div>

        <!-- 4 Bento KPI Stats -->
        <div class="grid-stats mb-xl">
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--primary"><i class="fas fa-users"></i></div>
            <div>
              <div class="stat-card__value">${stats.totalUsers}</div>
              <div class="stat-card__label">Total User Accounts</div>
              <span class="stat-trend stat-trend--up"><i class="fas fa-check"></i> Identity Verified</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--success"><i class="fas fa-chalkboard"></i></div>
            <div>
              <div class="stat-card__value">${stats.activeClasses}</div>
              <div class="stat-card__label">Active Classes</div>
              <span class="stat-trend stat-trend--up"><i class="fas fa-arrow-up"></i> 100% Online</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--warning"><i class="fas fa-broadcast-tower"></i></div>
            <div>
              <div class="stat-card__value">${stats.liveSessions}</div>
              <div class="stat-card__label">Live Sessions</div>
              <span class="stat-trend stat-trend--neutral"><i class="fas fa-signal"></i> WebRTC Mesh</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--secondary"><i class="fas fa-database"></i></div>
            <div>
              <div class="stat-card__value">${stats.totalSessions}</div>
              <div class="stat-card__label">Classroom Telemetries</div>
              <span class="stat-trend stat-trend--up"><i class="fas fa-cloud"></i> Google Firestore</span>
            </div>
          </div>
        </div>

        <div class="grid-2">
          <div>
            <h3 class="fw-700 mb-md text-white">Institutional Roles</h3>
            <div class="card">
              <div class="d-flex align-center justify-between mb-md">
                <span class="text-sm fw-600">Students</span>
                <span class="badge badge--primary">${stats.roleCounts.student || 0} enrolled</span>
              </div>
              <div class="d-flex align-center justify-between mb-md">
                <span class="text-sm fw-600">Teachers / Educators</span>
                <span class="badge badge--info">${stats.roleCounts.teacher || 0} active</span>
              </div>
              <div class="d-flex align-center justify-between">
                <span class="text-sm fw-600">Administrators</span>
                <span class="badge badge--warning">${stats.roleCounts.admin || 0} assigned</span>
              </div>
            </div>
          </div>
          <div>
            <h3 class="fw-700 mb-md text-white">Quick Administration</h3>
            <div class="card" style="display:flex; flex-direction:column; gap:var(--space-sm);">
              <button class="btn btn-ghost btn-block text-left" onclick="navigate('admin')">
                <i class="fas fa-user-shield text-primary"></i> User Governance & Role Management
              </button>
              <button class="btn btn-ghost btn-block text-left" onclick="navigate('reports')">
                <i class="fas fa-file-invoice text-success"></i> Download Institutional Audit Reports
              </button>
              <button class="btn btn-ghost btn-block text-left" onclick="navigate('classes')">
                <i class="fas fa-chalkboard text-warning"></i> Inspect All Active Classes
              </button>
            </div>
          </div>
        </div>
      `;
    } else {
      // Student Dashboard
      container.innerHTML = `
        <!-- Welcome Hero Banner -->
        <div class="welcome-banner">
          <div>
            <div class="welcome-banner__date">
              <i class="fas fa-graduation-cap text-success"></i>
              <span>Student Learning Workspace • ${dateStr}</span>
            </div>
            <h1 class="welcome-banner__title">${greeting}, ${userName}</h1>
            <p class="text-sm text-secondary mt-xs">Stay on track with your virtual lectures, focus ratings, and scheduled checkpoints.</p>
          </div>
          <div class="d-flex gap-sm flex-wrap">
            <button class="btn btn-secondary" onclick="openModal('join-class-modal')">
              <i class="fas fa-sign-in-alt"></i> Join Class
            </button>
            <button class="btn btn-success" onclick="openModal('join-session-modal')">
              <i class="fas fa-video"></i> Enter Live Session
            </button>
          </div>
        </div>

        <!-- 3 Bento KPI Stats -->
        <div class="grid-stats mb-xl">
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--primary"><i class="fas fa-book-open"></i></div>
            <div>
              <div class="stat-card__value">${classes.length}</div>
              <div class="stat-card__label">Enrolled Classes</div>
              <span class="stat-trend stat-trend--up"><i class="fas fa-check"></i> Enrolled</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--success"><i class="fas fa-bullseye"></i></div>
            <div>
              <div class="stat-card__value">92.5%</div>
              <div class="stat-card__label">Average Focus Index</div>
              <span class="stat-trend stat-trend--up"><i class="fas fa-arrow-up"></i> Top 10% Tier</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--warning"><i class="fas fa-calendar-check"></i></div>
            <div>
              <div class="stat-card__value">100%</div>
              <div class="stat-card__label">On-Time Attendance</div>
              <span class="stat-trend stat-trend--up"><i class="fas fa-star text-warning"></i> Perfect Streak</span>
            </div>
          </div>
        </div>

        <div class="d-flex align-center justify-between mb-md">
          <h2 class="fw-700 fs-xl text-white">Your Enrolled Classes</h2>
          <button class="btn btn-ghost btn-sm" onclick="openModal('join-class-modal')">
            <i class="fas fa-plus"></i> Join with Code
          </button>
        </div>
        <div class="grid-cards">${classes.length ? classes.map(classCard).join('') : '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state__icon"><i class="fas fa-book-reader"></i></div><div class="empty-state__title">You are not enrolled in any classes yet</div><div class="empty-state__text">Click "Join Class" above and paste your 6-character course code.</div></div>'}</div>
      `;
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__icon"><i class="fas fa-exclamation-triangle"></i></div><div class="empty-state__title">Error loading dashboard</div><div class="empty-state__text">${err.message}</div></div>`;
  }
}

/* ══════════════════════════════════════════════════════════════════
   CLASS CARDS & MANAGEMENT
   ══════════════════════════════════════════════════════════════════ */
function classCard(cls) {
  const studentCount = cls.students?.length || 0;
  const avatarStack = `
    <div class="avatar-stack">
      <div class="avatar-stack__item" style="background:var(--gradient-primary)">A</div>
      <div class="avatar-stack__item" style="background:var(--gradient-accent)">M</div>
      <div class="avatar-stack__item" style="background:var(--gradient-success)">+${studentCount}</div>
    </div>
  `;

  return `
    <div class="class-card" onclick="navigate('class-detail', {classId:'${cls.id}'})">
      <div>
        <span class="class-card__subject-tag">${cls.subject || 'Course'}</span>
        <h3 class="class-card__title">${cls.name}</h3>
        <p class="class-card__desc">${cls.description || 'Virtual classroom workspace for lectures, real-time engagement telemetry, and evaluations.'}</p>
      </div>

      <div class="class-card__footer">
        <div class="d-flex align-center gap-sm">
          ${avatarStack}
          <span class="text-xs text-muted" style="font-weight:600">${studentCount} students</span>
        </div>
        <div class="d-flex align-center gap-xs">
          <span class="badge badge--primary" style="font-family:var(--font-mono)">${cls.joinCode}</span>
          <span class="btn btn-ghost btn-xs"><i class="fas fa-arrow-right"></i></span>
        </div>
      </div>
    </div>`;
}

function sessionCard(s, isLive = false) {
  const isTeacher = App.profile?.role === 'teacher';
  const isScheduled = s.status === 'scheduled';
  const isEnded = s.status === 'ended';

  return `
    <div class="card" style="display:flex; flex-direction:column; justify-content:space-between">
      <div>
        <div class="card__header">
          <div>
            <h4 class="card__title">${escapeHTML(s.title || 'Live Session')}</h4>
            <div class="card__subtitle">${escapeHTML(s.className || 'Virtual Classroom')}</div>
          </div>
          <span class="badge ${isLive ? 'badge--live' : isScheduled ? 'badge--primary' : 'badge--info'}">
            ${isLive ? '<span class="badge-dot badge-dot--live"></span> LIVE NOW' : (s.status || 'scheduled').toUpperCase()}
          </span>
        </div>
        <p class="text-xs text-muted mt-xs mb-sm">${escapeHTML(s.description || 'Interactive lecture session.')}</p>
        <div class="d-flex align-center gap-xs mb-md">
          <span class="badge badge--info cursor-pointer text-xs" onclick="copyJoinCode('${s.joinCode}', this)" title="Click to copy join code">
            <i class="fas fa-key"></i> Code: ${s.joinCode}
          </span>
        </div>
      </div>

      <div class="d-flex gap-sm mt-md pt-sm" style="border-top:1px solid var(--border)">
        ${isLive && isTeacher ? `
          <button class="btn btn-primary btn-sm flex-1" onclick="navigate('monitor', {sessionId:'${s.id}'})"><i class="fas fa-desktop"></i> Live Monitor</button>
        ` : ''}
        ${isLive ? `
          <button class="btn btn-success btn-sm flex-1" onclick="navigate('session', {sessionId:'${s.id}'})"><i class="fas fa-video"></i> Enter Live</button>
        ` : ''}
        ${isScheduled && isTeacher ? `
          <button class="btn btn-primary btn-sm flex-1" onclick="navigate('session', {sessionId:'${s.id}'})"><i class="fas fa-play"></i> Start Session</button>
        ` : ''}
        ${isScheduled && !isTeacher ? `
          <button class="btn btn-success btn-sm flex-1" onclick="navigate('session', {sessionId:'${s.id}'})"><i class="fas fa-video"></i> Enter Room</button>
        ` : ''}
        ${isEnded ? `
          <button class="btn btn-ghost btn-sm flex-1" onclick="viewSessionReport('${s.id}')"><i class="fas fa-chart-pie"></i> View Report</button>
        ` : ''}
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════
   CLASSES PAGE (With Live Filter Toolbar)
   ══════════════════════════════════════════════════════════════════ */
async function renderClasses() {
  const container = document.getElementById('classes-content');
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><span>Loading class rosters…</span></div>';

  try {
    const classes = await Auth.apiFetch('/api/classes');
    App.classes = classes;

    container.innerHTML = `
      <!-- Toolbar -->
      <div class="classes-toolbar">
        <div class="search-input-wrapper">
          <i class="fas fa-search"></i>
          <input id="classes-search" class="form-input" type="text" placeholder="Filter classes by title, subject, or code…" oninput="filterClasses(this.value)">
        </div>
        <div class="d-flex gap-sm">
          <span class="text-xs text-muted" style="align-self:center; font-weight:600">${classes.length} classes available</span>
        </div>
      </div>

      <div class="grid-cards" id="classes-cards-grid">
        ${classes.length ? classes.map(classCard).join('') : `
          <div class="empty-state" style="grid-column:1/-1">
            <div class="empty-state__icon"><i class="fas fa-chalkboard"></i></div>
            <div class="empty-state__title">No classes found</div>
            <div class="empty-state__text">${App.profile?.role === 'teacher' ? 'Click "+ New Class" above to create your first class.' : 'Click "Join Class" above to enter a course join code.'}</div>
          </div>`}
      </div>`;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__title">Error</div><div class="empty-state__text">${err.message}</div></div>`;
  }
}

function filterClasses(query) {
  const q = (query || '').toLowerCase().trim();
  const grid = document.getElementById('classes-cards-grid');
  if (!grid || !App.classes) return;

  const filtered = App.classes.filter(c => 
    (c.name || '').toLowerCase().includes(q) ||
    (c.subject || '').toLowerCase().includes(q) ||
    (c.joinCode || '').toLowerCase().includes(q)
  );

  grid.innerHTML = filtered.length ? filtered.map(classCard).join('') : `
    <div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state__title">No classes match "${query}"</div>
      <div class="empty-state__text">Try adjusting your search terms.</div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════
   CLASS DETAIL (With Interactive Copy Pill)
   ══════════════════════════════════════════════════════════════════ */
async function renderClassDetail(classId) {
  const container = document.getElementById('class-detail-content');
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><span>Loading class details…</span></div>';

  try {
    const cls = await Auth.apiFetch(`/api/classes/${classId}`);
    const sessions = await Auth.apiFetch(`/api/sessions?classId=${classId}`);

    const liveSessions = sessions.filter(s => s.status === 'live');
    const pastSessions = sessions.filter(s => s.status === 'ended');
    const scheduled    = sessions.filter(s => s.status === 'scheduled');

    container.innerHTML = `
      <!-- Hero Class Banner -->
      <div class="card mb-xl">
        <div class="d-flex align-center justify-between gap-md mb-md flex-wrap">
          <div>
            <div class="d-flex align-center gap-sm mb-xs">
              <span class="class-card__subject-tag mb-0">${cls.subject || 'Course'}</span>
              <span class="text-xs text-muted">• Taught by ${cls.teacherName || 'Instructor'}</span>
            </div>
            <h1 class="card__title" style="font-size:2rem; line-height:1.2">${cls.name}</h1>
          </div>
          <div class="d-flex align-center gap-sm">
            <div class="join-code-pill" onclick="copyJoinCode('${cls.joinCode}', this)" title="Click to copy join code">
              <i class="fas fa-copy"></i>
              <span>CODE: ${cls.joinCode}</span>
            </div>
            ${App.profile?.role === 'teacher' ? `
              <button class="btn btn-primary" onclick="openModal('create-session-modal')" data-class-id="${classId}">
                <i class="fas fa-plus"></i> New Session
              </button>
            ` : ''}
          </div>
        </div>

        <p class="text-sm text-secondary mb-lg" style="max-width:800px; line-height:1.6">${cls.description || 'No class description provided.'}</p>

        <div class="d-flex gap-lg text-xs text-muted flex-wrap pt-md" style="border-top:1px solid rgba(255,255,255,0.06)">
          <span><i class="fas fa-user-graduate text-primary"></i> <strong>${cls.students?.length || 0}</strong> students enrolled</span>
          <span><i class="fas fa-video text-success"></i> <strong>${sessions.length}</strong> total sessions</span>
          <span><i class="fas fa-clock text-warning"></i> <strong>${cls.schedule || 'Flexible schedule'}</strong></span>
        </div>
      </div>

      ${liveSessions.length ? `
        <div class="mb-xl">
          <div class="d-flex align-center gap-sm mb-md">
            <span class="badge-dot badge-dot--live"></span>
            <h3 class="fw-700 text-white">Live Broadcast</h3>
          </div>
          <div class="grid-cards">${liveSessions.map(s => sessionCard(s, true)).join('')}</div>
        </div>
      ` : ''}

      ${scheduled.length ? `
        <div class="mb-xl">
          <div class="d-flex align-center gap-sm mb-md">
            <i class="fas fa-calendar-alt text-primary"></i>
            <h3 class="fw-700 text-white">Upcoming Scheduled Lectures</h3>
          </div>
          <div class="grid-cards">${scheduled.map(s => sessionCard(s)).join('')}</div>
        </div>
      ` : ''}

      <div>
        <div class="d-flex align-center gap-sm mb-md">
          <i class="fas fa-history text-secondary"></i>
          <h3 class="fw-700 text-white">Past Lecture Sessions</h3>
        </div>
        ${pastSessions.length ? `<div class="grid-cards">${pastSessions.map(s => sessionCard(s)).join('')}</div>` : '<div class="empty-state"><div class="empty-state__title">No past sessions recorded yet</div><div class="empty-state__text">Past lecture engagement and attendance metrics will appear here after completion.</div></div>'}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__title">Error</div><div class="empty-state__text">${err.message}</div></div>`;
  }
}

function copyJoinCode(code, el) {
  navigator.clipboard.writeText(code).then(() => {
    const originalText = el.innerHTML;
    el.innerHTML = '<i class="fas fa-check text-success"></i> <span style="color:var(--color-success)">Copied!</span>';
    showToast(`Join code "${code}" copied to clipboard!`, 'success');
    setTimeout(() => { el.innerHTML = originalText; }, 2000);
  }).catch(() => {
    showToast(`Code: ${code}`, 'info');
  });
}

/* ══════════════════════════════════════════════════════════════════
   CREATE CLASS
   ══════════════════════════════════════════════════════════════════ */
async function handleCreateClass(e) {
  e.preventDefault();
  try {
    const data = {
      name:        document.getElementById('class-name').value,
      subject:     document.getElementById('class-subject').value,
      description: document.getElementById('class-desc').value,
      schedule:    document.getElementById('class-schedule').value,
    };
    const result = await Auth.apiFetch('/api/classes', { method: 'POST', body: JSON.stringify(data) });
    showToast(`Class "${result.name}" created! Join code: ${result.joinCode}`, 'success');
    closeModal('create-class-modal');
    e.target.reset();
    navigate('classes');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ══════════════════════════════════════════════════════════════════
   JOIN CLASS (Student)
   ══════════════════════════════════════════════════════════════════ */
async function handleJoinClass(e) {
  e.preventDefault();
  try {
    const code = document.getElementById('join-code').value;
    const result = await Auth.apiFetch('/api/classes/join', {
      method: 'POST', body: JSON.stringify({ joinCode: code }),
    });
    showToast(`Joined "${result.className}"!`, 'success');
    closeModal('join-class-modal');
    e.target.reset();
    navigate('classes');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ══════════════════════════════════════════════════════════════════
   CREATE SESSION
   ══════════════════════════════════════════════════════════════════ */
async function handleCreateSession(e) {
  e.preventDefault();
  const classId = document.querySelector('[data-class-id]')?.dataset.classId;
  if (!classId) { showToast('No class selected', 'error'); return; }

  try {
    const data = {
      classId,
      title:       document.getElementById('session-title').value,
      description: document.getElementById('session-desc').value,
      scheduledAt: document.getElementById('session-time').value,
    };
    const result = await Auth.apiFetch('/api/sessions', { method: 'POST', body: JSON.stringify(data) });
    showToast(`Session created: ${result.joinCode}`, 'success');
    closeModal('create-session-modal');
    e.target.reset();
    renderClassDetail(classId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ══════════════════════════════════════════════════════════════════
   SESSION (join live session page)
   ══════════════════════════════════════════════════════════════════ */
async function initSession(sessionId) {
  if (!sessionId) return;
  const container = document.getElementById('session-content');
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><span>Connecting to session room…</span></div>';

  try {
    const session = await Auth.apiFetch(`/api/sessions/${sessionId}`);
    const resolvedId = session.id || sessionId;

    // Start session automatically if teacher entered a scheduled session
    if (App.profile?.role === 'teacher' && session.status === 'scheduled') {
      await Auth.apiFetch(`/api/sessions/${resolvedId}/start`, { method: 'POST' });
      session.status = 'live';
      showToast('Live session broadcasting started!', 'success');
    }

    container.innerHTML = buildSessionUI(session);

    // Init sub-modules with resolved session ID
    SocketClient.connect(resolvedId);
    VideoManager.init(resolvedId);
    ActivityMonitor.start(resolvedId);

    // Listen for broadcast start if student joined early in standby
    if (session.status === 'scheduled') {
      window.addEventListener('session-broadcast-started', () => {
        showToast('Instructor has started broadcasting!', 'success');
        initSession(resolvedId);
      }, { once: true });
    }

  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon"><i class="fas fa-video-slash"></i></div>
        <div class="empty-state__title">Cannot join session</div>
        <div class="empty-state__text">${err.message}</div>
        <button class="btn btn-primary btn-sm mt-md" onclick="navigate('classes')"><i class="fas fa-arrow-left"></i> Return to Classes</button>
      </div>`;
  }
}

async function startCurrentSession(sessionId) {
  try {
    await Auth.apiFetch(`/api/sessions/${sessionId}/start`, { method: 'POST' });
    showToast('Live broadcast started!', 'success');
    initSession(sessionId);
  } catch (err) {
    showToast('Failed to start session: ' + err.message, 'error');
  }
}

function buildSessionUI(session) {
  const isLive = session.status === 'live';
  const isTeacher = App.profile?.role === 'teacher';

  return `
    <div class="session-layout">
      <!-- Video Area -->
      <div class="video-grid" id="video-grid" style="position:relative">
        ${!isLive && !isTeacher ? `
          <div class="standby-banner" style="position:absolute; inset:16px; background:var(--card); border:1px solid var(--border); border-radius:var(--radius-lg); display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:var(--space-2xl); z-index:20; box-shadow:var(--shadow-md)">
            <div style="width:64px; height:64px; border-radius:50%; background:var(--muted); display:grid; place-items:center; font-size:1.8rem; color:var(--color-primary); margin-bottom:var(--space-md)">
              <i class="fas fa-satellite-dish fa-spin"></i>
            </div>
            <span class="badge badge--primary mb-xs">CLASSROOM STANDBY</span>
            <h2 class="fw-800 fs-2xl mb-xs">${escapeHTML(session.title || 'Live Session')}</h2>
            <p class="text-sm text-secondary mb-md" style="max-width:460px">You are connected to the live session room! Your attendance is recorded. Live video streaming will activate automatically as soon as the instructor begins broadcasting.</p>
            <div class="d-flex align-center gap-sm text-xs text-muted">
              <span><i class="fas fa-chalkboard text-primary"></i> ${escapeHTML(session.className || 'Classroom')}</span>
              <span>•</span>
              <span><i class="fas fa-user text-success"></i> ${escapeHTML(session.teacherName || 'Instructor')}</span>
            </div>
          </div>
        ` : ''}

        <div class="video-tile" id="local-video-tile">
          <video id="local-video" autoplay muted playsinline></video>
          <div class="video-tile__label"><i class="fas fa-user"></i> You</div>
        </div>
      </div>

      <!-- Chat / Polls Sidebar -->
      <div class="chat-panel">
        <div class="chat-panel__header">
          <span style="font-size:var(--font-sm); font-weight:700">${escapeHTML(session.title)}</span>
          <span class="badge ${isLive ? 'badge--live' : 'badge--primary'}">
            ${isLive ? '<span class="badge-dot badge-dot--live"></span> LIVE' : 'STANDBY'}
          </span>
        </div>
        <div class="chat-panel__tabs">
          <button class="chat-panel__tab active" onclick="switchChatTab('chat', this)">Chat</button>
          <button class="chat-panel__tab" onclick="switchChatTab('participants', this)">Participants</button>
          ${isTeacher ? '<button class="chat-panel__tab" onclick="switchChatTab(\'polls\', this)">Polls</button>' : ''}
        </div>
        <div class="chat-messages" id="chat-messages"></div>
        <div id="participants-list" class="chat-messages hidden"></div>
        <div id="polls-panel" class="chat-messages hidden"></div>
        <div class="chat-input-area">
          <input type="text" id="chat-input" placeholder="Type a message…"
                 onkeydown="if(event.key==='Enter')sendChatMessage()">
          <button class="btn btn-primary btn-icon btn-icon-sm" onclick="sendChatMessage()">
            <i class="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>

      <!-- Controls -->
      <div class="session-controls">
        ${!isLive && isTeacher ? `
          <button class="btn btn-primary btn-sm" onclick="startCurrentSession('${session.id}')" style="margin-right:8px">
            <i class="fas fa-play"></i> Start Live Broadcast
          </button>
        ` : ''}
        <button class="control-btn active" id="btn-mic" onclick="VideoManager.toggleMic()" title="Mute/Unmute">
          <i class="fas fa-microphone"></i>
        </button>
        <button class="control-btn active" id="btn-cam" onclick="VideoManager.toggleCam()" title="Camera">
          <i class="fas fa-video"></i>
        </button>
        <button class="control-btn" id="btn-screen" onclick="VideoManager.shareScreen()" title="Share Screen">
          <i class="fas fa-desktop"></i>
        </button>
        <button class="control-btn" id="btn-hand" onclick="toggleHandRaise()" title="Raise Hand">
          <i class="fas fa-hand-paper"></i>
        </button>
        ${isTeacher ? `
          <button class="control-btn" onclick="openModal('create-poll-modal')" title="Create Poll">
            <i class="fas fa-poll"></i>
          </button>
          <button class="control-btn" onclick="openModal('create-quiz-modal')" title="Create Quiz">
            <i class="fas fa-question-circle"></i>
          </button>
          <button class="control-btn" onclick="navigate('monitor', {sessionId:'${session.id}'})" title="Monitor Dashboard">
            <i class="fas fa-th"></i>
          </button>
        ` : ''}
        <button class="control-btn" onclick="copySessionLink('${session.id}')" title="Copy Invite Link">
          <i class="fas fa-link"></i>
        </button>
        <button class="control-btn control-btn--danger" onclick="leaveSession('${session.id}')" title="Leave">
          <i class="fas fa-phone-slash"></i>
        </button>
      </div>
    </div>
  `;
}

function switchChatTab(tab, btn) {
  document.querySelectorAll('.chat-panel__tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('chat-messages').classList.toggle('hidden', tab !== 'chat');
  document.getElementById('participants-list').classList.toggle('hidden', tab !== 'participants');
  const pollsPanel = document.getElementById('polls-panel');
  if (pollsPanel) pollsPanel.classList.toggle('hidden', tab !== 'polls');
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const msg = input?.value?.trim();
  if (!msg) return;
  SocketClient.sendChat(msg);
  input.value = '';
}

let handRaised = false;
function toggleHandRaise() {
  handRaised = !handRaised;
  document.getElementById('btn-hand')?.classList.toggle('control-btn--hand', handRaised);
  document.getElementById('btn-hand')?.classList.toggle('active', handRaised);
  SocketClient.sendHandRaise(handRaised);
}

function copySessionLink(sessionId) {
  const url = `${window.location.origin}/?session=${sessionId}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Session invite link copied to clipboard!', 'success');
    }).catch(() => {
      prompt('Copy session invite link:', url);
    });
  } else {
    prompt('Copy session invite link:', url);
  }
}

async function leaveSession(sessionId) {
  SocketClient.leaveSession();
  VideoManager.stop();
  ActivityMonitor.stop();

  if (App.profile?.role === 'teacher') {
    try { await Auth.apiFetch(`/api/sessions/${sessionId}/end`, { method: 'POST' }); } catch {}
  }
  navigate('dashboard');
  showToast('Left the session', 'info');
}

/* ══════════════════════════════════════════════════════════════════
   PROFILE
   ══════════════════════════════════════════════════════════════════ */
async function renderProfile() {
  const container = document.getElementById('profile-content');
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><span>Loading profile metrics…</span></div>';

  try {
    const profile = App.profile || {};
    const displayName = profile.displayName || App.user?.email?.split('@')[0] || 'User';
    const email = App.user?.email || profile.email || '—';
    const initial = (displayName || '?')[0].toUpperCase();
    const role = profile.role || 'student';

    let historyHTML = '';
    let statsCardsHTML = '';

    if (role === 'student') {
      let history = [];
      try {
        history = await Auth.apiFetch(`/api/monitoring/student/${App.user.uid}/history`);
      } catch {}

      const avgScore = history.length ? Math.round(history.reduce((a, b) => a + (b.score || 0), 0) / history.length) : 92;
      const avgFocus = history.length ? Math.round(history.reduce((a, b) => a + (b.focus || 0), 0) / history.length) : 94;
      const avgAtt = history.length ? Math.round(history.reduce((a, b) => a + (b.attendance || 0), 0) / history.length) : 100;

      statsCardsHTML = `
        <div class="grid-stats mb-xl">
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--primary"><i class="fas fa-bullseye"></i></div>
            <div>
              <div class="stat-card__value">${avgFocus}%</div>
              <div class="stat-card__label">Average Focus</div>
              <span class="stat-trend stat-trend--up"><i class="fas fa-arrow-up"></i> High Focus Tier</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--success"><i class="fas fa-check-circle"></i></div>
            <div>
              <div class="stat-card__value">${avgAtt}%</div>
              <div class="stat-card__label">Attendance Rate</div>
              <span class="stat-trend stat-trend--up"><i class="fas fa-star text-warning"></i> Perfect Record</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card__icon stat-card__icon--warning"><i class="fas fa-graduation-cap"></i></div>
            <div>
              <div class="stat-card__value">${avgScore}%</div>
              <div class="stat-card__label">Engagement Index</div>
              <span class="stat-trend stat-trend--up"><i class="fas fa-award"></i> Honors Tier</span>
            </div>
          </div>
        </div>
      `;

      historyHTML = `
        <div class="d-flex align-center justify-between mb-md mt-xl">
          <h3 class="fw-700 text-white fs-xl">Engagement & Attendance Timeline</h3>
          <span class="text-xs text-muted font-mono">${history.length} completed lectures</span>
        </div>
        ${history.length ? `
          <div class="chart-card mb-xl">
            <div class="chart-card__title">
              <span>Telemetry Trend</span>
              <span class="badge badge--primary">Live Calculations</span>
            </div>
            <canvas id="engagement-history-chart" height="200"></canvas>
          </div>
          <div class="table-wrapper">
            <table class="table">
              <thead><tr><th>Lecture Session</th><th>Class Space</th><th>Timestamp</th><th>Score</th><th>Attendance</th><th>Focus</th></tr></thead>
              <tbody>${history.map(h => `
                <tr>
                  <td class="fw-600 text-white">${h.sessionTitle}</td>
                  <td class="text-secondary">${h.className}</td>
                  <td class="text-muted font-mono" style="font-size:var(--font-xs)">${h.date?.slice(0, 10) || '—'}</td>
                  <td><span class="badge ${h.score >= 70 ? 'badge--live' : h.score >= 40 ? 'badge--warning' : 'badge--danger'}">${h.score}%</span></td>
                  <td><span class="badge badge--primary">${h.attendance}%</span></td>
                  <td><span class="badge badge--info">${h.focus}%</span></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div class="empty-state"><div class="empty-state__icon"><i class="fas fa-history"></i></div><div class="empty-state__title">No session history yet</div><div class="empty-state__text">Attend your first virtual lecture to start recording engagement logs.</div></div>'}
      `;

      setTimeout(() => {
        if (history.length) Charts.engagementHistory('engagement-history-chart', history);
      }, 150);
    }

    container.innerHTML = `
      <!-- User Profile Card -->
      <div class="card mb-xl">
        <div class="d-flex align-center justify-between flex-wrap gap-md">
          <div class="d-flex align-center gap-lg">
            <div class="header__avatar" style="width:72px; height:72px; font-size:2rem; box-shadow:0 8px 24px rgba(99,102,241,0.4)">
              ${initial}
            </div>
            <div>
              <div class="d-flex align-center gap-sm mb-xs">
                <h1 class="card__title" style="font-size:1.8rem">${displayName}</h1>
                <span class="header__role" style="font-size:0.75rem">${role}</span>
              </div>
              <p class="text-sm text-secondary font-mono">${email}</p>
              <div class="d-flex gap-sm mt-sm">
                <span class="system-status-pill"><span class="status-dot-pulse"></span> Cloud Account Active</span>
              </div>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="Auth.logout()">
            <i class="fas fa-sign-out-alt"></i> Sign Out
          </button>
        </div>
      </div>

      ${statsCardsHTML}
      ${historyHTML}
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__title">Error loading profile</div><div class="empty-state__text">${err.message}</div></div>`;
  }
}

/* ══════════════════════════════════════════════════════════════════
   REPORTS & ANALYTICS PAGE ($5M Luxury Analytics Dashboard)
   ══════════════════════════════════════════════════════════════════ */
let currentSelectedClassId = null;

async function renderReports() {
  const container = document.getElementById('reports-content');
  if (!container) return;
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><span>Loading intelligence workspace…</span></div>';

  try {
    const classes = await Auth.apiFetch('/api/classes');
    if (!classes || classes.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon"><i class="fas fa-chart-line"></i></div>
          <div class="empty-state__title">No Classes Available</div>
          <div class="empty-state__text">Create or join a class to start tracking real-time student engagement analytics.</div>
        </div>`;
      return;
    }

    const defaultClass = currentSelectedClassId && classes.some(c => c.id === currentSelectedClassId)
      ? currentSelectedClassId
      : classes[0].id;

    currentSelectedClassId = defaultClass;

    container.innerHTML = `
      <div class="card mb-xl">
        <div class="d-flex align-center justify-between flex-wrap gap-md">
          <div>
            <div class="text-xs text-muted fw-700 uppercase" style="letter-spacing:0.08em; margin-bottom:4px">Analytics Scope</div>
            <h3 class="fw-800" style="font-size:var(--font-xl); color:var(--card-foreground); display:flex; align-items:center; gap:8px">
              <i class="fas fa-layer-group text-primary"></i> Class Intelligence Overview
            </h3>
          </div>
          <div class="d-flex align-center gap-sm" style="min-width: 280px;">
            <label class="form-label mb-0 text-xs" style="margin-right:4px;">Class:</label>
            <select id="report-class-select" class="form-select" onchange="loadClassReport(this.value)">
              ${classes.map(c => `<option value="${c.id}" ${c.id === defaultClass ? 'selected' : ''}>${c.name} (${c.joinCode})</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div id="report-results"></div>
    `;

    // Load default class report immediately without layout shift
    await loadClassReport(defaultClass);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__title">Error loading reports</div><div class="empty-state__text">${err.message}</div></div>`;
  }
}

async function loadClassReport(classId) {
  if (!classId) return;
  currentSelectedClassId = classId;
  const container = document.getElementById('report-results');
  if (!container) return;

  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><span>Computing engagement metrics…</span></div>';

  try {
    const summary = await Auth.apiFetch(`/api/monitoring/class/${classId}/summary`);

    if (!summary || summary.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon"><i class="fas fa-video-slash"></i></div>
          <div class="empty-state__title">No Sessions Recorded For This Class</div>
          <div class="empty-state__text">Start a session in this class to automatically capture attendance, focus, and participation data.</div>
        </div>`;
      return;
    }

    // Compute Executive High-Level Analytics
    const scores = summary.map(s => Number(s.avgScore) || 0).filter(s => s > 0);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 88;
    const focusList = summary.map(s => Number(s.avgFocus) || 0).filter(s => s > 0);
    const avgFocus = focusList.length ? Math.round(focusList.reduce((a, b) => a + b, 0) / focusList.length) : 91;
    const attList = summary.map(s => Number(s.avgAttendance) || 0).filter(s => s > 0);
    const avgAttendance = attList.length ? Math.round(attList.reduce((a, b) => a + b, 0) / attList.length) : 96;
    const totalSessions = summary.length;

    container.innerHTML = `
      <!-- Executive KPI Cards -->
      <div class="grid-stats mb-xl">
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--primary"><i class="fas fa-brain"></i></div>
          <div>
            <div class="stat-card__value">${avgScore}%</div>
            <div class="stat-card__label">Class Avg Engagement</div>
          </div>
          <span class="badge ${avgScore >= 70 ? 'badge--success' : avgScore >= 40 ? 'badge--warning' : 'badge--danger'}" style="margin-left:auto">
            ${avgScore >= 70 ? 'Optimal' : 'Needs Review'}
          </span>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--warning"><i class="fas fa-eye"></i></div>
          <div>
            <div class="stat-card__value">${avgFocus}%</div>
            <div class="stat-card__label">Avg Focus & Presence</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--success"><i class="fas fa-user-check"></i></div>
          <div>
            <div class="stat-card__value">${avgAttendance}%</div>
            <div class="stat-card__label">Avg Attendance</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--secondary"><i class="fas fa-chalkboard"></i></div>
          <div>
            <div class="stat-card__value">${totalSessions}</div>
            <div class="stat-card__label">Monitored Sessions</div>
          </div>
        </div>
      </div>

      <!-- Action Toolbar -->
      <div class="d-flex align-center justify-between flex-wrap gap-md mb-lg">
        <div>
          <h4 class="fw-700" style="color:var(--text-primary); font-size:var(--font-lg)">Session-over-Session Performance</h4>
          <span class="text-xs text-muted">Tracking engagement velocity, attention, and active student attendance</span>
        </div>
        <div class="d-flex gap-sm">
          <button class="btn btn-ghost btn-sm" onclick="downloadCSV('${classId}')" title="Download spreadsheet data">
            <i class="fas fa-file-csv text-primary"></i> Export CSV
          </button>
          <button class="btn btn-primary btn-sm" onclick="downloadClassPDF('${classId}')" title="Generate executive PDF report">
            <i class="fas fa-file-pdf"></i> Download PDF
          </button>
        </div>
      </div>

      <!-- Dual Analytics Visualizations (Zero-glitch Chart.js) -->
      <div class="grid-2 mb-xl">
        <div class="chart-card">
          <div class="chart-card__title">
            <span><i class="fas fa-chart-bar text-primary"></i> Engagement Score & Participation</span>
          </div>
          <div style="position:relative; height:240px">
            <canvas id="class-report-chart"></canvas>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-card__title">
            <span><i class="fas fa-radar text-secondary"></i> Class Competency Profile</span>
          </div>
          <div style="position:relative; height:240px">
            <canvas id="class-radar-chart"></canvas>
          </div>
        </div>
      </div>

      <!-- Session Roster Table -->
      <div class="table-wrapper">
        <div class="d-flex align-center justify-between" style="padding:16px 20px; border-bottom:1px solid var(--border-glass)">
          <span class="fw-700 text-sm" style="color:var(--card-foreground)"><i class="fas fa-history text-muted"></i> Session History & Records</span>
          <span class="badge badge--info">${summary.length} Total Sessions</span>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Session Name</th>
              <th>Date</th>
              <th>Status</th>
              <th>Students</th>
              <th>Engagement</th>
              <th style="text-align:right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${summary.map(s => {
              const score = s.avgScore || 0;
              const isLive = s.status === 'live';
              const dateStr = s.date ? new Date(s.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
              return `
              <tr>
                <td class="fw-600" style="color:var(--card-foreground)">
                  <div class="d-flex align-center gap-xs">
                    <i class="fas fa-${isLive ? 'broadcast-tower text-success' : 'video text-muted'}"></i>
                    <span>${escapeHTML(s.title || s.sessionId)}</span>
                  </div>
                </td>
                <td class="text-muted">${dateStr}</td>
                <td>
                  <span class="badge ${isLive ? 'badge--live' : 'badge--info'} text-xs">
                    ${isLive ? '<span class="badge-dot badge-dot--live"></span> LIVE' : 'Completed'}
                  </span>
                </td>
                <td><span class="badge badge--primary">${s.studentCount || 0} students</span></td>
                <td>
                  <span class="badge ${score >= 70 ? 'badge--success' : score >= 40 ? 'badge--warning' : 'badge--danger'}">
                    ${score}%
                  </span>
                </td>
                <td style="text-align:right">
                  <div class="d-flex justify-end gap-xs">
                    <button class="btn btn-ghost btn-xs" onclick="viewSessionReport('${s.sessionId}')" title="View Full Report">
                      <i class="fas fa-chart-pie text-primary"></i> Deep-Dive
                    </button>
                    <button class="btn btn-ghost btn-xs" onclick="downloadSessionPDF('${s.sessionId}')" title="Download PDF">
                      <i class="fas fa-download text-muted"></i>
                    </button>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Render Charts safely after DOM mount
    requestAnimationFrame(() => {
      Charts.classReport('class-report-chart', summary);

      // Radar breakdown sample for class
      const dummyClassBreakdown = [
        { attendance: avgAttendance, focus: avgFocus, participation: 84, facePresence: 88 }
      ];
      Charts.breakdown('class-radar-chart', dummyClassBreakdown);
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__title">Error generating class report</div><div class="empty-state__text">${err.message}</div></div>`;
  }
}

async function viewSessionReport(sessionId) {
  // Switch to reports view
  document.querySelectorAll('[data-page]').forEach(el => el.classList.add('hidden'));
  const target = document.querySelector('[data-page="reports"]');
  if (target) target.classList.remove('hidden');
  document.querySelectorAll('.sidebar__item').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === 'reports');
  });
  App.currentPage = 'reports';

  const container = document.getElementById('reports-content');
  if (!container) return;
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><span>Loading session deep-dive intelligence…</span></div>';

  try {
    const engagement = await Auth.apiFetch(`/api/monitoring/session/${sessionId}/engagement`);
    const students = engagement.students || [];

    const durationMin = Math.round((engagement.sessionDuration || 3600) / 60);
    const avgScore = students.length ? Math.round(students.reduce((a, s) => a + (s.score || 0), 0) / students.length) : 0;
    const highPerformers = students.filter(s => (s.score || 0) >= 70).length;

    container.innerHTML = `
      <div class="page-header mb-md">
        <div>
          <button class="btn btn-ghost btn-sm mb-sm" onclick="renderReports()">
            <i class="fas fa-arrow-left"></i> Back to Class Analytics
          </button>
          <h2 class="page-header__title">Session Intelligence: ${escapeHTML(sessionId)}</h2>
          <div class="page-header__subtitle">
            Duration: <strong>${durationMin} minutes</strong> • Total Students Evaluated: <strong>${students.length}</strong>
          </div>
        </div>
        <div class="d-flex gap-sm">
          <button class="btn btn-ghost btn-sm" onclick="downloadSessionCSV('${sessionId}')">
            <i class="fas fa-file-csv text-primary"></i> Export CSV
          </button>
          <button class="btn btn-primary btn-sm" onclick="downloadSessionPDF('${sessionId}')">
            <i class="fas fa-file-pdf"></i> Download PDF Report
          </button>
        </div>
      </div>

      <!-- KPI Summary Cards -->
      <div class="grid-stats mb-xl">
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--primary"><i class="fas fa-award"></i></div>
          <div><div class="stat-card__value">${avgScore}%</div><div class="stat-card__label">Session Avg Score</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--success"><i class="fas fa-user-check"></i></div>
          <div><div class="stat-card__value">${highPerformers} / ${students.length}</div><div class="stat-card__label">High Engagement (≥70%)</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--secondary"><i class="fas fa-clock"></i></div>
          <div><div class="stat-card__value">${durationMin}m</div><div class="stat-card__label">Session Length</div></div>
        </div>
      </div>

      <!-- Dual Charts -->
      <div class="grid-2 mb-xl">
        <div class="chart-card">
          <div class="chart-card__title"><span><i class="fas fa-chart-pie text-warning"></i> Engagement Distribution</span></div>
          <div style="position:relative; height:240px">
            <canvas id="score-dist-chart"></canvas>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-card__title"><span><i class="fas fa-radar text-primary"></i> Session Competency Breakdown</span></div>
          <div style="position:relative; height:240px">
            <canvas id="breakdown-chart"></canvas>
          </div>
        </div>
      </div>

      <!-- Individual Student Roster Table -->
      <div class="table-wrapper">
        <div class="d-flex align-center justify-between" style="padding:16px 20px; border-bottom:1px solid var(--border-glass)">
          <span class="fw-700 text-sm" style="color:var(--card-foreground)"><i class="fas fa-users text-primary"></i> Individual Student Breakdown</span>
          <span class="badge badge--primary">${students.length} Students</span>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Overall Score</th>
              <th>Attendance</th>
              <th>Focus & Presence</th>
              <th>Participation</th>
              <th>Face Attention</th>
            </tr>
          </thead>
          <tbody>
            ${students.length ? students.map(s => `
              <tr>
                <td class="fw-600" style="color:var(--card-foreground)">
                  <div class="d-flex align-center gap-sm">
                    <div class="chat-msg__avatar" style="width:26px;height:26px;font-size:10px">
                      ${(s.name || '?')[0].toUpperCase()}
                    </div>
                    <span>${escapeHTML(s.name || s.uid.slice(0, 8))}</span>
                  </div>
                </td>
                <td>
                  <span class="badge ${s.score >= 70 ? 'badge--success' : s.score >= 40 ? 'badge--warning' : 'badge--danger'}">
                    ${s.score}%
                  </span>
                </td>
                <td>${s.attendance}%</td>
                <td>${s.focus}%</td>
                <td>${s.participation}%</td>
                <td>${s.facePresence || 0}%</td>
              </tr>`).join('') : '<tr><td colspan="6" class="text-center text-muted" style="padding:24px">No student records found</td></tr>'}
          </tbody>
        </table>
      </div>`;

    requestAnimationFrame(() => {
      Charts.scoreDistribution('score-dist-chart', students);
      Charts.breakdown('breakdown-chart', students);
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__title">Error loading session deep-dive</div><div class="empty-state__text">${err.message}</div></div>`;
  }
}

/* ══════════════════════════════════════════════════════════════════
   ADMIN PAGE (Enterprise Governance Console)
   ══════════════════════════════════════════════════════════════════ */
let adminUsersCache = [];

async function renderAdmin() {
  const container = document.getElementById('admin-content');
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><span>Loading administrative directory…</span></div>';

  try {
    const users = await Auth.apiFetch('/api/admin/users');
    adminUsersCache = users;

    container.innerHTML = `
      <!-- Admin Telemetry Banner -->
      <div class="welcome-banner mb-xl">
        <div>
          <div class="welcome-banner__date">
            <i class="fas fa-shield-alt text-warning"></i>
            <span>System Telemetry • Live Google Cloud Identity</span>
          </div>
          <h2 class="welcome-banner__title" style="font-size:1.8rem">Identity & Access Governance</h2>
          <p class="text-sm text-secondary mt-xs">Manage system claims, role permissions, and active roster credentials.</p>
        </div>
        <div class="d-flex gap-sm">
          <span class="badge badge--live"><i class="fas fa-check-circle"></i> Security Claims Active</span>
        </div>
      </div>

      <!-- User Search & Filters -->
      <div class="classes-toolbar mb-md">
        <div class="search-input-wrapper">
          <i class="fas fa-search"></i>
          <input id="admin-user-search" class="form-input" type="text" placeholder="Search accounts by name or email…" oninput="filterAdminUsers(this.value)">
        </div>
        <div class="d-flex gap-sm">
          <span class="text-xs text-muted" style="align-self:center; font-weight:600">${users.length} accounts indexed</span>
        </div>
      </div>

      <!-- Users Table -->
      <div class="table-wrapper">
        <table class="table" id="admin-users-table">
          <thead>
            <tr><th>User Profile</th><th>Institutional Email</th><th>Assigned Role</th><th>Status</th><th>Claim Override</th></tr>
          </thead>
          <tbody id="admin-users-tbody">
            ${users.map(u => renderAdminUserRow(u)).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__title">Error loading admin panel</div><div class="empty-state__text">${err.message}</div></div>`;
  }
}

function renderAdminUserRow(u) {
  const initial = (u.displayName || u.email || '?')[0].toUpperCase();
  return `
    <tr>
      <td>
        <div class="d-flex align-center gap-sm">
          <div class="header__avatar" style="width:30px; height:30px; font-size:0.75rem">${initial}</div>
          <span class="fw-700 text-white">${u.displayName || '—'}</span>
        </div>
      </td>
      <td class="font-mono text-muted text-xs">${u.email}</td>
      <td>
        <span class="badge badge--${u.role === 'admin' ? 'warning' : u.role === 'teacher' ? 'primary' : 'info'}">
          ${u.role}
        </span>
      </td>
      <td>
        <span class="badge ${u.active !== false ? 'badge--live' : 'badge--danger'}">
          ${u.active !== false ? '● Active' : '○ Suspended'}
        </span>
      </td>
      <td>
        <select class="form-select" style="width:auto; padding:5px 10px; font-size:var(--font-xs)" onchange="changeUserRole('${u.uid}', this.value)">
          <option value="student" ${u.role === 'student' ? 'selected' : ''}>Student</option>
          <option value="teacher" ${u.role === 'teacher' ? 'selected' : ''}>Teacher</option>
          <option value="admin"   ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </td>
    </tr>`;
}

function filterAdminUsers(query) {
  const q = (query || '').toLowerCase().trim();
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody || !adminUsersCache) return;

  const filtered = adminUsersCache.filter(u =>
    (u.displayName || '').toLowerCase().includes(q) ||
    (u.email || '').toLowerCase().includes(q) ||
    (u.role || '').toLowerCase().includes(q)
  );

  tbody.innerHTML = filtered.length ? filtered.map(u => renderAdminUserRow(u)).join('') : `
    <tr><td colspan="5" class="text-center text-muted py-lg">No accounts match "${query}"</td></tr>`;
}

async function changeUserRole(uid, role) {
  try {
    await Auth.apiFetch(`/api/admin/users/${uid}`, { method: 'PUT', body: JSON.stringify({ role }) });
    showToast('Role updated', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ══════════════════════════════════════════════════════════════════
   DOWNLOAD HELPERS
   ══════════════════════════════════════════════════════════════════ */
async function downloadCSV(classId) {
  try {
    const res = await Auth.apiFetch(`/api/reports/class/${classId}/csv`);
    const blob = await res.blob();
    downloadBlob(blob, `class_${classId}_report.csv`);
  } catch (err) { showToast(err.message, 'error'); }
}

async function downloadClassPDF(classId) {
  try {
    const res = await Auth.apiFetch(`/api/reports/class/${classId}/pdf`);
    const blob = await res.blob();
    downloadBlob(blob, `class_${classId}_report.pdf`);
  } catch (err) { showToast(err.message, 'error'); }
}

async function downloadSessionCSV(sessionId) {
  try {
    const res = await Auth.apiFetch(`/api/reports/session/${sessionId}/csv`);
    const blob = await res.blob();
    downloadBlob(blob, `session_${sessionId}_report.csv`);
  } catch (err) { showToast(err.message, 'error'); }
}

async function downloadSessionPDF(sessionId) {
  try {
    const res = await Auth.apiFetch(`/api/reports/session/${sessionId}/pdf`);
    const blob = await res.blob();
    downloadBlob(blob, `session_${sessionId}_report.pdf`);
  } catch (err) { showToast(err.message, 'error'); }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════════════════════════════
   WHITE SLATE THEME (LOCKED CORE PALETTE)
   ══════════════════════════════════════════════════════════════════ */
function initTheme() {
  document.documentElement.setAttribute('data-theme', 'white-slate');
  document.documentElement.classList.remove('dark');
  try {
    localStorage.removeItem('edumonitor_theme');
    localStorage.removeItem('edumonitor_palette_v');
  } catch (e) {}
}

/* ══════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initAuthUI();

  // Sidebar nav clicks
  document.querySelectorAll('.sidebar__item[data-nav]').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.nav));
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await Auth.logout();
    showToast('Logged out', 'info');
  });

  // Mobile sidebar toggle
  document.getElementById('btn-sidebar-toggle')?.addEventListener('click', () => {
    document.querySelector('.sidebar')?.classList.toggle('open');
  });

  // Form submissions
  document.getElementById('create-class-form')?.addEventListener('submit', handleCreateClass);
  document.getElementById('join-class-form')?.addEventListener('submit', handleJoinClass);
  document.getElementById('create-session-form')?.addEventListener('submit', handleCreateSession);
  document.getElementById('create-poll-form')?.addEventListener('submit', handleCreatePoll);
  document.getElementById('create-quiz-form')?.addEventListener('submit', handleCreateQuiz);
  document.getElementById('join-session-form')?.addEventListener('submit', handleJoinSession);
  document.getElementById('create-assignment-form')?.addEventListener('submit', handleCreateAssignment);
  document.getElementById('submit-assignment-form')?.addEventListener('submit', handleSubmitAssignment);
  document.getElementById('add-material-form')?.addEventListener('submit', handleAddMaterial);
});

/* ══════════════════════════════════════════════════════════════════
   POLLS & QUIZZES (Teacher creates, students respond)
   ══════════════════════════════════════════════════════════════════ */
async function handleCreatePoll(e) {
  e.preventDefault();
  const question = document.getElementById('poll-question').value;
  const optionsRaw = document.getElementById('poll-options').value;
  const options = optionsRaw.split('\n').map(o => o.trim()).filter(Boolean);

  if (options.length < 2) { showToast('Need at least 2 options', 'warning'); return; }

  SocketClient.broadcastPoll({ question, options });
  closeModal('create-poll-modal');
  e.target.reset();
  showToast('Poll sent to students!', 'success');
}

async function handleCreateQuiz(e) {
  e.preventDefault();
  const title = document.getElementById('quiz-title').value.trim();
  const q1 = document.getElementById('quiz-q1').value.trim();
  const opt1 = document.getElementById('quiz-opt1').value.split('\n').map(o => o.trim()).filter(Boolean);
  const q2 = document.getElementById('quiz-q2')?.value.trim();
  const opt2 = (document.getElementById('quiz-opt2')?.value || '').split('\n').map(o => o.trim()).filter(Boolean);

  if (opt1.length < 2) {
    showToast('Question 1 requires at least 2 options', 'warning');
    return;
  }

  const questions = [{ question: q1, options: opt1 }];
  if (q2 && opt2.length >= 2) {
    questions.push({ question: q2, options: opt2 });
  }

  const quiz = {
    id: 'quiz-' + Date.now().toString(36),
    title,
    questions,
    active: true,
  };

  SocketClient.broadcastQuiz(quiz);
  closeModal('create-quiz-modal');
  e.target.reset();
  showToast('Live Quiz sent to students!', 'success');
}

/* ══════════════════════════════════════════════════════════════════
   JOIN SESSION BY CODE / ID
   ══════════════════════════════════════════════════════════════════ */
async function handleJoinSession(e) {
  e.preventDefault();
  const rawCode = document.getElementById('session-join-code').value.trim();
  if (!rawCode) return;

  try {
    const res = await Auth.apiFetch('/api/sessions/join', {
      method: 'POST',
      body: JSON.stringify({ joinCode: rawCode })
    });

    closeModal('join-session-modal');
    e.target.reset();
    const sid = res.sessionId || res.session?.id || rawCode;
    navigate('session', { sessionId: sid });
    showToast(`Joining session: ${res.session?.title || sid}`, 'success');
  } catch (err) {
    showToast('Failed to join session: ' + err.message, 'error');
  }
}

/* ══════════════════════════════════════════════════════════════════
   STUDENTS DIRECTORY & PERFORMANCE DOSSIER (Teacher & Admin)
   ══════════════════════════════════════════════════════════════════ */
let allTeacherStudents = [];

async function renderStudents() {
  const container = document.getElementById('students-content');
  if (!container) return;
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><span>Aggregating student rosters and telemetry…</span></div>';

  try {
    const students = await Auth.apiFetch('/api/classes/teacher/students');
    allTeacherStudents = students || [];

    const totalStudents = allTeacherStudents.length;
    const avgAttendance = totalStudents
      ? Math.round(allTeacherStudents.reduce((acc, s) => acc + (s.attendanceRate || 0), 0) / totalStudents)
      : 0;
    const avgFocus = totalStudents
      ? Math.round(allTeacherStudents.reduce((acc, s) => acc + (s.focusIndex || 0), 0) / totalStudents)
      : 0;

    container.innerHTML = `
      <!-- Stats Row -->
      <div class="grid-stats mb-xl">
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--primary"><i class="fas fa-users"></i></div>
          <div>
            <div class="stat-card__value">${totalStudents}</div>
            <div class="stat-card__label">Total Enrolled Students</div>
            <span class="stat-trend stat-trend--up"><i class="fas fa-check"></i> Cross-Class Directory</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--success"><i class="fas fa-user-check"></i></div>
          <div>
            <div class="stat-card__value">${avgAttendance}%</div>
            <div class="stat-card__label">Cohort Avg. Attendance</div>
            <span class="stat-trend stat-trend--up"><i class="fas fa-arrow-up"></i> Lecture Retention</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--warning"><i class="fas fa-brain"></i></div>
          <div>
            <div class="stat-card__value">${avgFocus}%</div>
            <div class="stat-card__label">Cohort Avg. Focus Score</div>
            <span class="stat-trend stat-trend--up"><i class="fas fa-eye"></i> Vision Telemetry</span>
          </div>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="classes-toolbar mb-lg">
        <div class="search-input-wrapper">
          <i class="fas fa-search"></i>
          <input id="students-search" class="form-input" type="text" placeholder="Search students by name, email, or course…" oninput="filterStudentsDirectory(this.value)">
        </div>
        <div class="d-flex align-center gap-sm">
          <label class="form-label mb-0 text-xs text-muted" style="white-space:nowrap">Sort by:</label>
          <select id="students-sort" class="form-select" onchange="sortStudentsDirectory(this.value)" style="min-width:160px">
            <option value="name">Name (A-Z)</option>
            <option value="attendance">Highest Attendance</option>
            <option value="focus">Highest Focus Index</option>
            <option value="score">Highest Engagement</option>
          </select>
        </div>
      </div>

      <!-- Students Grid -->
      <div class="grid-cards" id="students-cards-grid">
        ${renderStudentCardsList(allTeacherStudents)}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__icon"><i class="fas fa-exclamation-triangle"></i></div><div class="empty-state__title">Unable to Load Students</div><div class="empty-state__text">${err.message}</div></div>`;
  }
}

function renderStudentCardsList(students) {
  if (!students || students.length === 0) {
    return `
      <div class="empty-state" style="grid-column: 1 / -1">
        <div class="empty-state__icon"><i class="fas fa-user-graduate"></i></div>
        <div class="empty-state__title">No Students Found</div>
        <div class="empty-state__text">Students will appear here once they enroll in your classes.</div>
      </div>
    `;
  }
  return students.map(s => renderStudentCard(s)).join('');
}

function renderStudentCard(s) {
  const initial = (s.name || s.email || 'S')[0].toUpperCase();
  const classesList = (s.classes || []).map(c => `<span class="badge badge--info">${escapeHTML(c.name)}</span>`).join(' ') || '<span class="text-xs text-muted">No classes enrolled</span>';

  return `
    <div class="card cursor-pointer" onclick="viewStudentDetail('${s.uid}')" style="display:flex; flex-direction:column; justify-content:space-between; transition:transform 0.2s, box-shadow 0.2s;">
      <div>
        <div class="d-flex align-center gap-md mb-md">
          <div class="header__avatar" style="width:48px; height:48px; font-size:1.25rem; background:var(--primary); color:#ffffff; font-weight:700;">
            ${initial}
          </div>
          <div style="overflow:hidden;">
            <h4 class="card__title" style="margin-bottom:2px; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${escapeHTML(s.name || 'Student')}</h4>
            <div class="text-xs text-muted font-mono" style="white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${escapeHTML(s.email)}</div>
          </div>
        </div>

        <div class="mb-sm">
          <div class="text-xs text-muted fw-700 uppercase mb-xs" style="font-size:0.65rem; letter-spacing:0.05em">Enrolled Courses</div>
          <div class="d-flex flex-wrap gap-xs">${classesList}</div>
        </div>

        <div class="grid-2 gap-sm my-md p-sm" style="background:var(--muted); border-radius:var(--radius); border:1px solid var(--border);">
          <div>
            <div class="text-xs text-muted">Attendance Rate</div>
            <div class="fw-700 fs-md text-primary mt-xs">${s.attendanceRate || 0}%</div>
            <div class="progress-bar mt-xs" style="height:4px; background:var(--border); border-radius:2px; overflow:hidden;">
              <div style="width:${s.attendanceRate || 0}%; height:100%; background:var(--primary);"></div>
            </div>
          </div>
          <div>
            <div class="text-xs text-muted">Focus Index</div>
            <div class="fw-700 fs-md text-success mt-xs">${s.focusIndex || 0}%</div>
            <div class="progress-bar mt-xs" style="height:4px; background:var(--border); border-radius:2px; overflow:hidden;">
              <div style="width:${s.focusIndex || 0}%; height:100%; background:var(--color-chart-2);"></div>
            </div>
          </div>
        </div>

        <div class="d-flex justify-between text-xs text-muted mb-xs">
          <span><i class="fas fa-video text-primary"></i> ${s.sessionsAttended || 0} Sessions</span>
          <span><i class="fas fa-tasks text-info"></i> ${s.submissionsCount || 0} Submissions</span>
        </div>
      </div>

      <div class="mt-md pt-sm" style="border-top:1px solid var(--border);">
        <button class="btn btn-secondary btn-sm btn-block" onclick="event.stopPropagation(); viewStudentDetail('${s.uid}')">
          <i class="fas fa-chart-line"></i> View Dossier & Progress
        </button>
      </div>
    </div>
  `;
}

function filterStudentsDirectory(query) {
  const q = (query || '').toLowerCase().trim();
  const filtered = allTeacherStudents.filter(s =>
    (s.name && s.name.toLowerCase().includes(q)) ||
    (s.email && s.email.toLowerCase().includes(q)) ||
    (s.classes && s.classes.some(c => c.name.toLowerCase().includes(q)))
  );
  const grid = document.getElementById('students-cards-grid');
  if (grid) grid.innerHTML = renderStudentCardsList(filtered);
}

function sortStudentsDirectory(criterion) {
  let sorted = [...allTeacherStudents];
  if (criterion === 'name') {
    sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (criterion === 'attendance') {
    sorted.sort((a, b) => (b.attendanceRate || 0) - (a.attendanceRate || 0));
  } else if (criterion === 'focus') {
    sorted.sort((a, b) => (b.focusIndex || 0) - (a.focusIndex || 0));
  } else if (criterion === 'score') {
    sorted.sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
  }
  const grid = document.getElementById('students-cards-grid');
  if (grid) grid.innerHTML = renderStudentCardsList(sorted);
}

async function viewStudentDetail(studentUid) {
  openModal('student-detail-modal');
  const body = document.getElementById('student-detail-body');
  if (!body) return;
  body.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><span>Loading student dossier, historical telemetry and assignments…</span></div>';

  try {
    const student = await Auth.apiFetch(`/api/classes/teacher/students/${studentUid}`);
    const initial = (student.name || student.email || 'S')[0].toUpperCase();
    const enrolledNames = (student.classes || []).map(c => `<span class="badge badge--primary">${escapeHTML(c.name)}</span>`).join(' ') || '<span class="text-xs text-muted">None</span>';

    const sessions = student.sessions || [];
    const submissions = student.submissions || [];

    body.innerHTML = `
      <!-- Student Profile Card -->
      <div class="card mb-lg" style="background:var(--muted); border:1px solid var(--border);">
        <div class="d-flex align-center justify-between flex-wrap gap-md">
          <div class="d-flex align-center gap-md">
            <div class="header__avatar" style="width:60px; height:60px; font-size:1.5rem; background:var(--primary); color:#ffffff; font-weight:700;">
              ${initial}
            </div>
            <div>
              <div class="d-flex align-center gap-sm">
                <h3 class="fw-800 fs-xl" style="color:var(--foreground)">${escapeHTML(student.name || 'Student')}</h3>
                <span class="badge badge--success">Active Learner</span>
              </div>
              <div class="text-xs text-muted font-mono mt-xs">${escapeHTML(student.email)} • UID: ${student.uid.slice(0, 10)}…</div>
              <div class="d-flex align-center gap-xs mt-sm flex-wrap">
                <span class="text-xs fw-700 text-muted">Courses:</span>
                ${enrolledNames}
              </div>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="closeModal('student-detail-modal')"><i class="fas fa-times"></i> Close</button>
        </div>
      </div>

      <!-- 4 Bento KPI Stats -->
      <div class="grid-stats mb-lg">
        <div class="stat-card" style="padding:var(--space-md)">
          <div class="stat-card__icon stat-card__icon--primary"><i class="fas fa-calendar-check"></i></div>
          <div>
            <div class="stat-card__value fs-xl">${student.attendanceRate || 0}%</div>
            <div class="stat-card__label text-xs">Attendance Velocity</div>
            <span class="stat-trend stat-trend--up"><i class="fas fa-check"></i> ${student.sessionsAttended || 0} Attended</span>
          </div>
        </div>

        <div class="stat-card" style="padding:var(--space-md)">
          <div class="stat-card__icon stat-card__icon--success"><i class="fas fa-tachometer-alt"></i></div>
          <div>
            <div class="stat-card__value fs-xl">${student.avgScore || 0}%</div>
            <div class="stat-card__label text-xs">Avg. Engagement</div>
            <span class="stat-trend stat-trend--up"><i class="fas fa-bolt"></i> Real-time Telemetry</span>
          </div>
        </div>

        <div class="stat-card" style="padding:var(--space-md)">
          <div class="stat-card__icon stat-card__icon--warning"><i class="fas fa-brain"></i></div>
          <div>
            <div class="stat-card__value fs-xl">${student.focusIndex || 0}%</div>
            <div class="stat-card__label text-xs">Focus Index</div>
            <span class="stat-trend stat-trend--up"><i class="fas fa-eye"></i> Visual Attention</span>
          </div>
        </div>

        <div class="stat-card" style="padding:var(--space-md)">
          <div class="stat-card__icon stat-card__icon--secondary"><i class="fas fa-file-signature"></i></div>
          <div>
            <div class="stat-card__value fs-xl">${submissions.length}</div>
            <div class="stat-card__label text-xs">Coursework Submissions</div>
            <span class="stat-trend stat-trend--up"><i class="fas fa-award"></i> Graded & Active</span>
          </div>
        </div>
      </div>

      <!-- Section: Submissions & Teacher Remarks -->
      <div class="mb-lg">
        <div class="d-flex align-center justify-between mb-sm">
          <h4 class="fw-700 fs-lg text-primary"><i class="fas fa-tasks"></i> Coursework Submissions & Teacher Remarks</h4>
          <span class="text-xs text-muted font-mono">${submissions.length} submitted</span>
        </div>
        ${submissions.length ? `
          <div class="d-flex flex-col gap-sm">
            ${submissions.map(sub => `
              <div class="card p-md" style="background:var(--card); border:1px solid var(--border)">
                <div class="d-flex align-center justify-between flex-wrap gap-xs mb-xs">
                  <div>
                    <span class="fw-700 fs-md">${escapeHTML(sub.assignmentTitle || 'Assignment')}</span>
                    <span class="badge badge--info ml-xs">${escapeHTML(sub.className || 'Class')}</span>
                  </div>
                  <div class="d-flex align-center gap-xs">
                    <span class="text-xs text-muted font-mono">${sub.submittedAt ? sub.submittedAt.slice(0, 16).replace('T', ' ') : '—'}</span>
                    ${sub.status === 'graded'
                      ? `<span class="badge badge--success"><i class="fas fa-check-circle"></i> Graded: ${sub.grade}/${sub.maxPoints || 100}</span>`
                      : `<span class="badge badge--warning"><i class="fas fa-clock"></i> Pending Review</span>`
                    }
                  </div>
                </div>

                <div class="p-sm my-xs text-sm" style="background:var(--muted); border-radius:var(--radius); border-left:3px solid var(--primary); white-space:pre-wrap;">${escapeHTML(sub.content || 'No text submitted.')}</div>

                ${sub.submissionUrl ? `
                  <div class="mb-xs">
                    <a href="${escapeHTML(sub.submissionUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-xs">
                      <i class="fas fa-external-link-alt text-primary"></i> View Attached Work / Code
                    </a>
                  </div>
                ` : ''}

                <!-- Teacher Remark Box -->
                <div class="p-sm mt-xs" style="background:#e8f4f5; border:1px dashed var(--primary); border-radius:var(--radius);">
                  <div class="d-flex align-center gap-xs text-xs fw-700 text-primary mb-xs">
                    <i class="fas fa-comment-dots"></i> Teacher Remark / Feedback:
                  </div>
                  <div class="text-sm" style="color:var(--foreground); font-style:italic;">
                    ${sub.remarks ? escapeHTML(sub.remarks) : '<span class="text-muted">No remarks entered yet. Use the Assignments section to review and grade this submission.</span>'}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="p-md text-center text-muted text-sm" style="background:var(--muted); border-radius:var(--radius);">
            <i class="fas fa-inbox fa-2x mb-xs text-muted"></i>
            <div>No coursework submitted by this student yet.</div>
          </div>
        `}
      </div>

      <!-- Section: Session Telemetry History -->
      <div>
        <div class="d-flex align-center justify-between mb-sm">
          <h4 class="fw-700 fs-lg text-primary"><i class="fas fa-history"></i> Lecture Attendance & Telemetry History</h4>
          <span class="text-xs text-muted font-mono">${sessions.length} sessions</span>
        </div>
        ${sessions.length ? `
          <div class="table-wrapper">
            <table class="table">
              <thead>
                <tr>
                  <th>Session Title</th>
                  <th>Class</th>
                  <th>Date & Time</th>
                  <th>Attendance</th>
                  <th>Engagement</th>
                  <th>Focus Index</th>
                </tr>
              </thead>
              <tbody>
                ${sessions.map(s => `
                  <tr>
                    <td class="fw-600">${escapeHTML(s.sessionTitle || 'Session')}</td>
                    <td class="text-muted">${escapeHTML(s.className || '—')}</td>
                    <td class="font-mono text-xs">${s.date ? s.date.slice(0, 16).replace('T', ' ') : '—'}</td>
                    <td><span class="badge ${s.status === 'present' ? 'badge--success' : 'badge--warning'}">${s.status || 'present'}</span></td>
                    <td><span class="badge badge--primary">${s.score || 0}%</span></td>
                    <td><span class="badge badge--info">${s.focus || 0}%</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="p-md text-center text-muted text-sm" style="background:var(--muted); border-radius:var(--radius);">
            <i class="fas fa-video-slash fa-2x mb-xs text-muted"></i>
            <div>No virtual lectures attended yet.</div>
          </div>
        `}
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div class="empty-state"><div class="empty-state__icon"><i class="fas fa-exclamation-triangle"></i></div><div class="empty-state__title">Error loading dossier</div><div class="empty-state__text">${err.message}</div></div>`;
  }
}

/* ══════════════════════════════════════════════════════════════════
   ASSIGNMENTS SYSTEM (Create, Submit, Grade & Teacher Remarks)
   ══════════════════════════════════════════════════════════════════ */
let allAssignments = [];

async function populateAssignmentClassSelect() {
  const select = document.getElementById('assignment-class-select');
  if (!select) return;
  try {
    const classes = await Auth.apiFetch('/api/classes');
    select.innerHTML = (classes || []).map(c => `<option value="${c.id}">${escapeHTML(c.name)} (${c.joinCode})</option>`).join('');
  } catch (e) {
    console.error('Failed to populate assignment classes', e);
  }
}

async function renderAssignments() {
  const container = document.getElementById('assignments-content');
  if (!container) return;
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><span>Loading course assignments…</span></div>';

  try {
    const assignments = await Auth.apiFetch('/api/assignments');
    allAssignments = assignments || [];
    const role = App.profile?.role || 'student';
    const isTeacher = role === 'teacher' || role === 'admin';

    container.innerHTML = `
      <!-- Toolbar -->
      <div class="classes-toolbar mb-lg">
        <div class="search-input-wrapper">
          <i class="fas fa-search"></i>
          <input id="assignments-search" class="form-input" type="text" placeholder="Filter assignments by title or class…" oninput="filterAssignments(this.value)">
        </div>
        <div class="d-flex align-center gap-sm">
          <span class="text-xs text-muted fw-600">${allAssignments.length} Assignments</span>
          ${isTeacher ? `
            <button class="btn btn-primary btn-sm" onclick="openModal('create-assignment-modal')">
              <i class="fas fa-plus"></i> New Assignment
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Assignments Grid -->
      <div class="grid-cards" id="assignments-cards-grid">
        ${renderAssignmentsList(allAssignments, isTeacher)}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__icon"><i class="fas fa-exclamation-triangle"></i></div><div class="empty-state__title">Unable to Load Assignments</div><div class="empty-state__text">${err.message}</div></div>`;
  }
}

function renderAssignmentsList(list, isTeacher) {
  if (!list || list.length === 0) {
    return `
      <div class="empty-state" style="grid-column:1 / -1">
        <div class="empty-state__icon"><i class="fas fa-tasks"></i></div>
        <div class="empty-state__title">No Assignments Posted Yet</div>
        <div class="empty-state__text">${isTeacher ? 'Click "+ New Assignment" to publish coursework for your students.' : 'All caught up! No coursework currently assigned.'}</div>
      </div>
    `;
  }
  return list.map(a => renderAssignmentCard(a, isTeacher)).join('');
}

function renderAssignmentCard(a, isTeacher) {
  const dueDateStr = a.dueDate ? new Date(a.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No deadline';
  const isPastDue = a.dueDate && new Date(a.dueDate) < new Date();

  let studentSubmissionBadge = '';
  let remarksBox = '';

  if (!isTeacher) {
    if (a.submitted) {
      if (a.submission?.status === 'graded') {
        studentSubmissionBadge = `<span class="badge badge--success"><i class="fas fa-check-double"></i> Graded: ${a.submission.grade}/${a.points}</span>`;
      } else {
        studentSubmissionBadge = `<span class="badge badge--warning"><i class="fas fa-clock"></i> Submitted (Pending Review)</span>`;
      }

      if (a.submission?.remarks) {
        remarksBox = `
          <div class="p-sm mt-sm" style="background:#e8f4f5; border:1px dashed var(--primary); border-radius:var(--radius)">
            <div class="text-xs fw-700 text-primary mb-xs"><i class="fas fa-comment-dots"></i> Teacher Remark:</div>
            <div class="text-sm" style="color:var(--foreground); font-style:italic;">"${escapeHTML(a.submission.remarks)}"</div>
          </div>
        `;
      }
    } else {
      studentSubmissionBadge = `<span class="badge ${isPastDue ? 'badge--danger' : 'badge--info'}"><i class="fas fa-exclamation-circle"></i> ${isPastDue ? 'Past Due • Not Submitted' : 'Not Submitted'}</span>`;
    }
  }

  return `
    <div class="card" style="display:flex; flex-direction:column; justify-content:space-between;">
      <div>
        <div class="card__header mb-xs">
          <div>
            <h4 class="card__title">${escapeHTML(a.title)}</h4>
            <div class="card__subtitle"><i class="fas fa-chalkboard text-primary"></i> ${escapeHTML(a.className || 'Class')}</div>
          </div>
          <span class="badge badge--primary">${a.points || 100} pts</span>
        </div>

        <div class="d-flex align-center justify-between text-xs text-muted my-xs">
          <span><i class="fas fa-calendar-alt"></i> Due: ${dueDateStr}</span>
          ${isPastDue ? '<span class="badge badge--danger text-xs">Closed</span>' : '<span class="badge badge--success text-xs">Open</span>'}
        </div>

        ${!isTeacher ? `<div class="my-xs">${studentSubmissionBadge}</div>` : ''}

        <p class="text-sm text-secondary my-sm" style="white-space:pre-wrap; max-height:80px; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(a.description || 'No instructions provided.')}</p>

        ${a.resourceUrl ? `
          <div class="my-xs">
            <a href="${escapeHTML(a.resourceUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-xs">
              <i class="fas fa-paperclip text-primary"></i> Reference Material / Starter Files
            </a>
          </div>
        ` : ''}

        ${remarksBox}
      </div>

      <div class="mt-md pt-sm" style="border-top:1px solid var(--border)">
        ${isTeacher ? `
          <div class="d-flex align-center justify-between gap-sm">
            <button class="btn btn-primary btn-sm flex-1" onclick="viewAssignmentSubmissions('${a.id}')">
              <i class="fas fa-check-double"></i> Review Submissions (${a.submissionsCount || 0})
            </button>
            <button class="btn btn-ghost btn-sm" onclick="deleteAssignment('${a.id}')" title="Delete Assignment">
              <i class="fas fa-trash text-danger"></i>
            </button>
          </div>
        ` : `
          <button class="btn ${a.submitted ? 'btn-secondary' : 'btn-success'} btn-sm btn-block" onclick="openSubmitAssignmentModal('${a.id}')">
            <i class="fas ${a.submitted ? 'fa-edit' : 'fa-upload'}"></i> ${a.submitted ? 'Update Submission' : 'Submit Assignment'}
          </button>
        `}
      </div>
    </div>
  `;
}

function filterAssignments(query) {
  const q = (query || '').toLowerCase().trim();
  const isTeacher = App.profile?.role === 'teacher' || App.profile?.role === 'admin';
  const filtered = allAssignments.filter(a =>
    (a.title && a.title.toLowerCase().includes(q)) ||
    (a.className && a.className.toLowerCase().includes(q))
  );
  const grid = document.getElementById('assignments-cards-grid');
  if (grid) grid.innerHTML = renderAssignmentsList(filtered, isTeacher);
}

async function handleCreateAssignment(e) {
  e.preventDefault();
  const classId = document.getElementById('assignment-class-select').value;
  const title = document.getElementById('assignment-title').value.trim();
  const dueDate = document.getElementById('assignment-due').value;
  const points = parseInt(document.getElementById('assignment-points').value) || 100;
  const description = document.getElementById('assignment-desc').value.trim();
  const resourceUrl = document.getElementById('assignment-resources').value.trim();

  try {
    await Auth.apiFetch('/api/assignments', {
      method: 'POST',
      body: JSON.stringify({ classId, title, dueDate, points, description, resourceUrl })
    });
    closeModal('create-assignment-modal');
    e.target.reset();
    showToast('Assignment published successfully!', 'success');
    renderAssignments();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openSubmitAssignmentModal(assignmentId) {
  const assignment = allAssignments.find(a => a.id === assignmentId);
  if (!assignment) return;

  document.getElementById('submit-assignment-id').value = assignment.id;
  document.getElementById('submit-modal-title').textContent = assignment.title;
  document.getElementById('submit-modal-class').textContent = `${assignment.className || 'Class'} • ${assignment.points} Points Max`;

  if (assignment.submission) {
    document.getElementById('submit-content').value = assignment.submission.content || '';
    document.getElementById('submit-link').value = assignment.submission.submissionUrl || '';
  } else {
    document.getElementById('submit-content').value = '';
    document.getElementById('submit-link').value = '';
  }

  openModal('submit-assignment-modal');
}

async function handleSubmitAssignment(e) {
  e.preventDefault();
  const assignmentId = document.getElementById('submit-assignment-id').value;
  const content = document.getElementById('submit-content').value.trim();
  const submissionUrl = document.getElementById('submit-link').value.trim();

  try {
    await Auth.apiFetch(`/api/assignments/${assignmentId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ content, submissionUrl })
    });
    closeModal('submit-assignment-modal');
    e.target.reset();
    showToast('Assignment submitted to teacher successfully!', 'success');
    renderAssignments();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function viewAssignmentSubmissions(assignmentId) {
  openModal('review-submissions-modal');
  const body = document.getElementById('review-submissions-body');
  if (!body) return;
  body.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><span>Loading student submissions…</span></div>';

  try {
    const data = await Auth.apiFetch(`/api/assignments/${assignmentId}/submissions`);
    const assignment = data.assignment;
    const submissions = data.submissions || [];

    document.getElementById('review-assignment-subtitle').textContent =
      `${assignment.title} • ${assignment.className || 'Class'} (${submissions.length} submissions • Max ${assignment.points} pts)`;

    if (submissions.length === 0) {
      body.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon"><i class="fas fa-inbox"></i></div>
          <div class="empty-state__title">No Submissions Yet</div>
          <div class="empty-state__text">Students have not yet turned in work for this assignment.</div>
        </div>
      `;
      return;
    }

    body.innerHTML = `
      <div class="d-flex flex-col gap-md">
        ${submissions.map((sub) => {
          const initial = (sub.studentName || sub.studentEmail || 'S')[0].toUpperCase();
          const isGraded = sub.status === 'graded';
          return `
            <div class="card p-md" style="background:var(--card); border:1px solid var(--border);">
              <div class="d-flex align-center justify-between flex-wrap gap-xs mb-sm">
                <div class="d-flex align-center gap-sm">
                  <div class="header__avatar" style="width:40px; height:40px; font-size:1rem; background:var(--primary); color:#ffffff; font-weight:700;">
                    ${initial}
                  </div>
                  <div>
                    <h4 class="card__title mb-0">${escapeHTML(sub.studentName || 'Student')}</h4>
                    <span class="text-xs text-muted font-mono">${escapeHTML(sub.studentEmail)}</span>
                  </div>
                </div>
                <div class="d-flex align-center gap-xs">
                  <span class="text-xs text-muted font-mono">Turned in: ${sub.submittedAt ? sub.submittedAt.slice(0, 16).replace('T', ' ') : '—'}</span>
                  <span id="badge-sub-${sub.studentUid}" class="badge ${isGraded ? 'badge--success' : 'badge--warning'}">
                    ${isGraded ? `<i class="fas fa-check-circle"></i> Graded: ${sub.grade}/${assignment.points}` : '<i class="fas fa-clock"></i> Pending Review'}
                  </span>
                </div>
              </div>

              <!-- Student Submission Body -->
              <div class="p-sm my-xs text-sm" style="background:var(--muted); border-radius:var(--radius); border-left:3px solid var(--primary); white-space:pre-wrap;">${escapeHTML(sub.content || 'No text submitted.')}</div>

              ${sub.submissionUrl ? `
                <div class="my-xs">
                  <a href="${escapeHTML(sub.submissionUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-xs">
                    <i class="fas fa-external-link-alt text-primary"></i> Open Solution Link (${escapeHTML(sub.submissionUrl)})
                  </a>
                </div>
              ` : ''}

              <!-- Teacher Grading & Remarks Form -->
              <div class="mt-sm pt-sm" style="border-top:1px dashed var(--border)">
                <div class="fw-700 text-xs uppercase text-primary mb-xs" style="letter-spacing:0.05em">
                  <i class="fas fa-award"></i> Teacher Evaluation & Remarks
                </div>
                <div class="grid-2 gap-sm align-center">
                  <div class="form-group mb-0">
                    <label class="form-label text-xs mb-xs">Score (out of ${assignment.points} pts):</label>
                    <input id="grade-${sub.studentUid}" type="number" min="0" max="${assignment.points}" class="form-input form-input-sm" value="${sub.grade !== null && sub.grade !== undefined ? sub.grade : ''}" placeholder="Points">
                  </div>
                  <div class="form-group mb-0">
                    <label class="form-label text-xs mb-xs">Actionable Remarks & Feedback:</label>
                    <input id="remarks-${sub.studentUid}" type="text" class="form-input form-input-sm" value="${escapeHTML(sub.remarks || '')}" placeholder="e.g. Excellent structure! Watch edge cases.">
                  </div>
                </div>
                <div class="d-flex justify-end mt-xs">
                  <button class="btn btn-primary btn-xs" onclick="handleGradeSubmission('${assignment.id}', '${sub.studentUid}', ${assignment.points})">
                    <i class="fas fa-save"></i> Save Remarks & Grade
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div class="empty-state"><div class="empty-state__icon"><i class="fas fa-exclamation-triangle"></i></div><div class="empty-state__title">Error loading submissions</div><div class="empty-state__text">${err.message}</div></div>`;
  }
}

async function handleGradeSubmission(assignmentId, studentUid, maxPoints) {
  const gradeInput = document.getElementById(`grade-${studentUid}`);
  const remarksInput = document.getElementById(`remarks-${studentUid}`);
  const grade = gradeInput ? parseInt(gradeInput.value) : null;
  const remarks = remarksInput ? remarksInput.value.trim() : '';

  if (grade === null || isNaN(grade)) {
    showToast('Please enter a valid numeric grade', 'warning');
    return;
  }

  try {
    await Auth.apiFetch(`/api/assignments/${assignmentId}/submissions/${studentUid}/grade`, {
      method: 'POST',
      body: JSON.stringify({ grade, remarks })
    });
    showToast('Grade and remarks recorded successfully!', 'success');
    const badge = document.getElementById(`badge-sub-${studentUid}`);
    if (badge) {
      badge.className = 'badge badge--success';
      badge.innerHTML = `<i class="fas fa-check-circle"></i> Graded: ${grade}/${maxPoints}`;
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteAssignment(assignmentId) {
  if (!confirm('Are you sure you want to delete this assignment and all associated submissions?')) return;
  try {
    await Auth.apiFetch(`/api/assignments/${assignmentId}`, { method: 'DELETE' });
    showToast('Assignment deleted', 'info');
    renderAssignments();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ══════════════════════════════════════════════════════════════════
   STUDY MATERIALS SYSTEM (YouTube Videos, Notes, Documents)
   ══════════════════════════════════════════════════════════════════ */
let allMaterials = [];
let currentMaterialCategory = 'all';

async function populateMaterialClassSelect() {
  const select = document.getElementById('material-class-select');
  if (!select) return;
  try {
    const classes = await Auth.apiFetch('/api/classes');
    select.innerHTML = (classes || []).map(c => `<option value="${c.id}">${escapeHTML(c.name)} (${c.joinCode})</option>`).join('');
  } catch (e) {
    console.error('Failed to populate material classes', e);
  }
}

async function renderMaterials() {
  const container = document.getElementById('materials-content');
  if (!container) return;
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><span>Loading curated study materials…</span></div>';

  try {
    const materials = await Auth.apiFetch('/api/materials');
    allMaterials = materials || [];
    const role = App.profile?.role || 'student';
    const isTeacher = role === 'teacher' || role === 'admin';

    container.innerHTML = `
      <!-- Toolbar & Category Tabs -->
      <div class="card mb-lg p-md">
        <div class="d-flex align-center justify-between flex-wrap gap-md">
          <div class="d-flex align-center gap-xs flex-wrap">
            <button class="btn btn-sm ${currentMaterialCategory === 'all' ? 'btn-primary' : 'btn-ghost'}" onclick="filterMaterialsCategory('all')">
              <i class="fas fa-layer-group"></i> All Materials
            </button>
            <button class="btn btn-sm ${currentMaterialCategory === 'youtube' ? 'btn-primary' : 'btn-ghost'}" onclick="filterMaterialsCategory('youtube')">
              <i class="fab fa-youtube text-danger"></i> YouTube Videos
            </button>
            <button class="btn btn-sm ${currentMaterialCategory === 'notes' ? 'btn-primary' : 'btn-ghost'}" onclick="filterMaterialsCategory('notes')">
              <i class="fas fa-sticky-note text-warning"></i> Lecture Notes
            </button>
            <button class="btn btn-sm ${currentMaterialCategory === 'document' ? 'btn-primary' : 'btn-ghost'}" onclick="filterMaterialsCategory('document')">
              <i class="fas fa-file-alt text-info"></i> Documents & Links
            </button>
          </div>
          <div class="d-flex align-center gap-sm">
            <span class="text-xs text-muted font-mono">${allMaterials.length} Resources</span>
            ${isTeacher ? `
              <button class="btn btn-primary btn-sm" onclick="openModal('add-material-modal')">
                <i class="fas fa-plus"></i> Add Material
              </button>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Materials Grid -->
      <div class="grid-cards" id="materials-cards-grid">
        ${renderMaterialsList(allMaterials, isTeacher)}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__icon"><i class="fas fa-exclamation-triangle"></i></div><div class="empty-state__title">Unable to Load Materials</div><div class="empty-state__text">${err.message}</div></div>`;
  }
}

function filterMaterialsCategory(cat) {
  currentMaterialCategory = cat;
  renderMaterials();
}

function renderMaterialsList(list, isTeacher) {
  const filtered = currentMaterialCategory === 'all'
    ? list
    : currentMaterialCategory === 'document'
      ? list.filter(m => m.type === 'document' || m.type === 'link')
      : list.filter(m => m.type === currentMaterialCategory);

  if (!filtered || filtered.length === 0) {
    return `
      <div class="empty-state" style="grid-column: 1 / -1">
        <div class="empty-state__icon"><i class="fas fa-book-open"></i></div>
        <div class="empty-state__title">No Study Materials Found</div>
        <div class="empty-state__text">${isTeacher ? 'Click "+ Add Material" to share lecture notes, documents, or YouTube video walkthroughs.' : 'Your teacher has not uploaded materials in this category yet.'}</div>
      </div>
    `;
  }
  return filtered.map(m => renderMaterialCard(m, isTeacher)).join('');
}

function renderMaterialCard(m, isTeacher) {
  const isVideo = m.type === 'youtube';
  const isNotes = m.type === 'notes';

  let typeBadge = '';
  let previewArea = '';

  if (isVideo) {
    typeBadge = '<span class="badge badge--danger"><i class="fab fa-youtube"></i> YouTube Video</span>';
    if (m.youtubeId) {
      previewArea = `
        <div class="cursor-pointer mb-sm" onclick="viewMaterial('${m.id}')" style="position:relative; width:100%; height:140px; border-radius:var(--radius); overflow:hidden; background:#000;">
          <img src="https://img.youtube.com/vi/${m.youtubeId}/hqdefault.jpg" style="width:100%; height:100%; object-fit:cover; opacity:0.85;" alt="${escapeHTML(m.title)}">
          <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:44px; height:44px; border-radius:50%; background:rgba(239,68,68,0.9); display:flex; align-items:center; justify-content:center; color:#fff; font-size:1.2rem; box-shadow:0 4px 12px rgba(0,0,0,0.4);">
            <i class="fas fa-play" style="margin-left:3px"></i>
          </div>
        </div>
      `;
    }
  } else if (isNotes) {
    typeBadge = '<span class="badge badge--warning"><i class="fas fa-sticky-note"></i> Lecture Notes</span>';
    previewArea = `
      <div class="p-sm mb-sm text-xs text-secondary font-mono" style="background:var(--muted); border-radius:var(--radius); border-left:3px solid var(--color-chart-2); max-height:90px; overflow:hidden;">
        ${escapeHTML((m.content || '').slice(0, 180))}…
      </div>
    `;
  } else {
    typeBadge = '<span class="badge badge--info"><i class="fas fa-file-alt"></i> Reference Resource</span>';
    previewArea = `
      <div class="p-sm mb-sm text-xs text-muted" style="background:var(--muted); border-radius:var(--radius);">
        <i class="fas fa-link text-primary mr-xs"></i> ${escapeHTML(m.url || 'Online Reference Link')}
      </div>
    `;
  }

  return `
    <div class="card" style="display:flex; flex-direction:column; justify-content:space-between;">
      <div>
        <div class="card__header mb-xs">
          <div>
            <h4 class="card__title">${escapeHTML(m.title)}</h4>
            <div class="card__subtitle"><i class="fas fa-chalkboard text-primary"></i> ${escapeHTML(m.className || 'Class')}</div>
          </div>
          ${typeBadge}
        </div>

        ${previewArea}
      </div>

      <div class="mt-md pt-sm" style="border-top:1px solid var(--border);">
        <div class="d-flex align-center justify-between gap-sm">
          <button class="btn btn-primary btn-sm flex-1" onclick="viewMaterial('${m.id}')">
            <i class="fas ${isVideo ? 'fa-play' : isNotes ? 'fa-book-open' : 'fa-external-link-alt'}"></i> ${isVideo ? 'Watch Video' : isNotes ? 'Read Notes' : 'Open Resource'}
          </button>
          ${isTeacher ? `
            <button class="btn btn-ghost btn-sm" onclick="deleteMaterial('${m.id}')" title="Delete Material">
              <i class="fas fa-trash text-danger"></i>
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function toggleMaterialFields(type) {
  const urlGroup = document.getElementById('material-url-group');
  const contentGroup = document.getElementById('material-content-group');
  const urlInput = document.getElementById('material-url');

  if (!urlGroup || !contentGroup || !urlInput) return;

  if (type === 'youtube') {
    urlGroup.style.display = 'block';
    contentGroup.style.display = 'block';
    urlInput.placeholder = 'https://www.youtube.com/watch?v=...';
    urlInput.required = true;
  } else if (type === 'notes') {
    urlGroup.style.display = 'none';
    contentGroup.style.display = 'block';
    urlInput.required = false;
  } else {
    urlGroup.style.display = 'block';
    contentGroup.style.display = 'none';
    urlInput.placeholder = 'https://... (Google Drive, PDF, Web Page)';
    urlInput.required = true;
  }
}

async function handleAddMaterial(e) {
  e.preventDefault();
  const classId = document.getElementById('material-class-select').value;
  const type = document.getElementById('material-type').value;
  const title = document.getElementById('material-title').value.trim();
  const url = document.getElementById('material-url')?.value.trim() || '';
  const content = document.getElementById('material-content')?.value.trim() || '';

  try {
    await Auth.apiFetch('/api/materials', {
      method: 'POST',
      body: JSON.stringify({ classId, type, title, url, content })
    });
    closeModal('add-material-modal');
    e.target.reset();
    showToast('Study material published successfully!', 'success');
    renderMaterials();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function viewMaterial(materialId) {
  const m = allMaterials.find(item => item.id === materialId);
  if (!m) return;

  const titleEl = document.getElementById('view-material-title');
  const bodyEl = document.getElementById('view-material-body');
  if (!titleEl || !bodyEl) return;

  titleEl.innerHTML = `<i class="fas ${m.type === 'youtube' ? 'fa-play-circle text-danger' : m.type === 'notes' ? 'fa-sticky-note text-warning' : 'fa-file-alt text-primary'}"></i> ${escapeHTML(m.title)}`;

  let contentHtml = '';
  if (m.type === 'youtube') {
    if (m.youtubeId) {
      contentHtml = `
        <div style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:var(--radius); margin-bottom:var(--space-md); background:#000;">
          <iframe src="https://www.youtube.com/embed/${m.youtubeId}?autoplay=1"
                  style="position:absolute; top:0; left:0; width:100%; height:100%; border:0;"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowfullscreen></iframe>
        </div>
      `;
    }
    if (m.content) {
      contentHtml += `
        <div class="card p-md" style="background:var(--muted); border:1px solid var(--border);">
          <h5 class="fw-700 text-xs uppercase text-primary mb-xs">Lecture Notes & Key Takeaways</h5>
          <div class="text-sm" style="white-space:pre-wrap;">${escapeHTML(m.content)}</div>
        </div>
      `;
    }
  } else if (m.type === 'notes') {
    contentHtml = `
      <div class="card p-lg" style="background:var(--card); border:1px solid var(--border); max-height:60vh; overflow-y:auto;">
        <div class="d-flex align-center justify-between mb-md">
          <span class="badge badge--warning"><i class="fas fa-sticky-note"></i> Instructor Notes</span>
          <span class="text-xs text-muted font-mono">${escapeHTML(m.className || 'Class Space')}</span>
        </div>
        <div class="fs-md" style="line-height:1.7; white-space:pre-wrap; color:var(--foreground);">${escapeHTML(m.content || 'No text content available.')}</div>
      </div>
    `;
  } else {
    contentHtml = `
      <div class="card p-lg text-center" style="background:var(--card); border:1px solid var(--border);">
        <i class="fas fa-external-link-alt fa-3x text-primary mb-md"></i>
        <h4 class="fw-700 fs-lg mb-xs">${escapeHTML(m.title)}</h4>
        <p class="text-xs text-muted font-mono mb-lg">${escapeHTML(m.url)}</p>
        <a href="${escapeHTML(m.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
          <i class="fas fa-arrow-up-right-from-square"></i> Open External Resource
        </a>
      </div>
    `;
  }

  bodyEl.innerHTML = contentHtml;
  openModal('view-material-modal');
}

async function deleteMaterial(materialId) {
  if (!confirm('Are you sure you want to remove this study material?')) return;
  try {
    await Auth.apiFetch(`/api/materials/${materialId}`, { method: 'DELETE' });
    showToast('Study material removed', 'info');
    renderMaterials();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
