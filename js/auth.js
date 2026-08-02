/* TaxMitra AI Enterprise — Real Firebase Authentication
   Developer: Abhishek Agrahari
   Uses: Firebase Auth v10 (Email, Google, Phone OTP)
   No simulation — all real Firebase calls
*/

function waitForFirebase(cb, tries = 0) {
  if (typeof firebase !== 'undefined' && firebase.apps !== undefined) { cb(); }
  else if (tries < 30) { setTimeout(() => waitForFirebase(cb, tries + 1), 200); }
  else { console.warn('Firebase SDK not loaded'); }
}

waitForFirebase(() => {
  const cfg = window.TAXMITRA_CONFIG?.FIREBASE_CONFIG;
  if (cfg && cfg.apiKey && !cfg.apiKey.includes('XXXX')) {
    if (!firebase.apps.length) {
      firebase.initializeApp(cfg);
      console.log('✅ Firebase initialised');
    }
  } else {
    console.warn('⚠️ Firebase keys not configured — set in js/firebase-config.js');
  }
  initAuth();
});

// ── Auth State Observer ───────────────────────────────────────
function initAuth() {
  if (typeof firebase === 'undefined') return;
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      const u = { uid: user.uid, name: user.displayName || user.email.split('@')[0], email: user.email, photo: user.photoURL || '' };
      localStorage.setItem('tm_user', JSON.stringify(u));
      const page = location.pathname;
      if (page.includes('login.html') || page.includes('signup.html')) {
        location.href = 'pages/dashboard.html';
      }
    } else {
      localStorage.removeItem('tm_user');
    }
  });
  initLoginForm();
  initSignupForm();
  initPasswordToggle();
  initPasswordStrength();
}

// ── Helpers ───────────────────────────────────────────────────
function showMsg(id, msg, type = 'error') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.style.color = type === 'error' ? '#dc2626' : '#16a34a';
}
function hideMsg(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function showToastAuth(msg, type = 'success') {
  if (typeof showToast === 'function') { showToast(msg, type); return; }
  const d = document.createElement('div');
  d.textContent = msg;
  d.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;padding:.75rem 1.25rem;background:${type==='error'?'#dc2626':'#1e40af'};color:#fff;border-radius:8px;z-index:9999;font-size:.875rem;box-shadow:0 4px 16px rgba(0,0,0,.2)`;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3500);
}
function setBtn(btn, loading, text) {
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading ? `<i class="fas fa-spinner fa-spin"></i> ${text}` : text;
}

// ── EMAIL / PASSWORD LOGIN ────────────────────────────────────
function initLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    const btn      = form.querySelector('button[type="submit"]');
    ['email-error','password-error','login-error'].forEach(hideMsg);
    if (!email)    return showMsg('email-error', 'Email required');
    if (!/\S+@\S+\.\S+/.test(email)) return showMsg('email-error', 'Valid email required');
    if (!password) return showMsg('password-error', 'Password required');

    setBtn(btn, true, 'Logging in...');
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
      showMsg('login-error', '⚠️ Firebase not configured. Set keys in js/firebase-config.js');
      setBtn(btn, false, 'Login →'); return;
    }
    try {
      await firebase.auth().signInWithEmailAndPassword(email, password);
      showToastAuth('✅ Login successful!');
    } catch (err) {
      const msgs = {
        'auth/user-not-found':     'No account with this email.',
        'auth/wrong-password':     'Incorrect password.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/too-many-requests':  'Too many attempts. Try later.',
        'auth/network-request-failed': 'Network error. Check connection.',
      };
      showMsg('login-error', msgs[err.code] || err.message);
      setBtn(btn, false, 'Login →');
    }
  });
}

// ── GOOGLE OAUTH ──────────────────────────────────────────────
async function googleLogin() {
  if (typeof firebase === 'undefined' || !firebase.apps.length) {
    showToastAuth('⚠️ Firebase not configured — set keys in js/firebase-config.js', 'error'); return;
  }
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await firebase.auth().signInWithPopup(provider);
  } catch (err) {
    const el = document.getElementById('login-error') || document.getElementById('signup-error');
    if (el) { el.textContent = err.message; el.style.display = 'block'; }
    else showToastAuth(err.message, 'error');
  }
}

// ── PHONE OTP ─────────────────────────────────────────────────
let _confirmResult = null;
async function sendOTP(phone) {
  if (!phone || phone.length < 10) { showMsg('phone-error', 'Valid phone required'); return; }
  const fullPhone = phone.startsWith('+') ? phone : '+91' + phone;
  try {
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', { size: 'invisible' });
    _confirmResult = await firebase.auth().signInWithPhoneNumber(fullPhone, window.recaptchaVerifier);
    document.getElementById('otp-section')?.style.setProperty('display','block');
    showMsg('phone-msg', `✅ OTP sent to ${fullPhone}`, 'success');
  } catch (err) { showMsg('phone-error', err.message); }
}
async function verifyOTP(otp) {
  if (!_confirmResult) { showMsg('otp-error', 'Send OTP first'); return; }
  try { await _confirmResult.confirm(otp); }
  catch { showMsg('otp-error', 'Invalid OTP. Try again.'); }
}

// ── SIGNUP ────────────────────────────────────────────────────
function initSignupForm() {
  const form = document.getElementById('signup-form');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name    = document.getElementById('signup-name')?.value.trim();
    const email   = document.getElementById('signup-email')?.value.trim();
    const mobile  = document.getElementById('signup-mobile')?.value.trim();
    const password= document.getElementById('signup-password')?.value;
    const confirm = document.getElementById('signup-confirm')?.value;
    const terms   = document.getElementById('agree-terms')?.checked;
    const btn     = form.querySelector('button[type="submit"]');
    ['name-error','email-error','mobile-error','password-error','confirm-error','signup-error'].forEach(hideMsg);
    let ok = true;
    if (!name)                           { showMsg('name-error',    'Full name required');          ok=false; }
    if (!email)                          { showMsg('email-error',   'Email required');              ok=false; }
    else if (!/\S+@\S+\.\S+/.test(email)){ showMsg('email-error', 'Valid email required');         ok=false; }
    if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) { showMsg('mobile-error','Valid 10-digit mobile'); ok=false; }
    if (!password || password.length<8)  { showMsg('password-error','Min 8 characters');           ok=false; }
    if (password !== confirm)            { showMsg('confirm-error', 'Passwords do not match');     ok=false; }
    if (!terms)                          { showMsg('signup-error',  'Please agree to Terms');      ok=false; }
    if (!ok) return;
    setBtn(btn, true, 'Creating...');
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
      showMsg('signup-error', '⚠️ Firebase not configured. Set keys in js/firebase-config.js');
      setBtn(btn, false, 'Create Account →'); return;
    }
    try {
      const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });
      await cred.user.sendEmailVerification();
      showMsg('signup-error', '✅ Account created! Verification email sent.', 'success');
      setTimeout(() => location.href = 'login.html', 2500);
    } catch (err) {
      const msgs = {
        'auth/email-already-in-use': 'Email already registered. Please login.',
        'auth/weak-password':        'Password too weak.',
        'auth/network-request-failed': 'Network error.',
      };
      showMsg('signup-error', msgs[err.code] || err.message);
      setBtn(btn, false, 'Create Account →');
    }
  });
}

// ── LOGOUT ────────────────────────────────────────────────────
async function logout() {
  if (typeof firebase !== 'undefined') await firebase.auth().signOut().catch(() => {});
  localStorage.clear();
  location.href = '/ITR-AND-GST/login.html';
}

// ── FORGOT PASSWORD ───────────────────────────────────────────
async function forgotPassword() {
  const email = document.getElementById('login-email')?.value.trim();
  if (!email) { showMsg('email-error', 'Enter your email first'); return; }
  try {
    await firebase.auth().sendPasswordResetEmail(email);
    showMsg('login-error', '✅ Password reset email sent! Check inbox.', 'success');
  } catch (err) { showMsg('login-error', err.message); }
}

// ── HELPERS ───────────────────────────────────────────────────
function getCurrentUser() { try { return JSON.parse(localStorage.getItem('tm_user') || 'null'); } catch { return null; } }
function isLoggedIn()     { return !!getCurrentUser(); }

function initPasswordToggle() {
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', function() {
      const inp = this.previousElementSibling;
      if (!inp) return;
      inp.type = inp.type === 'password' ? 'text' : 'password';
      this.querySelector('i')?.classList.toggle('fa-eye');
      this.querySelector('i')?.classList.toggle('fa-eye-slash');
    });
  });
}

function initPasswordStrength() {
  const inp = document.getElementById('signup-password');
  if (!inp) return;
  inp.addEventListener('input', function() {
    const pw = this.value; let score = 0;
    if (pw.length >= 8) score++; if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++; if (/[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++; if (/[^A-Za-z0-9]/.test(pw)) score++;
    const bar = document.querySelector('.strength-bar');
    const txt = document.querySelector('.strength-text');
    if (!bar || !txt) return;
    const levels = [[2,'33%','#ef4444','Weak'],[4,'66%','#f59e0b','Medium'],[6,'100%','#10b981','Strong']];
    const lvl = levels.find(([s]) => score <= s) || levels[2];
    bar.style.width = lvl[1]; bar.style.backgroundColor = lvl[2];
    txt.textContent = lvl[3]; txt.style.color = lvl[2];
  });
}
