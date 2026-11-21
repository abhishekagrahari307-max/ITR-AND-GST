/* TaxMitra server – AI proxy.

   The browser never holds a provider key. Two shapes are served:

     POST /api/ai            pass-through, same contract as the old Cloudflare
                             worker (X-TaxMitra-Model: gemini | openrouter),
                             so js/ai-real.js needs no changes.
     POST /api/ai/chat       normalised {messages, mode, lang} → {text, provider}

   If no provider key is configured the service answers 503 with a machine
   readable code. It never invents an answer and never falls back to a fake
   "AI" reply — the site's own rule engine handles that client side, clearly
   labelled as rule-based. */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FALLBACK_SYSTEM_PROMPT = [
  'You are TaxMitra, an Indian income-tax and GST assistant for FY 2025-26 (AY 2026-27).',
  'Answer in the language the user writes in (Hindi, Hinglish or English).',
  'Use Indian numbering (lakh, crore) and the rupee symbol.',
  'Never invent a figure, a section number or a due date you are not sure about; say what you do not know.',
  'When you compute tax, show the slab working step by step.',
  'You cannot file returns, generate an IRN, or connect to the income-tax portal. Say so if asked.',
  'Close practical, non-filing answers with one line: this is guidance, not a filed return — confirm with a CA for your case.',
].join('\n');

function loadSystemPrompt(cfg) {
  try {
    const file = path.resolve(cfg.rootDir, cfg.ai.systemPromptFile);
    const text = fs.readFileSync(file, 'utf8').trim();
    if (text) return text;
  } catch (e) { /* fall through to the built-in prompt */ }
  return FALLBACK_SYSTEM_PROMPT;
}

function providerStatus(cfg) {
  const out = [];
  if (cfg.ai.geminiKey) out.push({ id: 'gemini', model: cfg.ai.geminiModel });
  if (cfg.ai.openrouterKey) out.push({ id: 'openrouter', model: cfg.ai.openrouterModel });
  if (cfg.ai.groqKey) out.push({ id: 'groq', model: cfg.ai.groqModel });
  if (cfg.ai.openaiKey) out.push({ id: 'openai', model: cfg.ai.openaiModel });
  return out;
}

function normaliseModelName(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'gemini' || v === 'gemini-vision') return 'gemini';
  if (v === 'openrouter' || v === 'deepseek' || v === 'llama') return 'openrouter';
  if (v === 'groq') return 'groq';
  if (v === 'openai') return 'openai';
  return '';
}

async function withTimeout(promiseFactory, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await promiseFactory(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------------------------------------------- Gemini */

async function geminiPassThrough(cfg, body) {
  if (!cfg.ai.geminiKey) return null;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(cfg.ai.geminiModel) + ':generateContent';
  const res = await withTimeout(
    (signal) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.ai.geminiKey },
      body: JSON.stringify(body),
      signal,
    }),
    cfg.ai.timeoutMs
  );
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { data = { error: { message: text.slice(0, 300) } }; }
  return { status: res.status, data };
}

/* Raw OpenRouter pass-through: the browser sends an OpenAI-shaped body and we
   forward it untouched, adding only the server-side key. */
async function openRouterPassThrough(cfg, body) {
  if (!cfg.ai.openrouterKey) return null;
  const res = await withTimeout(
    (signal) => fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + cfg.ai.openrouterKey,
        'HTTP-Referer': 'https://taxmitra.in',
        'X-Title': 'TaxMitra AI Enterprise',
      },
      body: JSON.stringify(Object.assign({ model: cfg.ai.openrouterModel }, body || {})),
      signal,
    }),
    cfg.ai.timeoutMs
  );
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { data = { error: { message: text.slice(0, 300) } }; }
  return { status: res.status, data };
}

async function geminiChat(cfg, messages) {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content || '') }],
  }));
  const result = await geminiPassThrough(cfg, {
    contents,
    generationConfig: { temperature: 0.6, maxOutputTokens: cfg.ai.maxTokens, topP: 0.95 },
    systemInstruction: { parts: [{ text: loadSystemPrompt(cfg) }] },
  });
  if (!result) throw new Error('gemini not configured');
  if (result.status >= 400) {
    const message = result.data && result.data.error && result.data.error.message
      ? result.data.error.message : 'Gemini rejected the request';
    const err = new Error(message);
    err.status = result.status;
    throw err;
  }
  const text = result.data && result.data.candidates && result.data.candidates[0] &&
    result.data.candidates[0].content && result.data.candidates[0].content.parts
    ? result.data.candidates[0].content.parts.map((p) => p.text || '').join('')
    : '';
  if (!text) throw new Error('Gemini returned an empty answer');
  return { text, provider: 'gemini', model: cfg.ai.geminiModel };
}

/* ------------------------------------------------- OpenAI-compatible APIs */

async function openAiCompatible(cfg, spec, messages) {
  const body = {
    model: spec.model,
    messages: [{ role: 'system', content: loadSystemPrompt(cfg) }].concat(messages),
    temperature: 0.6,
    max_tokens: cfg.ai.maxTokens,
  };
  const res = await withTimeout(
    (signal) => fetch(spec.base + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + spec.key,
        ...(spec.extraHeaders || {}),
      },
      body: JSON.stringify(body),
      signal,
    }),
    cfg.ai.timeoutMs
  );
  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); } catch (e) { data = { error: { message: raw.slice(0, 300) } }; }
  if (res.status >= 400) {
    const message = data && data.error && data.error.message ? data.error.message : 'Provider rejected the request';
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  const text = data && data.choices && data.choices[0] && data.choices[0].message
    ? String(data.choices[0].message.content || '')
    : '';
  if (!text) throw new Error('Provider returned an empty answer');
  return { text, provider: spec.id, model: spec.model };
}

function providerSpecs(cfg) {
  const specs = [];
  if (cfg.ai.openrouterKey) {
    specs.push({
      id: 'openrouter',
      model: cfg.ai.openrouterModel,
      key: cfg.ai.openrouterKey,
      base: 'https://openrouter.ai/api/v1',
      extraHeaders: { 'HTTP-Referer': 'https://taxmitra.in', 'X-Title': 'TaxMitra AI Enterprise' },
    });
  }
  if (cfg.ai.groqKey) {
    specs.push({ id: 'groq', model: cfg.ai.groqModel, key: cfg.ai.groqKey, base: 'https://api.groq.com/openai/v1' });
  }
  if (cfg.ai.openaiKey) {
    specs.push({ id: 'openai', model: cfg.ai.openaiModel, key: cfg.ai.openaiKey, base: cfg.ai.openaiBase });
  }
  return specs;
}

/* ------------------------------------------------------------------ Chat */

function sanitiseMessages(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m) => m && typeof m === 'object' && typeof m.content === 'string')
    .slice(-12)
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 6000),
    }))
    .filter((m) => m.content.trim().length > 0);
}

async function chat(cfg, messages) {
  const errors = [];

  if (cfg.ai.geminiKey) {
    try {
      return await geminiChat(cfg, messages);
    } catch (e) {
      errors.push('gemini: ' + e.message);
    }
  }

  for (const spec of providerSpecs(cfg)) {
    try {
      return await openAiCompatible(cfg, spec, messages);
    } catch (e) {
      errors.push(spec.id + ': ' + e.message);
    }
  }

  if (!errors.length) {
    const err = new Error('No AI provider key is configured on this server.');
    err.code = 'AI_NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }

  const err = new Error('Every configured AI provider failed. ' + errors.join(' | ').slice(0, 400));
  err.code = 'AI_UPSTREAM_FAILED';
  err.status = 502;
  throw err;
}

module.exports = {
  FALLBACK_SYSTEM_PROMPT,
  loadSystemPrompt,
  providerStatus,
  normaliseModelName,
  geminiPassThrough,
  openRouterPassThrough,
  openAiCompatible,
  providerSpecs,
  sanitiseMessages,
  chat,
  withTimeout,
};
