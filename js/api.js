/* ===================================================
   TaxMitra AI Enterprise – Frontend API Client
   Connects frontend to NestJS backend
   =================================================== */

const API_BASE = window.TAXMITRA_API_URL || 'http://localhost:3001/api/v1';

// ─── Token Management ───────────────────────────────────────────────────────
const Auth = {
  getToken:      ()      => localStorage.getItem('tm_access_token'),
  setToken:      (t)     => localStorage.setItem('tm_access_token', t),
  getRefresh:    ()      => localStorage.getItem('tm_refresh_token'),
  setRefresh:    (t)     => localStorage.setItem('tm_refresh_token', t),
  clear:         ()      => { localStorage.removeItem('tm_access_token'); localStorage.removeItem('tm_refresh_token'); localStorage.removeItem('tm_user'); },
  setUser:       (u)     => localStorage.setItem('tm_user', JSON.stringify(u)),
  getUser:       ()      => { try { return JSON.parse(localStorage.getItem('tm_user') || 'null'); } catch { return null; } },
  isLoggedIn:    ()      => !!localStorage.getItem('tm_access_token'),
};

// ─── Base Fetch Wrapper ────────────────────────────────────────────────────
async function apiRequest(endpoint, options = {}) {
  const token = Auth.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(options.headers || {}),
  };

  const config = { ...options, headers };
  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
    headers['Content-Type'] = 'application/json';
  }
  if (config.body instanceof FormData) delete headers['Content-Type'];

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, config);

    // Token expired → refresh
    if (res.status === 401 && Auth.getRefresh()) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        headers.Authorization = `Bearer ${Auth.getToken()}`;
        const retryRes = await fetch(`${API_BASE}${endpoint}`, { ...config, headers });
        return handleResponse(retryRes);
      } else {
        Auth.clear();
        window.location.href = '/login.html';
        return null;
      }
    }

    return handleResponse(res);
  } catch (err) {
    console.error('API Error:', err);
    throw err;
  }
}

async function handleResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, message: data.message || 'API Error', data };
  return data.data !== undefined ? data.data : data;
}

async function refreshAccessToken() {
  const refresh = Auth.getRefresh();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    Auth.setToken(data.data?.accessToken || data.accessToken);
    return true;
  } catch { return false; }
}

// ─── Auth API ──────────────────────────────────────────────────────────────
const AuthAPI = {
  register: (data)         => apiRequest('/auth/register', { method: 'POST', body: data }),
  login:    (data)         => apiRequest('/auth/login',    { method: 'POST', body: data }),
  firebaseLogin: (idToken) => apiRequest('/auth/firebase-login', { method: 'POST', body: { idToken } }),
  refresh:  ()             => apiRequest('/auth/refresh',  { method: 'POST', body: { refreshToken: Auth.getRefresh() } }),
  logout:   ()             => apiRequest('/auth/logout',   { method: 'DELETE' }),
  getMe:    ()             => apiRequest('/auth/me'),

  async loginAndStore(data) {
    const result = await this.login(data);
    Auth.setToken(result.accessToken);
    Auth.setRefresh(result.refreshToken);
    Auth.setUser(result.user);
    return result;
  },

  async firebaseLoginAndStore(idToken) {
    const result = await this.firebaseLogin(idToken);
    Auth.setToken(result.accessToken);
    Auth.setRefresh(result.refreshToken);
    Auth.setUser(result.user);
    return result;
  },
};

// ─── Tax Calculations API ──────────────────────────────────────────────────
const CalcAPI = {
  compute:      (data) => apiRequest('/calculations/compute',      { method: 'POST', body: data }),
  compareRegime:(data) => apiRequest('/calculations/compare-regime',{ method: 'POST', body: data }),
  hra:          (data) => apiRequest('/calculations/hra',          { method: 'POST', body: data }),
  sip:          (data) => apiRequest('/calculations/sip',          { method: 'POST', body: data }),
  emi:          (data) => apiRequest('/calculations/emi',          { method: 'POST', body: data }),
  gratuity:     (data) => apiRequest('/calculations/gratuity',     { method: 'POST', body: data }),
  gst:          (data) => apiRequest('/calculations/gst',          { method: 'POST', body: data }),
  capitalGain:  (data) => apiRequest('/calculations/capital-gain', { method: 'POST', body: data }),
  getAll:       ()     => apiRequest('/calculations'),
  getById:      (id)   => apiRequest(`/calculations/${id}`),
  delete:       (id)   => apiRequest(`/calculations/${id}`, { method: 'DELETE' }),
};

// ─── AI Chat API ───────────────────────────────────────────────────────────
const AIAPI = {
  chat:          (data) => apiRequest('/ai/chat',           { method: 'POST', body: data }),
  taxPlan:       (data) => apiRequest('/ai/tax-plan',       { method: 'POST', body: data }),
  recommendForm: (data) => apiRequest('/ai/recommend-form', { method: 'POST', body: data }),
  explainNotice: (data) => apiRequest('/ai/explain-notice', { method: 'POST', body: data }),
  getHistory:    (sid)  => apiRequest(`/ai/chat-history${sid ? '?sessionId=' + sid : ''}`),
};

// ─── Documents API ─────────────────────────────────────────────────────────
const DocsAPI = {
  upload(file, documentType) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('documentType', documentType);
    return apiRequest('/documents/upload', { method: 'POST', body: fd });
  },
  getAll:  ()   => apiRequest('/documents'),
  getById: (id) => apiRequest(`/documents/${id}`),
  delete:  (id) => apiRequest(`/documents/${id}`, { method: 'DELETE' }),
};

// ─── Compliance API ────────────────────────────────────────────────────────
const ComplianceAPI = {
  getDates:     (cat) => apiRequest(`/compliance/dates${cat ? '?category=' + cat : ''}`),
  getTasks:     ()    => apiRequest('/compliance/tasks'),
  createTask:   (d)   => apiRequest('/compliance/tasks', { method: 'POST', body: d }),
  completeTask: (id)  => apiRequest(`/compliance/tasks/${id}/complete`, { method: 'PATCH' }),
  setReminders: (d)   => apiRequest('/compliance/reminders', { method: 'POST', body: d }),
  calcPenalty:  (d)   => apiRequest('/compliance/penalty', { method: 'POST', body: d }),
};

// ─── User API ──────────────────────────────────────────────────────────────
const UserAPI = {
  dashboard:       ()     => apiRequest('/users/dashboard'),
  getProfile:      ()     => apiRequest('/users/profile'),
  updateProfile:   (data) => apiRequest('/users/profile', { method: 'PATCH', body: data }),
  getNotifications:()     => apiRequest('/users/notifications'),
  markRead:        (id)   => apiRequest(`/users/notifications/${id}/read`, { method: 'PATCH' }),
};

// ─── Firebase Integration ──────────────────────────────────────────────────
const FirebaseAuth = {
  // Initialize Firebase (call with your config)
  init(config) {
    if (typeof firebase !== 'undefined' && !firebase.apps?.length) {
      firebase.initializeApp(config);
    }
  },

  async signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result   = await firebase.auth().signInWithPopup(provider);
    const idToken  = await result.user.getIdToken();
    return AuthAPI.firebaseLoginAndStore(idToken);
  },

  async signInWithPhone(phone, recaptchaContainer) {
    const recaptcha = new firebase.auth.RecaptchaVerifier(recaptchaContainer, { size: 'invisible' });
    const result    = await firebase.auth().signInWithPhoneNumber(phone, recaptcha);
    return result; // Confirmation result – call confirmOTP next
  },

  async confirmOTP(confirmationResult, otp) {
    const result  = await confirmationResult.confirm(otp);
    const idToken = await result.user.getIdToken();
    return AuthAPI.firebaseLoginAndStore(idToken);
  },

  async signOut() {
    if (typeof firebase !== 'undefined') await firebase.auth().signOut();
    await AuthAPI.logout().catch(() => {});
    Auth.clear();
    window.location.href = '/login.html';
  },
};

// ─── Toast helper ─────────────────────────────────────────────────────────
function apiToast(msg, type = 'success') {
  if (typeof showToast === 'function') showToast(msg, type);
  else console.log(`[${type.toUpperCase()}] ${msg}`);
}

// ─── Global error handler ──────────────────────────────────────────────────
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.status === 401) {
    Auth.clear();
    apiToast('Session expired. Please login again.', 'error');
    setTimeout(() => window.location.href = '/login.html', 1500);
  }
});

// ─── Export to global scope ────────────────────────────────────────────────
window.TaxMitraAPI = { Auth, AuthAPI, CalcAPI, AIAPI, DocsAPI, ComplianceAPI, UserAPI, FirebaseAuth };
console.log('%c🔗 TaxMitra API Client loaded', 'color:#1e40af;font-weight:700');
