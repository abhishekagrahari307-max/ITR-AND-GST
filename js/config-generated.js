/* ================================================================
   TaxMitra AI Enterprise — Auto-Generated Config
   Developer: Abhishek Agrahari
   Generated: 2026-07-31T06:42:04.043Z
   Build: local | Branch: dev
   ⚠️  DO NOT EDIT — Regenerated on each deployment
   ================================================================ */
'use strict';
(function() {
  var g = "";
  var o = "";
  function save(keys) {
    try {
      localStorage.setItem('tm_keys', JSON.stringify(keys));
      sessionStorage.setItem('tm_keys', JSON.stringify(keys));
      if (window.TAXMITRA_CONFIG) {
        if (keys.geminiApiKey) { window.TAXMITRA_CONFIG.GEMINI_API_KEY = keys.geminiApiKey; window.TAXMITRA_CONFIG.FEATURES.GEMINI_AI = true; }
        if (keys.openrouterApiKey) { window.TAXMITRA_CONFIG.OPENROUTER_API_KEY = keys.openrouterApiKey; window.TAXMITRA_CONFIG.FEATURES.OPENROUTER = true; }
      }
    } catch(e) {}
  }
  if (g || o) {
    var existing = {};
    try { existing = JSON.parse(localStorage.getItem('tm_keys') || '{}'); } catch(e) {}
    var updated = Object.assign({}, existing);
    if (g) updated.geminiApiKey = g;
    if (o) updated.openrouterApiKey = o;
    save(updated);
    
    
  }
  window.TAXMITRA_BUILD = { hasGemini: false, hasOpenRouter: false, sha: 'local', branch: 'dev', developer: 'Abhishek Agrahari' };
})();