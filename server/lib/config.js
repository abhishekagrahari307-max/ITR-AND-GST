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

    email: {
      driver: (env.EMAIL_DRIVER || 'console').toLowerCase(),
      from: env.EMAIL_FROM || 'TaxMitra <no-reply@taxmitra.local>',
      apiKey: env.EMAIL_API_KEY || '',
      smtpHost: env.SMTP_HOST || '',
      smtpPort: int(env.SMTP_PORT, 587),
      smtpSecure: bool(env.SMTP_SECURE, false),
      smtpStarttls: bool(env.SMTP_STARTTLS, true),
      smtpUser: env.SMTP_USER || '',
      smtpPass: env.SMTP_PASS || '',
      smtpAuth: (env.SMTP_AUTH || 'LOGIN').toUpperCase(),
    },

    oauth: {
      baseUrl: (env.OAUTH_BASE_URL || '').replace(/\/$/, ''),
      githubClientId: env.GITHUB_OAUTH_CLIENT_ID || '',
      githubSecret: env.GITHUB_OAUTH_CLIENT_SECRET || '',
      googleClientId: env.GOOGLE_OAUTH_CLIENT_ID || '',
      googleSecret: env.GOOGLE_OAUTH_CLIENT_SECRET || '',
      stateMinutes: int(env.OAUTH_STATE_MINUTES, 10),
      codeMinutes: int(env.OAUTH_CODE_MINUTES, 2),
    },

    webauthn: {
      rpId: env.WEBAUTHN_RP_ID || '',            // hostname only, no scheme or port
      rpName: env.WEBAUTHN_RP_NAME || 'TaxMitra',
      origins: list(env.WEBAUTHN_ORIGINS),       // full origins, e.g. https://taxmitra.in
      challengeMinutes: int(env.WEBAUTHN_CHALLENGE_MINUTES, 5),
      requireUserVerification: bool(env.WEBAUTHN_REQUIRE_UV, true),
      recoveryHours: int(env.RECOVERY_HOURS, 24),
    },

    limits: {
      registerPerHour: int(env.REGISTER_PER_HOUR, 10),
      loginPer15Min: int(env.LOGIN_PER_15MIN, 20),
      forgotPerHour: int(env.FORGOT_PER_HOUR, 10),
      apiPerMinute: int(env.API_PER_MINUTE, 600),
    },

    security: {
      requireVerifiedForSync: bool(env.REQUIRE_VERIFIED_EMAIL, false),
      verifyTokenMinutes: int(env.VERIFY_TOKEN_MINUTES, 60),
      resetTokenMinutes: int(env.RESET_TOKEN_MINUTES, 30),
      totpIssuer: env.TOTP_ISSUER || 'TaxMitra',
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
  if (cfg.email.driver !== 'console' && !require('./email').isConfigured(cfg)) {
    out.push('EMAIL_DRIVER=' + cfg.email.driver + ' but its credentials are missing – verification and reset mails cannot be sent.');
  }
  if (!cfg.oauth.baseUrl) {
    out.push('OAUTH_BASE_URL is empty – OAuth callbacks would be built against an unknown origin, so GitHub/Google sign-in stays off until it is set.');
  }
  if (!cfg.govt.gstClientId || !cfg.govt.gstClientSecret) {
    out.push('No GSTN/GSP credentials set – the government endpoints answer 501 instead of pretending to file.');
  }
  return out;
}

module.exports = { load, warnings };
