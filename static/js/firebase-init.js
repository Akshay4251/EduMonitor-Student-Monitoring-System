/**
 * Firebase client-side initialization & Local Auth Fallback.
 * ─────────────────────────────────────────────────────────────────
 * If you configure your Firebase project below, real Firebase Auth is used.
 * If left with "YOUR_API_KEY", the app seamlessly uses local JWT auth
 * backed by the local emulator, so you can test immediately without setup!
 */

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

let firebaseAuthInstance = null;

// Dynamically check backend for configured Firebase credentials or fallback to local mode
(async function initFirebaseClient() {
  try {
    const baseUrl = (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '5000'))
      ? 'http://127.0.0.1:5000'
      : '';
    const res = await fetch(baseUrl + '/api/config/firebase');
    if (res.ok) {
      const data = await res.json();
      if (data.configured && data.config && data.config.apiKey && window.firebase) {
        if (!firebase.apps.length) {
          firebase.initializeApp(data.config);
        }
        firebaseAuthInstance = firebase.auth();
        console.log("[Auth] Connected to Live Firebase Cloud Project:", data.projectId);
        window.dispatchEvent(new CustomEvent('firebase-status-change', { detail: { live: true, projectId: data.projectId } }));
        return;
      }
    }
  } catch (e) {
    console.warn("[Auth] Firebase auto-config check info:", e);
  }
  console.log("[Auth] Running in High-Performance Local Database Mode with real academic data.");
  window.dispatchEvent(new CustomEvent('firebase-status-change', { detail: { live: false } }));
})();

/* ── Auth helpers ────────────────────────────────────────────────── */
const Auth = {
  _authListeners: [],

  _getBaseUrl() {
    // If the page is loaded on a different port (e.g. 5500 Live Server, 3000) or file://,
    // route API calls directly to the Flask backend running on port 5000.
    if (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '5000')) {
      return 'http://127.0.0.1:5000';
    }
    return '';
  },

  _notifyListeners(user) {
    this._authListeners.forEach(cb => {
      try { cb(user); } catch (e) { console.error(e); }
    });
  },

  /** Register a new user */
  async register(email, password, displayName, role) {
    if (firebaseAuthInstance) {
      // 1. Create user in Firebase Auth client-side
      const cred = await firebaseAuthInstance.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName });

      // 2. Tell backend to set custom claims + Firestore doc
      const token = await cred.user.getIdToken(true);
      const res = await fetch(this._getBaseUrl() + '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email, password, displayName, role }),
      });
      const data = await res.json();
      const freshToken = await cred.user.getIdToken(true);
      localStorage.setItem('edumonitor_token', freshToken);
      const userObj = { uid: cred.user.uid, email, displayName, role };
      localStorage.setItem('edumonitor_user', JSON.stringify(userObj));
      return data;
    } else {
      // Local Auth registration
      let res;
      try {
        res = await fetch(this._getBaseUrl() + '/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, displayName, role }),
        });
      } catch (err) {
        throw new Error('Cannot connect to authentication server. Please ensure Flask is running ("python app.py").');
      }

      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) {
        throw new Error('Authentication server returned HTML. Please open the app directly at http://localhost:5000.');
      }

      const data = await res.json().catch(() => ({ error: 'Invalid response from auth server' }));
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      if (data.token) {
        localStorage.setItem('edumonitor_token', data.token);
        const userObj = { uid: data.uid, email, displayName, role };
        localStorage.setItem('edumonitor_user', JSON.stringify(userObj));
        this._notifyListeners(userObj);
      }
      return data;
    }
  },

  /** Login */
  async login(email, password) {
    if (firebaseAuthInstance) {
      const cred = await firebaseAuthInstance.signInWithEmailAndPassword(email, password);
      try {
        const token = await cred.user.getIdToken();
        localStorage.setItem('edumonitor_token', token);
        const userObj = { uid: cred.user.uid, email: cred.user.email, displayName: cred.user.displayName };
        localStorage.setItem('edumonitor_user', JSON.stringify(userObj));
      } catch (e) {
        console.warn('Could not cache token to localStorage:', e);
      }
      return cred.user;
    } else {
      let res;
      try {
        res = await fetch(this._getBaseUrl() + '/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
      } catch (err) {
        throw new Error('Cannot connect to backend server. Please make sure Flask is running on port 5000 ("python app.py").');
      }

      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) {
        throw new Error('Backend returned HTML instead of JSON. Please access the application at http://localhost:5000.');
      }

      const data = await res.json().catch(() => ({ error: 'Invalid response from server' }));
      if (!res.ok) throw new Error(data.error || 'Login failed');

      localStorage.setItem('edumonitor_token', data.token);
      localStorage.setItem('edumonitor_user', JSON.stringify(data.user));
      this._notifyListeners(data.user);
      return data.user;
    }
  },

  /** Logout */
  async logout() {
    localStorage.removeItem('edumonitor_token');
    localStorage.removeItem('edumonitor_user');
    if (firebaseAuthInstance) {
      await firebaseAuthInstance.signOut();
    }
    this._notifyListeners(null);
  },

  /** Get current ID token */
  async getToken() {
    if (firebaseAuthInstance && firebaseAuthInstance.currentUser) {
      try {
        return await firebaseAuthInstance.currentUser.getIdToken();
      } catch (e) {
        console.warn('Error fetching fresh token:', e);
      }
    }
    return localStorage.getItem('edumonitor_token') || null;
  },

  /** Convenience: fetch with auth header */
  async apiFetch(url, options = {}) {
    const token = await this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const fullUrl = url.startsWith('http') ? url : (this._getBaseUrl() + url);

    let res;
    try {
      res = await fetch(fullUrl, { ...options, headers });
    } catch (networkErr) {
      throw new Error(`Cannot connect to server at ${fullUrl}. Make sure the Flask server is running ('python app.py').`);
    }

    const ct = (res.headers.get('content-type') || '').toLowerCase();

    // Check for downloadable files
    if (ct.includes('text/csv') || ct.includes('application/pdf')) return res;

    // Check if server returned HTML instead of JSON
    if (ct.includes('text/html')) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('Session expired or unauthorized. Please sign in again.');
      }
      throw new Error(`Endpoint ${url} returned HTML (${res.status} ${res.statusText}). Make sure Flask is running at http://localhost:5000.`);
    }

    let data;
    try {
      data = await res.json();
    } catch (jsonErr) {
      throw new Error(`Invalid JSON received from ${url} (Status ${res.status}).`);
    }

    if (!res.ok) {
      throw new Error(data.error || data.message || res.statusText || 'API request failed');
    }

    return data;
  },

  /** Listen for auth state changes */
  onAuthStateChanged(callback) {
    this._authListeners.push(callback);
    if (firebaseAuthInstance) {
      firebaseAuthInstance.onAuthStateChanged(async (user) => {
        if (user) {
          try {
            const token = await user.getIdToken();
            localStorage.setItem('edumonitor_token', token);
            const userObj = { uid: user.uid, email: user.email, displayName: user.displayName };
            localStorage.setItem('edumonitor_user', JSON.stringify(userObj));
          } catch (e) {}
        } else {
          localStorage.removeItem('edumonitor_token');
          localStorage.removeItem('edumonitor_user');
        }
        callback(user);
      });
    } else {
      // Local check
      const rawUser = localStorage.getItem('edumonitor_user');
      const token = localStorage.getItem('edumonitor_token');
      if (rawUser && token) {
        try {
          const user = JSON.parse(rawUser);
          setTimeout(() => callback(user), 50);
        } catch {
          setTimeout(() => callback(null), 50);
        }
      } else {
        setTimeout(() => callback(null), 50);
      }
    }
  },
};
