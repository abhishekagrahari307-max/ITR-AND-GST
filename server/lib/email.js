/* TaxMitra server – transactional email without dependencies.

   Drivers:
     console  – development/tests: the message is written to the server log and
                kept in an in-memory outbox that the tests can read.
     resend   – https://resend.com  (free tier, one API key)
     brevo    – https://brevo.com   (free tier, one API key)
     smtp     – any SMTP relay, including Gmail app passwords, port 465 (TLS)
                or 587 (STARTTLS). Implemented here with node:net + node:tls.

   If no driver is configured the server still works: verification and password
   reset links are simply not sent, and the API says so (`emailConfigured:false`)
   instead of pretending an email went out. */

'use strict';

const net = require('node:net');
const tls = require('node:tls');
const os = require('node:os');

const outbox = []; // console driver only – capped, never persisted

function fromAddress(cfg) {
  return cfg.email.from || 'TaxMitra <no-reply@localhost>';
}

function textFor(kind, data) {
  if (kind === 'verify') {
    return [
      'Namaste' + (data.name ? ', ' + data.name : '') + ',',
      '',
      'Your TaxMitra account needs one quick check: confirm this email address.',
      data.link,
      '',
      'The link expires in ' + data.minutes + ' minutes and can be used once.',
      'If you did not create a TaxMitra account, ignore this message.',
    ].join('\n');
  }
  if (kind === 'reset') {
    return [
      'Namaste' + (data.name ? ', ' + data.name : '') + ',',
      '',
      'Someone asked to reset the TaxMitra password for this address.',
      data.link,
      '',
      'The link expires in ' + data.minutes + ' minutes and can be used once.',
      'Every signed-in session will be signed out when the password changes.',
      'If this was not you, no action is needed — your password stays the same.',
    ].join('\n');
  }
  return String(data.text || '');
}

function htmlFor(kind, data) {
  const title = kind === 'verify' ? 'Confirm your email' : 'Reset your TaxMitra password';
  const cta = kind === 'verify' ? 'Confirm email' : 'Choose a new password';
  const warn = kind === 'reset'
    ? '<p style="font-size:13px;color:#64748b">If you did not ask for this, ignore the email — nothing changes.</p>'
    : '<p style="font-size:13px;color:#64748b">If you did not create this account, ignore the email.</p>';
  return '<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;padding:24px">' +
    '<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">' +
    '<h1 style="font-size:18px;margin:0 0 8px">' + title + '</h1>' +
    '<p style="font-size:14px;color:#334155">' + (data.name ? 'Namaste ' + escapeHtml(data.name) + ',' : 'Namaste,') + '</p>' +
    '<p style="font-size:14px;color:#334155">This link is valid for ' + Number(data.minutes) + ' minutes and works once.</p>' +
    '<p style="margin:22px 0"><a href="' + escapeHtml(data.link) + '" style="background:#1e40af;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:600">' + cta + '</a></p>' +
    '<p style="font-size:12px;color:#94a3b8;word-break:break-all">' + escapeHtml(data.link) + '</p>' +
    warn +
    '<p style="font-size:12px;color:#94a3b8;margin-top:20px">TaxMitra — self-hosted Indian tax toolkit</p>' +
    '</div></body></html>';
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------ console */

async function sendConsole(cfg, message) {
  outbox.push({ to: message.to, subject: message.subject, text: message.text, at: Date.now() });
  while (outbox.length > 50) outbox.shift();
  console.log('[email:console] to=' + message.to + ' subject="' + message.subject + '"');
  console.log(message.text.split('\n').filter((l) => l.startsWith('http')).join('\n') || '(no link)');
  return { driver: 'console', id: 'console-' + outbox.length };
}

/* --------------------------------------------------------- HTTP drivers */

async function sendHttp(cfg, message) {
  const driver = cfg.email.driver;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    if (driver === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.email.apiKey },
        body: JSON.stringify({
          from: fromAddress(cfg),
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
        signal: controller.signal,
      });
      const body = await res.text();
      if (!res.ok) throw new Error('Resend rejected the email (HTTP ' + res.status + '): ' + body.slice(0, 200));
      let id = null;
      try { id = JSON.parse(body).id; } catch (e) { /* id is optional */ }
      return { driver, id };
    }

    if (driver === 'brevo') {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': cfg.email.apiKey },
        body: JSON.stringify({
          sender: parseSender(fromAddress(cfg)),
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
          htmlContent: message.html,
        }),
        signal: controller.signal,
      });
      const body = await res.text();
      if (!res.ok) throw new Error('Brevo rejected the email (HTTP ' + res.status + '): ' + body.slice(0, 200));
      let id = null;
      try { id = JSON.parse(body).messageId; } catch (e) { /* optional */ }
      return { driver, id };
    }

    throw new Error('Unsupported email driver: ' + driver);
  } finally {
    clearTimeout(timer);
  }
}

function parseSender(value) {
  const match = /^(.*)<(.+)>$/.exec(String(value));
  if (match) return { name: match[1].trim() || 'TaxMitra', email: match[2].trim() };
  return { name: 'TaxMitra', email: String(value).trim() };
}

/* ---------------------------------------------------------------- SMTP */

/* Minimal SMTP client: EHLO, STARTTLS on 587, implicit TLS on 465, AUTH PLAIN
   or LOGIN, one recipient, DATA. Enough for verification and reset mail, and
   small enough to audit. */
async function sendSmtp(cfg, message) {
  const host = cfg.email.smtpHost;
  const port = cfg.email.smtpPort;
  const secure = cfg.email.smtpSecure !== false && port === 465;
  const user = cfg.email.smtpUser;
  const pass = cfg.email.smtpPass;

  return new Promise((resolve, reject) => {
    const commands = [];
    let socket = secure
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });
    let buffer = '';
    let step = 0;
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      try { socket.destroy(); } catch (e) { /* ignore */ }
      reject(new Error('SMTP timeout after 20 s'));
    }, 20000);

    function done(error, result) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { socket.end(); } catch (e) { /* ignore */ }
      if (error) reject(error); else resolve(result);
    }

    function write(line) {
      commands.push(line);
      socket.write(line + '\r\n');
    }

    function next() {
      const command = commands[step];
      if (!command) return;
      step += 1;
      write(command);
    }

    function parse(response) {
      const lines = response.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1] || '';
      return { code: parseInt(last.slice(0, 3), 10), text: last.slice(4) };
    }

    function onResponse(response) {
      const parsed = parse(response);
      const code = parsed.code;
      if (!Number.isFinite(code)) return done(new Error('Unexpected SMTP response: ' + response.slice(0, 120)));

      // Greeting
      if (step === 0 && code === 220) {
        write('EHLO taxmitra.local');
        step = 1;
        return undefined;
      }

      if (step === 1) {
        if (code !== 250) return done(new Error('EHLO rejected: ' + parsed.text));
        if (!secure && cfg.email.smtpStarttls !== false) {
          write('STARTTLS');
          step = 2;
          return undefined;
        }
        return authenticate();
      }

      if (step === 2) {
        if (code !== 220) return done(new Error('STARTTLS rejected: ' + parsed.text));
        socket.removeAllListeners('data');
        socket = tls.connect({ socket, servername: host }, () => {
          socket.on('data', onData);
          write('EHLO taxmitra.local');
          step = 3;
        });
        socket.on('error', (err) => done(err));
        return undefined;
      }

      if (step === 3) {
        if (code !== 250) return done(new Error('EHLO after STARTTLS rejected: ' + parsed.text));
        return authenticate();
      }

      // AUTH flows
      if (step === 10 && code === 334) {
        write(Buffer.from(user).toString('base64'));
        step = 11;
        return undefined;
      }
      if (step === 11 && code === 334) {
        write(Buffer.from(pass).toString('base64'));
        step = 12;
        return undefined;
      }
      if (step === 12) {
        if (code !== 235) return done(new Error('SMTP authentication failed: ' + parsed.text));
        startEnvelope();
        return undefined;
      }
      if (step === 20 && code === 334) {
        write(Buffer.from('\u0000' + user + '\u0000' + pass).toString('base64'));
        step = 21;
        return undefined;
      }
      if (step === 21) {
        if (code !== 235) return done(new Error('SMTP authentication failed: ' + parsed.text));
        startEnvelope();
        return undefined;
      }

      if (step === 30) {
        if (code !== 250) return done(new Error('MAIL FROM rejected: ' + parsed.text));
        write('RCPT TO:<' + message.to + '>');
        step = 31;
        return undefined;
      }
      if (step === 31) {
        if (code !== 250 && code !== 251) return done(new Error('RCPT TO rejected: ' + parsed.text));
        write('DATA');
        step = 32;
        return undefined;
      }
      if (step === 32) {
        if (code !== 354) return done(new Error('DATA rejected: ' + parsed.text));
        const headers = [
          'From: ' + fromAddress(cfg),
          'To: ' + message.to,
          'Subject: ' + message.subject,
          'Date: ' + new Date().toUTCString(),
          'Message-ID: <' + Date.now() + '.' + Math.random().toString(36).slice(2) + '@taxmitra.local>',
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=UTF-8',
          'Content-Transfer-Encoding: 8bit',
        ];
        // Dot-stuffing per RFC 5321.
        const body = message.text.split('\n').map((l) => (l.startsWith('.') ? '.' + l : l)).join('\r\n');
        socket.write(headers.join('\r\n') + '\r\n\r\n' + body + '\r\n.\r\n');
        step = 33;
        return undefined;
      }
      if (step === 33) {
        if (code !== 250) return done(new Error('Message rejected: ' + parsed.text));
        write('QUIT');
        step = 34;
        return done(null, { driver: 'smtp', id: null });
      }
      return undefined;
    }

    function authenticate() {
      if (!user) return startEnvelope();
      if (cfg.email.smtpAuth === 'PLAIN') {
        write('AUTH PLAIN');
        step = 20;
      } else {
        write('AUTH LOGIN');
        step = 10;
      }
      return undefined;
    }

    function startEnvelope() {
      const sender = parseSender(fromAddress(cfg)).email;
      write('MAIL FROM:<' + sender + '>');
      step = 30;
    }

    function onData(chunk) {
      buffer += chunk.toString('utf8');
      let index;
      // A complete SMTP response ends with "NNN " (space) rather than "NNN-".
      while ((index = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, index);
        if (/^\d{3}-/.test(line)) {
          buffer = buffer.slice(index + 2);
          continue;
        }
        const response = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        onResponse(response);
        return;
      }
    }

    socket.on('error', (err) => done(err));
    socket.on('data', onData);
    if (secure) {
      socket.on('connect', () => { /* greeting arrives on data */ });
    }
  }).catch((error) => {
    const wrapped = new Error('Could not send mail over SMTP: ' + error.message);
    wrapped.code = 'EMAIL_SEND_FAILED';
    throw wrapped;
  });
}

/* --------------------------------------------------------------- façade */

function isConfigured(cfg) {
  if (cfg.email.driver === 'console') return true;
  if (cfg.email.driver === 'resend' || cfg.email.driver === 'brevo') return !!cfg.email.apiKey;
  if (cfg.email.driver === 'smtp') return !!(cfg.email.smtpHost && cfg.email.smtpPort);
  return false;
}

async function send(cfg, { to, subject, text, html }) {
  const message = { to, subject, text, html };
  if (cfg.email.driver === 'console') return sendConsole(cfg, message);
  if (cfg.email.driver === 'resend' || cfg.email.driver === 'brevo') return sendHttp(cfg, message);
  if (cfg.email.driver === 'smtp') return sendSmtp(cfg, message);
  const err = new Error('No email driver is configured on this server, so no mail was sent.');
  err.code = 'EMAIL_NOT_CONFIGURED';
  throw err;
}

function sendAuthMail(cfg, kind, to, data) {
  const subject = kind === 'verify'
    ? 'Confirm your TaxMitra email'
    : 'Reset your TaxMitra password';
  return send(cfg, {
    to,
    subject,
    text: textFor(kind, data),
    html: htmlFor(kind, data),
  });
}

function readOutbox() {
  return outbox.slice();
}

function clearOutbox() {
  outbox.length = 0;
}

module.exports = {
  send,
  sendAuthMail,
  isConfigured,
  readOutbox,
  clearOutbox,
  parseSender,
  hostname: () => os.hostname(),
};
