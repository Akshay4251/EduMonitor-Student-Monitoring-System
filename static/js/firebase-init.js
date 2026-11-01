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

const isFirebaseConfigured = Boolean(
  window.firebase &&
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  firebaseConfig.projectId !== "YOUR_PROJECT"
);

let firebaseAuthInstance = null;
if (isFirebaseConfigured) {
  try {
    firebase.initializeApp(firebaseConfig);
    firebaseAuthInstance = firebase.auth();
    console.log("[Auth] Using Live Firebase Auth");
  } catch (err) {
    console.warn("[Auth] Failed to initialize Firebase Auth, falling back to local mode:", err);
  }
} else {
  console.log("[Auth] Running in Local Emulator Mode with demo accounts.");
}

/* ── Auth helpers ────────────────────────────────────────────────── */
const Auth = {
  _authListeners: [],

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
      const res = await fetch('/api/auth/register', {
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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName, role }),
      });
      const data = await res.json();
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
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
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
      ...(options.headers || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('text/csv') || ct.includes('application/pdf')) return res;
    return res.json();
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
