/* TaxMitra server – environment configuration.
   Every secret comes from the environment. Nothing is hardcoded, and nothing
   that looks like a credential is ever written to the repository. */

'use strict';

function bool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function list(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function load(env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';

  const cfg = {
    nodeEnv,
    isProd,
    host: env.HOST || '0.0.0.0',
    port: int(env.PORT, 3000),
    dataDir: env.DATA_DIR || 'data',
    rootDir: env.ROOT_DIR || '.',

    jwtSecret: env.JWT_SECRET || '',
    sessionDays: int(env.SESSION_DAYS, 30),

    bcryptNote: 'passwords are hashed with scrypt (node:crypto), never stored in plain text',

    allowedOrigins: list(env.ALLOWED_ORIGINS),
    trustProxy: bool(env.TRUST_PROXY, true),

    maxDocBytes: int(env.MAX_DOC_BYTES, 1024 * 1024),
    maxUserBytes: int(env.MAX_USER_BYTES, 20 * 1024 * 1024),
    maxBodyBytes: int(env.MAX_BODY_BYTES, 2 * 1024 * 1024),

    adminEmails: list(env.ADMIN_EMAILS).map((e) => e.toLowerCase()),

    ai: {
      geminiKey: env.GEMINI_API_KEY || '',
      openrouterKey: env.OPENROUTER_API_KEY || '',
      groqKey: env.GROQ_API_KEY || '',
      openaiKey: env.OPENAI_API_KEY || '',
      openaiBase: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
      geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
      openrouterModel: env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
      groqModel: env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      openaiModel: env.OPENAI_MODEL || 'gpt-4o-mini',
      timeoutMs: int(env.AI_TIMEOUT_MS, 45000),
      perHourPerIp: int(env.AI_PER_HOUR_PER_IP, 40),
      perDayGlobal: int(env.AI_PER_DAY_GLOBAL, 2000),
      maxTokens: int(env.AI_MAX_TOKENS, 2048),
      systemPromptFile: env.AI_SYSTEM_PROMPT_FILE || 'server/prompts/tax-system.txt',
    },

    govt: {
      irpEnv: env.IRP_ENV || 'sandbox', // sandbox | production
      irpBase: {
        sandbox: env.IRP_BASE_SANDBOX || 'https://einv-apisandbox.nic.in',
        production: env.IRP_BASE_PROD || 'https://api.einvoice1.gst.gov.in',
      },
      gstClientId: env.GSTN_CLIENT_ID || '',
      gstClientSecret: env.GSTN_CLIENT_SECRET || '',
      gstUsername: env.GSTN_USERNAME || '',
      gstPassword: env.GSTN_PASSWORD || '',
      gspBase: {
        sandbox: env.GSP_BASE_SANDBOX || 'https://gsp.adaequare.com/test',
        production: env.GSP_BASE_PROD || 'https://gsp.adaequare.com',
      },
      gspEnv: env.GSP_ENV || 'sandbox',
      timeoutMs: int(env.GOVT_TIMEOUT_MS, 30000),
    },
  };

  return cfg;
}

function warnings(cfg) {
  const out = [];
  if (!cfg.jwtSecret) {
    out.push(
      cfg.isProd
        ? 'JWT_SECRET is empty in production – refusing to start. Set a long random value.'
        : 'JWT_SECRET is empty – using an ephemeral development secret. Sessions will not survive a restart.'
    );
  } else if (cfg.jwtSecret.length < 32) {
    out.push('JWT_SECRET is shorter than 32 characters. Use: openssl rand -hex 32');
  }
  if (!cfg.ai.geminiKey && !cfg.ai.openrouterKey && !cfg.ai.groqKey && !cfg.ai.openaiKey) {
    out.push('No AI provider key set – /api/ai answers 503 and the site stays on its local rule engine.');
  }
  if (!cfg.govt.gstClientId || !cfg.govt.gstClientSecret) {
    out.push('No GSTN/GSP credentials set – the government endpoints answer 501 instead of pretending to file.');
  }
  return out;
}

module.exports = { load, warnings };
