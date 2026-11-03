'use strict';

var t = require('./harness');
var path = require('path');
var childProcess = require('child_process');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');

t.suite('Static site build · never publish provider secrets', function () {
  t.test('build ignores provider key environment variables without echoing or serializing them', function () {
    var gemini = 'test-gemini-secret-that-must-not-be-printed';
    var openRouter = 'test-openrouter-secret-that-must-not-be-printed';
    var result = childProcess.spawnSync(process.execPath, ['build.js'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        GEMINI_API_KEY: gemini,
        OPENROUTER_API_KEY: openRouter,
        GITHUB_SHA: 'local',
        GITHUB_REF_NAME: 'dev'
      })
    });
    t.equal(result.status, 0, 'legacy deploy environments should still build safely');
    t.includes(result.stderr, 'were ignored');
    t.notOk((result.stdout + result.stderr).includes(gemini), 'Gemini key must not be echoed');
    t.notOk((result.stdout + result.stderr).includes(openRouter), 'OpenRouter key must not be echoed');
    var config = fs.readFileSync(path.join(ROOT, 'js/config-generated.js'), 'utf8');
    t.notOk(config.includes(gemini), 'Gemini key must not enter the generated asset');
    t.notOk(config.includes(openRouter), 'OpenRouter key must not enter the generated asset');
    t.ok(config.indexOf('hasGemini: false') !== -1);
    t.ok(config.indexOf('hasOpenRouter: false') !== -1);
    t.notOk(/apiKey|GEMINI_API_KEY|OPENROUTER_API_KEY/.test(config));
  });
});
