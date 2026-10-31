#!/usr/bin/env node
/**
 * TaxMitra AI Enterprise — Build Script
 * Developer: Abhishek Agrahari | Lucknow, UP
 * 
 * Reads API keys from environment variables and generates
 * js/config-generated.js for the deployed site.
 * 
 * Usage:
 *   GEMINI_API_KEY=AIzaSy... OPENROUTER_API_KEY=sk-or-... node build.js
 * 
 * In GitHub Actions (set as Repository Secrets):
 *   env:
 *     GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
 *     OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
 */

const fs = require('fs');
const path = require('path');

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const OR_KEY = process.env.OPENROUTER_API_KEY || '';
const BUILD_SHA = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.substring(0, 7) : 'local';
const BUILD_BRANCH = process.env.GITHUB_REF_NAME || 'dev';

// Validate keys
// Google changed Gemini key format in 2026: new keys start with 'AQ.' (not 'AIzaSy')
// Both formats supported
const isGeminiValid = (GEMINI_KEY.startsWith('AIzaSy') || GEMINI_KEY.startsWith('AQ.')) && GEMINI_KEY.length > 20;
const isORValid = OR_KEY.startsWith('sk-or-') && OR_KEY.length > 20;

console.log('=== TaxMitra AI Build Script ===');
console.log('Developer: Abhishek Agrahari');
console.log('Build SHA:', BUILD_SHA);
console.log('Gemini key:', isGeminiValid ? `✅ Valid (${GEMINI_KEY.substring(0, 8)}...)` : '❌ Not set or invalid');
console.log('OpenRouter key:', isORValid ? `✅ Valid (${OR_KEY.substring(0, 10)}...)` : '❌ Not set (optional)');

// Generate the config file
const configContent = `/* ================================================================
   TaxMitra AI Enterprise — Auto-Generated Config
   Developer: Abhishek Agrahari
   Generated: ${new Date().toISOString()}
   Build: ${BUILD_SHA} | Branch: ${BUILD_BRANCH}
   ⚠️  DO NOT EDIT — Regenerated on each deployment
   ================================================================ */
'use strict';
(function() {
  var g = ${JSON.stringify(isGeminiValid ? GEMINI_KEY : '')};
  var o = ${JSON.stringify(isORValid ? OR_KEY : '')};
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
    ${isGeminiValid ? "console.log('%c✅ Gemini AI Active (Build-injected)', 'color:#059669;font-weight:700');" : ""}
    ${isORValid ? "console.log('%c✅ OpenRouter Active (Build-injected)', 'color:#059669;font-weight:700');" : ""}
  }
  window.TAXMITRA_BUILD = { hasGemini: ${isGeminiValid}, hasOpenRouter: ${isORValid}, sha: '${BUILD_SHA}', branch: '${BUILD_BRANCH}', developer: 'Abhishek Agrahari' };
})();`;

// Write config file
const outputPath = path.join(__dirname, 'js', 'config-generated.js');
fs.writeFileSync(outputPath, configContent, 'utf8');
console.log('✅ Generated:', outputPath);

// Inject script tag into all HTML files
const htmlFiles = [];
const addHtmlFiles = (dir) => {
  fs.readdirSync(dir).forEach(f => {
    const full = path.join(dir, f);
    if (f.endsWith('.html')) htmlFiles.push(full);
    else if (fs.statSync(full).isDirectory() && f !== 'node_modules' && !f.startsWith('.')) addHtmlFiles(full);
  });
};
addHtmlFiles(__dirname);

let injected = 0;
htmlFiles.forEach(htmlFile => {
  let content = fs.readFileSync(htmlFile, 'utf8');
  if (content.includes('config-generated.js')) { return; } // already injected
  
  const rel = path.relative(path.dirname(htmlFile), path.join(__dirname, 'js', 'config-generated.js')).replace(/\\/g, '/');
  const scriptTag = `<script src="${rel}"></script>`;
  
  // Inject before firebase-config.js or before </body>
  if (content.includes('firebase-config.js')) {
    content = content.replace(/(<script[^>]+firebase-config\.js[^>]*><\/script>)/, scriptTag + '\n$1');
  } else {
    content = content.replace('</body>', scriptTag + '\n</body>');
  }
  fs.writeFileSync(htmlFile, content, 'utf8');
  injected++;
});

console.log(`✅ Script injected into ${injected} HTML files`);
console.log('Build complete!');
