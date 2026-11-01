/* ===================================================
   TaxMitra – Homepage AI chat wiring
   Provides the four handlers the homepage markup calls
   (switchLang, sendDemoMsg, askQuick, sendAfwMsg) and keeps the
   "Gemini powered" labels honest: they only claim Gemini when an
   API key is actually configured, otherwise they say rule-based.

   Depends on: js/ai-real.js (window.TaxMitraAI)
   =================================================== */
(function () {
  'use strict';

  var LANG_KEY = 'tm-ai-lang';

  function $(id) { return document.getElementById(id); }

  function lang() {
    try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'hi'; } catch (e) { return 'hi'; }
  }

  function hasApiKey() {
    try {
      if (window.TaxMitraAI && window.TaxMitraAI.loadKeys) {
        var keys = window.TaxMitraAI.loadKeys() || {};
        return !!(keys.geminiApiKey || keys.openrouterApiKey);
      }
    } catch (e) { /* fall through */ }
    return false;
  }

  /** Say what is actually powering the answers. */
  function paintStatus() {
    var live = hasApiKey();
    var text = live ? '● AI model connected' : '● Offline assistant (rule-based) — add a key in Setup';
    document.querySelectorAll('.online-dot, .afw-status').forEach(function (el) {
      el.textContent = text;
      el.style.color = live ? 'var(--success, #10b981)' : 'var(--secondary, #f59e0b)';
      el.title = live
        ? 'Gemini / OpenRouter key detected in this browser'
        : 'No API key: answers come from TaxMitra’s built-in rule base and still work offline.';
    });
  }

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Minimal formatting: escape everything, then allow <br>, <strong>, <em> and lists. */
  function format(text) {
    var html = esc(text)
      .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
      .replace(/&lt;(\/?)(strong|b|em|i|ul|ol|li)&gt;/gi, '<$1$2>');
    return html.replace(/\n/g, '<br>');
  }

  /**
   * Machine-check the answer's rupee figures against the deterministic engine.
   * A fluent-but-wrong answer is shown with the engine's number next to it.
   */
  function verifyLine(question, answer) {
    var V = window.TMVerify;
    if (!V || typeof V.verify !== 'function') return '';
    var result;
    try {
      result = V.verify({ question: question, answer: answer });
    } catch (e) {
      return '';
    }
    if (!result || result.status === 'unchecked') return '';
    var cls = result.status === 'verified' ? 'ok' : 'bad';
    return '<div class="tm-verify-line ' + cls + '">' + V.badge(result) +
      ' <span>' + esc(result.message) + '</span></div>';
  }

  function appendBubble(host, role, html) {
    if (!host) return null;
    var div = document.createElement('div');
    div.className = role === 'user' ? 'chat-msg user' : 'chat-msg bot';
    if (host.id === 'afwMessages') {
      div.className = role === 'user' ? 'afw-msg user' : 'afw-msg bot';
      div.innerHTML = '<div class="afw-msg-avatar">' + (role === 'user' ? '👤' : '🤖') + '</div><div class="afw-msg-text">' + html + '</div>';
    } else {
      div.innerHTML = html;
    }
    host.appendChild(div);
    host.scrollTop = host.scrollHeight;
    return div;
  }

  var history = [];

  async function ask(message, host, input) {
    var text = String(message || '').trim();
    if (!text) return;
    if (input) input.value = '';
    appendBubble(host, 'user', esc(text));
    history.push({ role: 'user', text: text });
    if (history.length > 12) history.shift();

    var thinking = appendBubble(host, 'bot', '<em>Soch raha hoon…</em>');
    try {
      var engine = window.TaxMitraAI;
      if (!engine || typeof engine.callGemini !== 'function') {
        throw new Error('AI engine not loaded');
      }
      var reply = await engine.callGemini(text, 'general', lang(), history.slice(0, -1));
      var answer = reply && reply.text ? reply.text : 'Sorry, koi jawab nahi mila.';
      var note = reply && reply.provider === 'rule-based'
        ? '<div style="font-size:.7rem;opacity:.65;margin-top:.35rem">Rule-based answer · add an API key in <a href="pages/setup.html">Setup</a> for live AI</div>'
        : '';
      if (thinking) thinking.innerHTML = format(answer) + note + verifyLine(text, answer);
      history.push({ role: 'model', text: answer });
    } catch (error) {
      if (thinking) {
        thinking.innerHTML = 'Maaf kijiye, jawab nahi ban paya. <a href="pages/ai-assistant.html">Full AI Assistant</a> try karein.';
      }
      if (window.console && console.warn) console.warn('[TaxMitra AI]', error.message);
    } finally {
      if (host) host.scrollTop = host.scrollHeight;
    }
  }

  /* ---------------- handlers used by the markup ---------------- */

  window.switchLang = function (code) {
    var next = code === 'en' ? 'en' : 'hi';
    try { localStorage.setItem(LANG_KEY, next); } catch (e) { /* ignore */ }
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.classList.toggle('active', (btn.textContent || '').toLowerCase().indexOf(next === 'en' ? 'english' : 'हिं') !== -1);
    });
    var input = $('demoInput');
    if (input) input.placeholder = next === 'en' ? 'Ask any tax question…' : 'Tax question puchein… (Hindi ya English)';
  };

  window.sendDemoMsg = function () {
    var input = $('demoInput');
    return ask(input && input.value, $('aiDemoMessages'), input);
  };

  window.sendAfwMsg = function () {
    var input = $('afwInput');
    return ask(input && input.value, $('afwMessages'), input);
  };

  window.TMVerifyLine = verifyLine;

  window.askQuick = function (question) {
    var win = $('aiFloatWindow');
    if (win) { win.classList.add('show'); win.classList.add('open'); }
    var input = $('afwInput');
    if (input) input.value = question;
    return ask(question, $('afwMessages'), input);
  };

  function bind() {
    paintStatus();
    var langCode = lang();
    window.switchLang(langCode);

    ['demoInput', 'afwInput'].forEach(function (id) {
      var input = $(id);
      if (!input) return;
      input.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (id === 'demoInput') window.sendDemoMsg();
        else window.sendAfwMsg();
      });
    });

    var voice = document.querySelector('.voice-btn-demo');
    if (voice) voice.addEventListener('click', function () {
      alert('Voice input needs a live AI key. Setup → add a Gemini or OpenRouter key, or use your phone keyboard’s mic.');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  window.TMHomeAssistant = { ask: ask, hasApiKey: hasApiKey, paintStatus: paintStatus };
})();
