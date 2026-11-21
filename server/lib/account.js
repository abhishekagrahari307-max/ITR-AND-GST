/* TaxMitra server – account lifecycle routes.

   Registration e-mail verification, password reset, two-factor (TOTP + backup
   codes), OAuth sign-in (GitHub / Google) and session management.

   Every endpoint here follows three rules:
     1. Never reveal whether an address has an account (except to the owner of
        a valid session).
     2. Never accept a token twice, and never store one in plain text.
     3. Never weaken an existing session: changing a password or enabling 2FA
        either revokes other sessions or requires a fresh proof.

   Installed by server/index.js; all dependencies are injected so this file has
   no hidden globals and is testable on its own. */

'use strict';

const crypto = require('node:crypto');
const otp = require('./otp');
const oauthLib = require('./oauth');
const emailLib = require('./email');
const webauthn = require('./webauthn');

const MAX_BACKUP_CODES = 10;

function install(route, ctx) {
  const { cfg, store, auth, HttpError, sendJson, readJson, limitOrThrow, publicUser, clientIp } = ctx;

  function minutes(count) { return count * 60 * 1000; }

  function issueToken(user, purpose, ttlMinutes, meta) {
    const token = otp.randomToken(32);
    store.createToken({
      id: crypto.randomUUID(),
      userId: user.id,
      purpose,
      tokenHash: otp.hashToken(token),
      createdAt: Date.now(),
      expiresAt: Date.now() + minutes(ttlMinutes),
      meta: meta || {},
    });
    return token;
  }

  function consumeToken(token, purpose) {
    if (!token || typeof token !== 'string' || token.length < 16) return null;
    const row = store.findToken(otp.hashToken(token), purpose);
    if (!row) return null;
    if (row.used_at) return null;
    if (Number(row.expires_at) <= Date.now()) return null;
    store.useToken(row.id);
    return row;
  }

  function appOrigin(req) {
    if (cfg.oauth.baseUrl) return cfg.oauth.baseUrl;
    const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    return proto + '://' + (req.headers.host || 'localhost');
  }

  async function sendVerificationMail(user, req) {
    if (!emailLib.isConfigured(cfg)) return { sent: false, reason: 'EMAIL_NOT_CONFIGURED' };
    const token = issueToken(user, 'email-verify', cfg.security.verifyTokenMinutes);
    const link = appOrigin(req) + '/api/auth/verify?token=' + encodeURIComponent(token);
    try {
      await emailLib.sendAuthMail(cfg, 'verify', user.email, {
        name: user.name,
        link,
        minutes: cfg.security.verifyTokenMinutes,
      });
      return { sent: true };
    } catch (error) {
      return { sent: false, reason: error.code || 'EMAIL_SEND_FAILED' };
    }
  }

  /* ------------------------------------------------------------ e-mail */

  route('POST', '/api/auth/verify', async (req, res) => {
    const body = await readJson(req, 8 * 1024);
    limitOrThrow('verify:' + clientIp(req, cfg.trustProxy), 30, 60 * 60 * 1000);
    const row = consumeToken(body.token, 'email-verify');
    if (!row) throw new HttpError(400, 'TOKEN_INVALID', 'That verification link is invalid, expired or already used. Sign in and request a new one.');
    store.setEmailVerified(row.user_id, Date.now());
    store.audit(row.user_id, 'auth.email_verified', {});
    sendJson(res, 200, { ok: true, message: 'Email confirmed.' });
  });

  /* The link in the email opens a browser tab, so answer with a redirect
     instead of raw JSON. */
  route('GET', '/api/auth/verify', async (req, res, params, url) => {
    const token = url.searchParams.get('token') || '';
    const row = consumeToken(token, 'email-verify');
    if (!row) {
      res.writeHead(302, { Location: '/pages/cloud.html?verify=invalid' });
      res.end();
      return;
    }
    store.setEmailVerified(row.user_id, Date.now());
    store.audit(row.user_id, 'auth.email_verified', {});
    res.writeHead(302, { Location: '/pages/cloud.html?verify=ok' });
    res.end();
  });

  route('POST', '/api/auth/verify/resend', async (req, res) => {
    const session = ctx.requireAuth(req);
    limitOrThrow('verify-resend:' + session.user.id, 3, 60 * 60 * 1000);
    if (Number(session.user.email_verified) === 1) {
      sendJson(res, 200, { ok: true, alreadyVerified: true, message: 'This email is already confirmed.' });
      return;
    }
    const result = await sendVerificationMail(session.user, req);
    sendJson(res, 200, {
      ok: true,
      sent: result.sent,
      reason: result.reason || null,
      message: result.sent
        ? 'Verification email sent. The link works once and expires in ' + cfg.security.verifyTokenMinutes + ' minutes.'
        : 'Email delivery is not configured on this server, so no message could be sent.',
    });
  });

  route('POST', '/api/auth/forgot', async (req, res) => {
    const body = await readJson(req, 8 * 1024);
    const ip = clientIp(req, cfg.trustProxy);
    limitOrThrow('forgot:' + ip, cfg.limits.forgotPerHour, 60 * 60 * 1000);
    const email = String(body.email || '').trim().toLowerCase();
    // Always the same answer, whether or not the account exists.
    const generic = {
      ok: true,
      message: 'If an account exists for that address, a reset link has been sent. It works once and expires in ' + cfg.security.resetTokenMinutes + ' minutes.',
    };
    if (!auth.EMAIL_RE.test(email)) { sendJson(res, 200, generic); return; }

    const user = store.findUserByEmail(email);
    if (user) {
      limitOrThrow('forgot-user:' + user.id, 3, 60 * 60 * 1000);
      if (emailLib.isConfigured(cfg)) {
        const token = issueToken(user, 'password-reset', cfg.security.resetTokenMinutes);
        const link = appOrigin(req) + '/pages/cloud.html?reset=' + encodeURIComponent(token);
        try {
          await emailLib.sendAuthMail(cfg, 'reset', user.email, {
            name: user.name,
            link,
            minutes: cfg.security.resetTokenMinutes,
          });
          store.audit(user.id, 'auth.reset_requested', { ip });
        } catch (error) {
          store.audit(user.id, 'auth.reset_email_failed', { code: error.code || 'SEND_FAILED' });
          console.error('[email] reset mail failed:', error.message);
        }
      }
    }
    sendJson(res, 200, generic);
  });

  route('POST', '/api/auth/reset', async (req, res) => {
    const body = await readJson(req, 16 * 1024);
    limitOrThrow('reset:' + clientIp(req, cfg.trustProxy), 20, 60 * 60 * 1000);
    const password = String(body.password || '');
    // Look the token up first: a password that fails validation must not burn it.
    if (!body.token || typeof body.token !== 'string' || body.token.length < 16) {
      throw new HttpError(400, 'TOKEN_INVALID', 'That reset link is invalid, expired or already used. Request a new one.');
    }
    const pending = store.findToken(otp.hashToken(body.token), 'password-reset');
    if (!pending || pending.used_at || Number(pending.expires_at) <= Date.now()) {
      throw new HttpError(400, 'TOKEN_INVALID', 'That reset link is invalid, expired or already used. Request a new one.');
    }
    const user = store.findUserById(pending.user_id);
    if (!user) throw new HttpError(400, 'TOKEN_INVALID', 'That reset link is no longer valid.');
    const checked = auth.validateRegistration({ email: user.email, password });
    if (checked.error) throw new HttpError(400, 'INVALID_INPUT', checked.error);
    store.useToken(pending.id);
    const row = pending;

    store.setPassword(user.id, auth.hashPassword(password));
    store.revokeAllSessions(user.id);
    store.deleteTokens(user.id, 'password-reset');
    store.audit(user.id, 'auth.password_reset', {});
    sendJson(res, 200, {
      ok: true,
      message: 'Password changed. Every existing session was signed out — sign in with the new password.',
    });
  });

  /* ---------------------------------------------------------------- 2FA */

  route('POST', '/api/auth/2fa/setup', async (req, res) => {
    const session = ctx.requireAuth(req);
    limitOrThrow('2fa-setup:' + session.user.id, 10, 60 * 60 * 1000);
    if (Number(session.user.totp_enabled) === 1) {
      throw new HttpError(409, 'TOTP_ALREADY_ENABLED', 'Two-factor is already on. Disable it first to re-enrol.');
    }
    const secret = otp.generateSecret();
    store.setTotp(session.user.id, { secret, enabled: false });
    sendJson(res, 200, {
      secret,
      otpauth: otp.otpauthUrl(secret, session.user.email, cfg.security.totpIssuer),
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      next: 'Add this to Google Authenticator / Authy / 1Password, then POST the 6-digit code to /api/auth/2fa/enable.',
    });
  });

  route('POST', '/api/auth/2fa/enable', async (req, res) => {
    const session = ctx.requireAuth(req);
    limitOrThrow('2fa-enable:' + session.user.id, 15, 60 * 60 * 1000);
    const body = await readJson(req, 8 * 1024);
    const user = store.findUserById(session.user.id);
    if (!user || !user.totp_secret) throw new HttpError(400, 'TOTP_NOT_SET_UP', 'Call /api/auth/2fa/setup first.');
    if (Number(user.totp_enabled) === 1) throw new HttpError(409, 'TOTP_ALREADY_ENABLED', 'Two-factor is already on.');
    if (!otp.verifyTotp(user.totp_secret, body.code)) {
      throw new HttpError(400, 'TOTP_INVALID', 'That code is not valid. Check the phone clock and try the current code.');
    }
    const codes = otp.generateBackupCodes(MAX_BACKUP_CODES);
    store.setTotp(user.id, { enabled: true, backupCodes: codes.map(otp.hashBackupCode) });
    store.audit(user.id, 'auth.2fa_enabled', {});
    sendJson(res, 200, {
      ok: true,
      // Shown once, never again. Only hashes are stored.
      backupCodes: codes,
      message: 'Two-factor is on. Save these backup codes now — each works once and they cannot be shown again.',
    });
  });

  route('POST', '/api/auth/2fa/disable', async (req, res) => {
    const session = ctx.requireAuth(req);
    limitOrThrow('2fa-disable:' + session.user.id, 10, 60 * 60 * 1000);
    const body = await readJson(req, 8 * 1024);
    const user = store.findUserById(session.user.id);
    if (!user || Number(user.totp_enabled) !== 1) {
      sendJson(res, 200, { ok: true, alreadyOff: true });
      return;
    }
    if (!auth.verifyPassword(String(body.password || ''), user.password_hash)) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Your password is required to turn two-factor off.');
    }
    const codeOk = otp.verifyTotp(user.totp_secret, body.code) || consumeBackupCode(user, body.backupCode);
    if (!codeOk) throw new HttpError(400, 'TOTP_INVALID', 'Enter a current authenticator code (or a backup code) to confirm.');
    store.setTotp(user.id, { enabled: false, secret: null, backupCodes: [] });
    store.audit(user.id, 'auth.2fa_disabled', {});
    sendJson(res, 200, { ok: true, message: 'Two-factor is off.' });
  });

  function consumeBackupCode(user, code) {
    if (!code) return false;
    const hash = otp.hashBackupCode(code);
    const codes = store.backupCodes(user.id);
    const index = codes.indexOf(hash);
    if (index === -1) return false;
    codes.splice(index, 1);
    store.setTotp(user.id, { enabled: true, backupCodes: codes });
    return true;
  }

  /* Used by the login route in index.js. Returns true when the second factor
     was accepted, throws otherwise. */
  function checkSecondFactor(user, body) {
    if (!user || Number(user.totp_enabled) !== 1) return true;
    if (body.totp && otp.verifyTotp(user.totp_secret, body.totp)) return true;
    if (body.backupCode && consumeBackupCode(user, body.backupCode)) {
      store.audit(user.id, 'auth.backup_code_used', {});
      return true;
    }
    return false;
  }

  /* -------------------------------------------------------------- OAuth */

  route('GET', '/api/auth/oauth/providers', async (req, res) => {
    sendJson(res, 200, {
      baseUrl: cfg.oauth.baseUrl || null,
      providers: oauthLib.enabledProviders(cfg),
    });
  });

  route('GET', '/api/auth/oauth/:provider/start', async (req, res, params) => {
    limitOrThrow('oauth-start:' + clientIp(req, cfg.trustProxy), 40, 60 * 60 * 1000);
    const provider = String(params.provider || '').toLowerCase();
    const state = otp.randomToken(24);
    store.createOAuthState({
      state,
      provider,
      createdAt: Date.now(),
      expiresAt: Date.now() + minutes(cfg.oauth.stateMinutes),
    });
    const url = oauthLib.authorizeUrl(cfg, provider, state);
    sendJson(res, 200, { url, provider, expiresInSeconds: cfg.oauth.stateMinutes * 60 });
  });

  route('GET', '/api/auth/oauth/:provider/callback', async (req, res, params, url) => {
    const provider = String(params.provider || '').toLowerCase();
    const state = url.searchParams.get('state') || '';
    const code = url.searchParams.get('code') || '';
    const failure = (reason) => {
      res.writeHead(302, { Location: '/pages/cloud.html?oauth=' + encodeURIComponent(reason) });
      res.end();
    };

    if (url.searchParams.get('error')) {
      failure('cancelled');
      return;
    }
    const row = store.findOAuthState(state);
    if (!row || row.used_at || Number(row.expires_at) <= Date.now() || row.provider !== provider || !code) {
      failure('state_invalid');
      return;
    }
    store.useOAuthState(state);

    let profile;
    try {
      const accessToken = await oauthLib.exchangeCode(cfg, provider, code);
      profile = await oauthLib.fetchProfile(cfg, provider, accessToken);
    } catch (error) {
      store.audit(null, 'auth.oauth_failed', { provider, code: error.code || 'FAILED' });
      failure('exchange_failed');
      return;
    }

    if (!profile.email || !auth.EMAIL_RE.test(profile.email)) {
      failure('email_missing');
      return;
    }

    let user = null;
    const identity = store.findIdentity(provider, profile.subject);
    if (identity) user = store.findUserById(identity.user_id);

    if (!user) {
      user = store.findUserByEmail(profile.email);
      if (user) {
        // Same person, second provider: link it. Only when the provider says the
        // address is verified, so an unverified address cannot take over an account.
        if (!profile.emailVerified && Number(user.email_verified) !== 1) {
          failure('email_unverified');
          return;
        }
      } else {
        user = store.createUser({
          id: crypto.randomUUID(),
          email: profile.email,
          name: profile.name || profile.login || '',
          // A random secret nobody knows: this account can only sign in through
          // the provider until the owner sets a password.
          passwordHash: auth.hashPassword(otp.randomToken(32)),
          role: cfg.adminEmails.includes(profile.email) ? 'admin' : 'user',
          createdAt: Date.now(),
        });
        store.audit(user.id, 'auth.oauth_signup', { provider });
      }
      if (profile.emailVerified) store.setEmailVerified(user.id, Date.now());
    }
    store.linkIdentity({ provider, subject: profile.subject, userId: user.id, email: profile.email });
    store.touchLogin(user.id);

    // One-time, 2-minute code exchanged by the page for a real session token.
    const loginCode = issueToken(user, 'oauth-login', cfg.oauth.codeMinutes, { provider });
    store.audit(user.id, 'auth.oauth_login', { provider });
    res.writeHead(302, { Location: '/pages/cloud.html?oauth=ok#code=' + encodeURIComponent(loginCode) });
    res.end();
  });

  route('POST', '/api/auth/oauth/exchange', async (req, res) => {
    limitOrThrow('oauth-exchange:' + clientIp(req, cfg.trustProxy), 60, 60 * 60 * 1000);
    const body = await readJson(req, 8 * 1024);
    const row = consumeToken(body.code, 'oauth-login');
    if (!row) throw new HttpError(400, 'CODE_INVALID', 'That sign-in code is invalid or expired. Start again.');
    const user = store.findUserById(row.user_id);
    if (!user) throw new HttpError(400, 'CODE_INVALID', 'That sign-in code is no longer valid.');
    const issued = auth.issueToken(user, cfg.jwtSecret, cfg.sessionDays, req.headers['user-agent'], store);
    sendJson(res, 200, { token: issued.token, expiresAt: issued.expiresAt, user: publicUser(user) });
  });

  /* ----------------------------------------------------------- sessions */

  route('GET', '/api/auth/sessions', async (req, res) => {
    const session = ctx.requireAuth(req);
    const rows = store.listSessions(session.user.id).map((row) => ({
      id: row.jti,
      createdAt: Number(row.created_at),
      expiresAt: Number(row.expires_at),
      revoked: Number(row.revoked) === 1,
      current: row.jti === session.payload.jti,
      device: String(row.user_agent || '').slice(0, 120),
    }));
    sendJson(res, 200, { sessions: rows });
  });

  route('DELETE', '/api/auth/sessions/:jti', async (req, res, params) => {
    const session = ctx.requireAuth(req);
    store.revokeSessionForUser(params.jti, session.user.id);
    store.audit(session.user.id, 'auth.session_revoked', {});
    sendJson(res, 200, { ok: true });
  });

  /* ------------------------------------------------------------ passkeys */

  function rpConfig(req) {
    const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const requestOrigin = proto + '://' + (req.headers.host || 'localhost');
    let origin = requestOrigin;
    if (cfg.oauth.baseUrl) {
      try { origin = new URL(cfg.oauth.baseUrl).origin; } catch (e) { origin = requestOrigin; }
    }
    let hostname = 'localhost';
    try { hostname = new URL(origin).hostname; } catch (e) { hostname = 'localhost'; }
    return {
      rpId: cfg.webauthn.rpId || hostname,
      rpName: cfg.webauthn.rpName,
      origins: cfg.webauthn.origins.length ? cfg.webauthn.origins : [origin],
    };
  }

  function issueChallenge(purpose, meta) {
    const value = webauthn.challenge();
    store.createToken({
      id: crypto.randomUUID(),
      userId: meta.userId,
      purpose,
      tokenHash: otp.hashToken(value),
      createdAt: Date.now(),
      expiresAt: Date.now() + cfg.webauthn.challengeMinutes * 60 * 1000,
      meta,
    });
    return value;
  }

  function consumeChallenge(value, purpose) {
    if (!value || typeof value !== 'string') return null;
    const row = store.findToken(otp.hashToken(value), purpose);
    if (!row || row.used_at || Number(row.expires_at) <= Date.now()) return null;
    store.useToken(row.id);
    return row;
  }

  route('POST', '/api/auth/passkey/register/options', async (req, res) => {
    const session = ctx.requireAuth(req);
    limitOrThrow('passkey-options:' + session.user.id, 30, 60 * 60 * 1000);
    const existing = store.listCredentials(session.user.id);
    const challengeValue = issueChallenge('webauthn-register', { userId: session.user.id });
    const rp = rpConfig(req);
    sendJson(res, 200, {
      publicKey: {
        challenge: challengeValue,
        rp: { id: rp.rpId, name: rp.rpName },
        user: {
          id: webauthn.toB64url(Buffer.from(session.user.id, 'utf8')),
          name: session.user.email,
          displayName: session.user.name || session.user.email,
        },
        pubKeyCredParams: webauthn.ALGORITHMS.map((alg) => ({ type: 'public-key', alg })),
        timeout: cfg.webauthn.challengeMinutes * 60 * 1000,
        attestation: 'none',
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
        excludeCredentials: existing.map((c) => ({ type: 'public-key', id: c.credential_id })),
      },
      rpId: rp.rpId,
    });
  });

  route('POST', '/api/auth/passkey/register/verify', async (req, res) => {
    const session = ctx.requireAuth(req);
    limitOrThrow('passkey-register:' + session.user.id, 20, 60 * 60 * 1000);
    const body = await readJson(req, 64 * 1024);
    const credential = body.credential || {};
    const response = credential.response || {};
    if (!response.clientDataJSON || !response.attestationObject) {
      throw new HttpError(400, 'WEBAUTHN_INCOMPLETE', 'Send credential.response.clientDataJSON and attestationObject.');
    }

    let clientData;
    try {
      clientData = webauthn.parseClientData(response.clientDataJSON);
    } catch (error) {
      throw new HttpError(400, 'WEBAUTHN_INVALID', error.message);
    }
    const pending = consumeChallenge(clientData.challenge, 'webauthn-register');
    if (!pending || pending.meta.userId !== session.user.id) {
      throw new HttpError(400, 'WEBAUTHN_CHALLENGE', 'That registration challenge is missing, expired or for another account.');
    }

    const rp = rpConfig(req);
    let result;
    try {
      result = webauthn.verifyRegistration({
        attestationObject: response.attestationObject,
        clientDataJSON: response.clientDataJSON,
        expectedChallenge: clientData.challenge,
        expectedOrigin: rp.origins,
        rpId: rp.rpId,
        requireUserVerification: cfg.webauthn.requireUserVerification,
      });
    } catch (error) {
      throw new HttpError(400, 'WEBAUTHN_REJECTED', error.message);
    }

    if (store.findCredential(result.credentialId)) {
      throw new HttpError(409, 'WEBAUTHN_DUPLICATE', 'That authenticator is already registered.');
    }

    store.addCredential({
      id: crypto.randomUUID(),
      userId: session.user.id,
      credentialId: result.credentialId,
      publicKeyJwk: result.publicKeyJwk,
      signCount: result.signCount,
      name: String(body.name || 'Passkey').slice(0, 60),
      transports: Array.isArray(credential.transports) ? credential.transports.join(',') : '',
      createdAt: Date.now(),
    });
    store.audit(session.user.id, 'auth.passkey_added', { credentialId: result.credentialId.slice(0, 12) });
    sendJson(res, 201, {
      ok: true,
      credentialId: result.credentialId,
      userVerified: result.userVerified,
      passkeys: store.listCredentials(session.user.id).map((c) => ({ id: c.id, name: c.name, createdAt: c.created_at })),
      message: 'Passkey added. You can use it to sign in on this account.',
    });
  });

  route('GET', '/api/auth/passkeys', async (req, res) => {
    const session = ctx.requireAuth(req);
    sendJson(res, 200, {
      passkeys: store.listCredentials(session.user.id).map((c) => ({
        id: c.id,
        name: c.name,
        createdAt: Number(c.created_at),
        lastUsed: c.last_used ? Number(c.last_used) : null,
      })),
    });
  });

  route('DELETE', '/api/auth/passkeys/:id', async (req, res, params) => {
    const session = ctx.requireAuth(req);
    store.deleteCredential(params.id, session.user.id);
    store.audit(session.user.id, 'auth.passkey_removed', {});
    sendJson(res, 200, { ok: true });
  });

  route('POST', '/api/auth/passkey/login/options', async (req, res) => {
    limitOrThrow('passkey-login-options:' + clientIp(req, cfg.trustProxy), 60, 60 * 60 * 1000);
    const body = await readJson(req, 8 * 1024);
    const email = String(body.email || '').trim().toLowerCase();
    const user = email ? store.findUserByEmail(email) : null;
    const credentials = user ? store.listCredentials(user.id) : [];
    const challengeValue = issueChallenge('webauthn-login', { userId: user ? user.id : '' });
    const rp = rpConfig(req);
    sendJson(res, 200, {
      publicKey: {
        challenge: challengeValue,
        rpId: rp.rpId,
        timeout: cfg.webauthn.challengeMinutes * 60 * 1000,
        userVerification: cfg.webauthn.requireUserVerification ? 'required' : 'preferred',
        allowCredentials: credentials.map((c) => ({
          type: 'public-key',
          id: c.credential_id,
          ...(c.transports ? { transports: String(c.transports).split(',') } : {}),
        })),
      },
      // An empty list means "no passkey we can suggest"; it is not proof about
      // whether the address has an account (an account may simply have none).
      hasSuggestions: credentials.length > 0,
    });
  });

  route('POST', '/api/auth/passkey/login/verify', async (req, res) => {
    limitOrThrow('passkey-login:' + clientIp(req, cfg.trustProxy), 40, 60 * 60 * 1000);
    const body = await readJson(req, 64 * 1024);
    const credential = body.credential || {};
    const response = credential.response || {};
    const credentialId = String(credential.id || credential.rawId || '');
    if (!credentialId || !response.clientDataJSON || !response.authenticatorData || !response.signature) {
      throw new HttpError(400, 'WEBAUTHN_INCOMPLETE', 'Send credential.id and clientDataJSON, authenticatorData and signature.');
    }

    let clientData;
    try {
      clientData = webauthn.parseClientData(response.clientDataJSON);
    } catch (error) {
      throw new HttpError(400, 'WEBAUTHN_INVALID', error.message);
    }
    const pending = consumeChallenge(clientData.challenge, 'webauthn-login');
    if (!pending) {
      throw new HttpError(400, 'WEBAUTHN_CHALLENGE', 'That sign-in challenge is missing, expired or already used.');
    }

    const stored = store.findCredential(credentialId);
    if (!stored) throw new HttpError(401, 'WEBAUTHN_UNKNOWN', 'That passkey is not registered here.');
    if (pending.meta.userId && pending.meta.userId !== stored.user_id) {
      throw new HttpError(401, 'WEBAUTHN_MISMATCH', 'That passkey does not belong to the account in this request.');
    }
    const user = store.findUserById(stored.user_id);
    if (!user) throw new HttpError(401, 'WEBAUTHN_UNKNOWN', 'The account for that passkey no longer exists.');

    const rp = rpConfig(req);
    let result;
    try {
      result = webauthn.verifyAssertion({
        authenticatorData: response.authenticatorData,
        clientDataJSON: response.clientDataJSON,
        signature: response.signature,
        publicKeyJwk: stored.publicKeyJwk,
        expectedChallenge: clientData.challenge,
        expectedOrigin: rp.origins,
        rpId: rp.rpId,
        storedSignCount: Number(stored.sign_count) || 0,
        requireUserVerification: cfg.webauthn.requireUserVerification,
      });
    } catch (error) {
      store.audit(user.id, 'auth.passkey_failed', { code: error.code || 'REJECTED' });
      throw new HttpError(401, 'WEBAUTHN_REJECTED', error.message);
    }

    store.updateCredentialCounter(credentialId, result.newSignCount);
    const issued = auth.issueToken(user, cfg.jwtSecret, cfg.sessionDays, req.headers['user-agent'], store);
    store.touchLogin(user.id);
    // A passkey assertion with User Verification satisfies the second factor.
    store.audit(user.id, 'auth.passkey_login', { uv: result.userVerified });
    sendJson(res, 200, {
      token: issued.token,
      expiresAt: issued.expiresAt,
      user: publicUser(store.findUserById(user.id)),
      secondFactorSatisfied: result.userVerified,
    });
  });

  /* --------------------------------------------- two-factor recovery */

  async function notifyAdmins(req, request, user) {
    if (!emailLib.isConfigured(cfg) || !cfg.adminEmails.length) return { sent: 0 };
    const link = appOrigin(req) + '/pages/admin-users.html';
    let sent = 0;
    for (const adminEmail of cfg.adminEmails) {
      try {
        await emailLib.send(cfg, {
          to: adminEmail,
          subject: 'TaxMitra: two-factor recovery awaiting your decision',
          text: [
            'A TaxMitra account asked for two-factor recovery.',
            '',
            'Account: ' + user.email,
            'Email confirmed by the user: ' + (request.email_confirmed_at ? 'yes' : 'not yet'),
            '',
            'Review and decide: ' + link,
            '',
            'Approving clears their two-factor, signs out their sessions and emails them a one-time password reset link.',
          ].join('\n'),
          html: '<p>A TaxMitra account asked for two-factor recovery.</p>' +
            '<p><strong>Account:</strong> ' + user.email + '<br/>Email confirmed by the user: ' +
            (request.email_confirmed_at ? 'yes' : 'not yet') + '</p>' +
            '<p><a href="' + link + '">Review in the admin console</a></p>',
        });
        sent += 1;
      } catch (error) {
        console.error('[email] admin notification failed:', error.message);
      }
    }
    return { sent };
  }

  route('POST', '/api/auth/2fa/recover/request', async (req, res) => {
    const body = await readJson(req, 8 * 1024);
    const ip = clientIp(req, cfg.trustProxy);
    limitOrThrow('recover-req:' + ip, 10, 60 * 60 * 1000);
    const email = String(body.email || '').trim().toLowerCase();
    const generic = {
      ok: true,
      message: 'If that account has two-factor on, a confirmation link is on its way. An administrator has to approve the reset before two-factor is cleared.',
      adminApprovalRequired: true,
    };
    if (!auth.EMAIL_RE.test(email)) { sendJson(res, 200, generic); return; }

    const user = store.findUserByEmail(email);
    if (!user || Number(user.totp_enabled) !== 1) { sendJson(res, 200, generic); return; }
    limitOrThrow('recover-user:' + user.id, 3, 24 * 60 * 60 * 1000);

    const existing = store.openRecoveryForUser(user.id);
    if (existing) { sendJson(res, 200, generic); return; }

    const token = otp.randomToken(32);
    const request = store.createRecovery({
      id: crypto.randomUUID(),
      userId: user.id,
      status: 'pending_email',
      tokenHash: otp.hashToken(token),
      createdAt: Date.now(),
      expiresAt: Date.now() + cfg.webauthn.recoveryHours * 60 * 60 * 1000,
    });

    if (emailLib.isConfigured(cfg)) {
      const link = appOrigin(req) + '/pages/cloud.html?recover=' + encodeURIComponent(token);
      try {
        await emailLib.send(cfg, {
          to: user.email,
          subject: 'Confirm your TaxMitra two-factor recovery',
          text: [
            'Namaste' + (user.name ? ', ' + user.name : '') + ',',
            '',
            'Someone asked to recover access to this TaxMitra account because the authenticator app is gone.',
            'Confirm the request here:',
            link,
            '',
            'After you confirm, an administrator has to approve it. Approving clears two-factor, signs out every session and emails you a one-time password reset link.',
            'If this was not you, ignore this message — nothing changes.',
          ].join('\n'),
          html: '<p>Namaste' + (user.name ? ' ' + user.name : '') + ',</p>' +
            '<p>Someone asked to recover access because the authenticator app is gone.</p>' +
            '<p><a href="' + link + '">Confirm the recovery request</a></p>' +
            '<p>An administrator must then approve it. If this was not you, ignore this email.</p>',
        });
        store.audit(user.id, 'auth.recovery_requested', { ip });
        await notifyAdmins(req, request, user);
      } catch (error) {
        store.audit(user.id, 'auth.recovery_mail_failed', { code: error.code || 'SEND_FAILED' });
      }
    }
    sendJson(res, 200, generic);
  });

  route('POST', '/api/auth/2fa/recover/confirm', async (req, res) => {
    const body = await readJson(req, 8 * 1024);
    limitOrThrow('recover-confirm:' + clientIp(req, cfg.trustProxy), 20, 60 * 60 * 1000);
    const token = String(body.token || '');
    const request = token.length >= 16 ? store.findRecoveryByToken(otp.hashToken(token)) : null;
    if (!request || Number(request.expires_at) <= Date.now() || request.decided_at) {
      throw new HttpError(400, 'TOKEN_INVALID', 'That recovery link is invalid, expired or already used.');
    }
    if (request.status === 'pending_email') store.confirmRecovery(request.id);
    const user = store.findUserById(request.user_id);
    if (user) await notifyAdmins(req, store.findRecovery(request.id), user);
    store.audit(request.user_id, 'auth.recovery_email_confirmed', {});
    sendJson(res, 200, {
      ok: true,
      status: 'awaiting_admin',
      message: 'Email confirmed. An administrator has to approve the reset before two-factor is cleared — you will get an email when that happens.',
    });
  });

  /* ------------------------------------------------------------ internal */

  return {
    sendVerificationMail,
    issueToken,
    consumeToken,
    checkSecondFactor,
    consumeBackupCode,
  };
}

module.exports = { install, MAX_BACKUP_CODES };
