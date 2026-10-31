/* ============================================================
   TaxMitra AI Enterprise — Key Management & Config
   Developer: Abhishek Agrahari | Lucknow, UP
   
   API Keys are stored in browser localStorage only — NEVER in this file.
   
   Setup: Run in browser console —
     TaxMitra.setKeys({
       geminiApiKey: 'YOUR_GEMINI_KEY',
       openrouterApiKey: 'YOUR_OPENROUTER_KEY'  // optional
     })
   
   Get FREE keys:
     Gemini:     https://aistudio.google.com/app/apikey
     OpenRouter: https://openrouter.ai/keys  (DeepSeek R1 + Llama 3.3)
   ============================================================ */

'use strict';
// ── Try to load build-time injected keys (from GitHub Actions + Secrets) ──
// If config-generated.js was loaded before this file, keys are already in localStorage
// This is a no-op if keys were already injected by config-generated.js


// ── Load keys from localStorage (keys NEVER stored in code) ──
function loadStoredKeys() {
  try {
    // Try localStorage first, then sessionStorage as backup
    const ls = JSON.parse(localStorage.getItem('tm_keys') || '{}');
    const ss = JSON.parse(sessionStorage.getItem('tm_keys') || '{}');
    
    // Merge: localStorage takes priority
    const keys = {
      geminiApiKey:     ls.geminiApiKey     || ss.geminiApiKey     || '',
      openrouterApiKey: ls.openrouterApiKey || ss.openrouterApiKey || '',
    };
    
    // If found in sessionStorage but not localStorage, restore to localStorage
    if (!ls.geminiApiKey && ss.geminiApiKey) {
      localStorage.setItem('tm_keys', JSON.stringify(keys));
    }
    
    return keys;
  } catch(e) {
    return { geminiApiKey: '', openrouterApiKey: '' };
  }
}

// ── Expose config to other scripts ────────────────────────────
const _keys = loadStoredKeys();

window.TAXMITRA_CONFIG = {
  // Keys loaded from localStorage at runtime — never hardcoded here
  GEMINI_API_KEY:     _keys.geminiApiKey,
  OPENROUTER_API_KEY: _keys.openrouterApiKey,
  
  // App metadata
  APP_NAME:     'TaxMitra AI Enterprise',
  VERSION:      '3.0',
  DEVELOPER:    'Abhishek Agrahari',
  AY:           '2026-27',
  FY:           '2025-26',
  
  // Feature flags
  FEATURES: {
    GEMINI_AI:    !!_keys.geminiApiKey,
    OPENROUTER:   !!_keys.openrouterApiKey,
    MULTI_MODEL:  !!_keys.geminiApiKey || !!_keys.openrouterApiKey,
    VOICE_INPUT:  'SpeechRecognition' in window || 'webkitSpeechRecognition' in window,
    OFFLINE_MODE: 'serviceWorker' in navigator,
  },
};

// ── Firebase config (optional — for Auth features only) ───────
// Firebase project config loaded from localStorage (set via TaxMitra.setKeys)
// This avoids exposing config in public code files
const FIREBASE_CONFIG = (function() {
  try {
    const stored = JSON.parse(localStorage.getItem('tm_keys') || '{}');
    if (stored.firebaseConfig) return stored.firebaseConfig;
  } catch(e) {}
  // Return minimal config - Firebase Auth won't initialize without proper config
  // Users who need Firebase Auth should set it via: TaxMitra.setFirebaseConfig({...})
  return null;
})();

// Initialize Firebase only if SDK is loaded AND config is available
if (typeof firebase !== 'undefined' && FIREBASE_CONFIG) {
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    window.TAXMITRA_CONFIG.FIREBASE_READY = true;
    console.log('%c✅ Firebase initialized', 'color:#059669;font-size:11px');
  } catch(e) {
    console.warn('Firebase init failed (optional):', e.message);
    window.TAXMITRA_CONFIG.FIREBASE_READY = false;
  }
} else {
  // Firebase SDK not loaded or config not set — all tax tools still work without it
  window.TAXMITRA_CONFIG.FIREBASE_READY = false;
}

// ── AI Status (silent - no annoying banners) ──────────────────
if (_keys.geminiApiKey) {
  console.log('%c✅ TaxMitra AI: Gemini Active', 'color:#059669;font-weight:700;font-size:12px');
} else {
  console.log('%c🤖 TaxMitra AI: Rule-based mode (tax knowledge built-in)', 'color:#2563eb;font-size:11px');
}
