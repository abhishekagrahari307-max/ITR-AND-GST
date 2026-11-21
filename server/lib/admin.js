/* TaxMitra server – administrator routes.

   Everything here is behind a server-side role check (`requireAdmin`), not a
   hidden button. An administrator can:
     • list accounts with real storage and security state
     • change a role
     • confirm an email on a user's behalf (audited)
     • reset a user's two-factor (audited, revokes that user's sessions)
     • delete an account and its data
     • approve or deny a two-factor recovery request

   Deliberate limits: admins cannot see passwords (they are hashed), cannot read
   another user's documents through these routes, and cannot demote or delete
   themselves by accident. */

'use strict';

const crypto = require('node:crypto');
const otp = require('./otp');
const emailLib = require('./email');

function install(route, ctx) {
  const { cfg, store, auth, HttpError, sendJson, readJson, limitOrThrow, publicUser, clientIp } = ctx;

  function requireAdmin(req) {
    const session = ctx.requireAuth(req);
    if (!session.user || session.user.role !== 'admin') {
      throw new HttpError(403, 'FORBIDDEN', 'Administrator access is required.');
    }
    return session;
  }

  function appOrigin(req) {
    if (cfg.oauth.baseUrl) return cfg.oauth.baseUrl;
    const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    return proto + '://' + (req.headers.host || 'localhost');
  }

  route('GET', '/api/admin/users', async (req, res) => {
    requireAdmin(req);
    const users = store.listUsers().map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      emailVerified: u.email_verified,
      twoFactor: u.two_factor,
      createdAt: Number(u.created_at),
      lastLogin: u.last_login ? Number(u.last_login) : null,
      documents: u.documents,
      bytes: u.bytes,
      passkeys: u.passkeys,
    }));
    sendJson(res, 200, { users, quota: cfg.maxUserBytes });
  });

  route('POST', '/api/admin/users/:id/role', async (req, res, params) => {
    const session = requireAdmin(req);
    const body = await readJson(req, 8 * 1024);
    const role = String(body.role || '');
    if (!['user', 'admin'].includes(role)) {
      throw new HttpError(400, 'INVALID_ROLE', 'role must be "user" or "admin".');
    }
    const target = store.findUserById(params.id);
    if (!target) throw new HttpError(404, 'NOT_FOUND', 'No such account.');
    if (target.id === session.user.id) {
      throw new HttpError(400, 'SELF_ROLE_CHANGE', 'Ask another administrator to change your own role.');
    }
    store.setRole(target.id, role);
    store.audit(session.user.id, 'admin.role_changed', { target: target.id, role });
    sendJson(res, 200, { ok: true, user: publicUser(store.findUserById(target.id)) });
  });

  route('POST', '/api/admin/users/:id/verify-email', async (req, res, params) => {
    const session = requireAdmin(req);
    const target = store.findUserById(params.id);
    if (!target) throw new HttpError(404, 'NOT_FOUND', 'No such account.');
    store.setEmailVerified(target.id, Date.now());
    store.audit(session.user.id, 'admin.email_verified', { target: target.id });
    sendJson(res, 200, { ok: true, user: publicUser(store.findUserById(target.id)) });
  });

  route('POST', '/api/admin/users/:id/reset-2fa', async (req, res, params) => {
    const session = requireAdmin(req);
    limitOrThrow('admin-2fa:' + session.user.id, 30, 60 * 60 * 1000);
    const target = store.findUserById(params.id);
    if (!target) throw new HttpError(404, 'NOT_FOUND', 'No such account.');
    store.setTotp(target.id, { enabled: false, secret: null, backupCodes: [] });
    store.revokeAllSessions(target.id);
    store.audit(session.user.id, 'admin.2fa_reset', { target: target.id });
    sendJson(res, 200, {
      ok: true,
      message: 'Two-factor was cleared and every session for that account was signed out.',
      user: publicUser(store.findUserById(target.id)),
    });
  });

  route('DELETE', '/api/admin/users/:id', async (req, res, params, url) => {
    const session = requireAdmin(req);
    const target = store.findUserById(params.id);
    if (!target) throw new HttpError(404, 'NOT_FOUND', 'No such account.');
    if (target.id === session.user.id) {
      throw new HttpError(400, 'SELF_DELETE', 'You cannot delete the account you are signed in with.');
    }
    const purgeDocs = url.searchParams.get('purge') === '1';
    store.deleteUser(target.id);
    store.audit(session.user.id, 'admin.user_deleted', { target: target.id, email: target.email, purgeDocs });
    sendJson(res, 200, { ok: true, deleted: target.id });
  });

  /* ---------------------------------------------------- 2FA recovery */

  route('GET', '/api/admin/recovery', async (req, res) => {
    requireAdmin(req);
    const requests = store.listOpenRecovery().map((r) => {
      const user = store.findUserById(r.user_id);
      return {
        id: r.id,
        email: user ? user.email : '(deleted account)',
        userId: r.user_id,
        status: r.status,
        createdAt: Number(r.created_at),
        expiresAt: Number(r.expires_at),
        emailConfirmedAt: r.email_confirmed_at ? Number(r.email_confirmed_at) : null,
        expired: Number(r.expires_at) <= Date.now(),
      };
    });
    sendJson(res, 200, { requests });
  });

  route('POST', '/api/admin/recovery/:id/approve', async (req, res, params) => {
    const session = requireAdmin(req);
    const request = store.findRecovery(params.id);
    if (!request) throw new HttpError(404, 'NOT_FOUND', 'No such recovery request.');
    if (request.decided_at) throw new HttpError(409, 'ALREADY_DECIDED', 'That request was already decided.');
    if (Number(request.expires_at) <= Date.now()) throw new HttpError(410, 'EXPIRED', 'That request has expired. Ask the user to start again.');
    if (request.status !== 'awaiting_admin') {
      throw new HttpError(409, 'EMAIL_NOT_CONFIRMED', 'The user has not confirmed the email link yet, so this cannot be approved.');
    }
    const user = store.findUserById(request.user_id);
    if (!user) throw new HttpError(404, 'NOT_FOUND', 'The account no longer exists.');

    store.setTotp(user.id, { enabled: false, secret: null, backupCodes: [] });
    store.revokeAllSessions(user.id);
    store.decideRecovery(request.id, 'approved', session.user.id, 'two-factor cleared, reset link issued');
    store.audit(session.user.id, 'admin.recovery_approved', { target: user.id });

    // A fresh single-use reset link: the user sets a new password and signs in.
    const token = otp.randomToken(32);
    store.createToken({
      id: crypto.randomUUID(),
      userId: user.id,
      purpose: 'password-reset',
      tokenHash: otp.hashToken(token),
      createdAt: Date.now(),
      expiresAt: Date.now() + cfg.security.resetTokenMinutes * 60 * 1000,
      meta: { via: 'admin-recovery' },
    });
    const link = appOrigin(req) + '/pages/cloud.html?reset=' + encodeURIComponent(token);

    let mail = { sent: false, reason: 'EMAIL_NOT_CONFIGURED' };
    if (emailLib.isConfigured(cfg)) {
      try {
        await emailLib.sendAuthMail(cfg, 'reset', user.email, {
          name: user.name,
          link,
          minutes: cfg.security.resetTokenMinutes,
        });
        mail = { sent: true };
      } catch (error) {
        mail = { sent: false, reason: error.code || 'EMAIL_SEND_FAILED' };
      }
    }

    sendJson(res, 200, {
      ok: true,
      twoFactorCleared: true,
      sessionsRevoked: true,
      resetMail: mail,
      // Returned only to the administrator, who must hand it over out-of-band if
      // mail delivery is not configured. It is single-use and expires.
      resetLink: mail.sent ? null : link,
      message: mail.sent
        ? 'Two-factor cleared and a reset link was emailed to the user.'
        : 'Two-factor cleared, but no email could be sent — pass the reset link on manually.',
    });
  });

  route('POST', '/api/admin/recovery/:id/deny', async (req, res, params) => {
    const session = requireAdmin(req);
    const body = await readJson(req, 8 * 1024).catch(() => ({}));
    const request = store.findRecovery(params.id);
    if (!request) throw new HttpError(404, 'NOT_FOUND', 'No such recovery request.');
    if (request.decided_at) throw new HttpError(409, 'ALREADY_DECIDED', 'That request was already decided.');
    store.decideRecovery(request.id, 'denied', session.user.id, String(body.note || '').slice(0, 200));
    store.audit(session.user.id, 'admin.recovery_denied', { target: request.user_id });
    sendJson(res, 200, { ok: true });
  });

  route('GET', '/api/admin/audit', async (req, res, params, url) => {
    requireAdmin(req);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100));
    // Read-only: no account metadata beyond what the admin already sees above,
    // and no document contents ever enter this table.
    // Deliberately without the free-form meta blob: an admin needs to know
    // *what* happened and *to whom*, not to read incidental request details.
    const events = store.recentAudit(limit).map((row) => ({
      id: row.id,
      action: row.action,
      userId: row.user_id || null,
      at: Number(row.at),
    }));
    sendJson(res, 200, { events });
  });

  route('GET', '/api/admin/summary', async (req, res) => {
    requireAdmin(req);
    const users = store.listUsers();
    sendJson(res, 200, {
      accounts: users.length,
      verified: users.filter((u) => u.email_verified).length,
      twoFactor: users.filter((u) => u.two_factor).length,
      admins: users.filter((u) => u.role === 'admin').length,
      passkeys: users.reduce((sum, u) => sum + u.passkeys, 0),
      documents: users.reduce((sum, u) => sum + u.documents, 0),
      bytes: users.reduce((sum, u) => sum + u.bytes, 0),
      openRecovery: store.listOpenRecovery().length,
      emailConfigured: emailLib.isConfigured(cfg),
      serverTime: Date.now(),
      client: clientIp(req, cfg.trustProxy),
    });
  });
}

module.exports = { install };
