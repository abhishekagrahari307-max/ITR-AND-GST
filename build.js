#!/usr/bin/env node
/**
 * Generate safe, public build metadata for the static GitHub Pages site.
 *
 * API keys must never be injected into browser JavaScript: anyone can inspect
 * assets served by a static site. Optional provider keys belong to an
 * individual's browser setup, or behind a separately secured server proxy.
 */
'use strict';

const fs = require('fs');
const path = require('path');

if (process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY) {
  console.warn('Provider key environment variables were ignored; this public static build never serializes API keys.');
}

const buildSha = String(process.env.GITHUB_SHA || 'local').slice(0, 7);
const buildBranch = String(process.env.GITHUB_REF_NAME || 'dev');
const output = `/* Auto-generated public build metadata. Never put secrets in this file. */
'use strict';
(function () {
  window.TAXMITRA_BUILD = {
    hasGemini: false,
    hasOpenRouter: false,
    sha: ${JSON.stringify(buildSha)},
    branch: ${JSON.stringify(buildBranch)},
    developer: 'Abhishek Agrahari'
  };
})();
`;

const outputPath = path.join(__dirname, 'js', 'config-generated.js');
fs.writeFileSync(outputPath, output, 'utf8');
console.log(`Generated safe public build metadata: ${outputPath}`);
