/* Small HTTP helpers: JSON responses, body parsing with a hard cap, CORS for
   a configured allow-list, and in-memory rate limiting. No dependencies. */

'use strict';

class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra || null;
  }
}

function sendJson(res, status, payload, headers) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, Object.assign(
    {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    headers || {}
  ));
  res.end(body);
}

function sendNoContent(res, status) {
  res.writeHead(status || 204, { 'Cache-Control': 'no-store' });
  res.end();
}

async function readJson(req, limitBytes) {
  const type = String(req.headers['content-type'] || '');
  if (type && !/application\/json/i.test(type)) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send JSON with Content-Type: application/json');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is larger than ' + limitBytes + ' bytes');
    }
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed;
  } catch (e) {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be a JSON object');
  }
}

function applyCors(req, res, allowedOrigins) {
  const origin = req.headers.origin;
  if (!origin) return;
  const sameOrigin = (() => {
    try {
      return new URL(origin).host === req.headers.host;
    } catch (e) {
      return false;
    }
  })();
  const allowed = sameOrigin || allowedOrigins.includes(origin);
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'false');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-TaxMitra-Model');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

/* Fixed-window counter. In-memory on purpose: one process, no Redis needed for
   a hobby deployment. A restart resets the window, which is acceptable for
   abuse control (not for billing). */
function createLimiter() {
  const buckets = new Map();

  function hit(key, limit, windowMs) {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset <= now) {
      bucket = { count: 0, reset: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (buckets.size > 50000) {
      for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
    }
    return {
      allowed: bucket.count <= limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.reset,
      retryAfter: Math.max(1, Math.ceil((bucket.reset - now) / 1000)),
    };
  }

  return { hit };
}

function clientIp(req, trustProxy) {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) {
      const first = String(fwd).split(',')[0].trim();
      if (first) return first;
    }
    if (req.headers['cf-connecting-ip']) return String(req.headers['cf-connecting-ip']);
    if (req.headers['x-real-ip']) return String(req.headers['x-real-ip']);
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

module.exports = {
  HttpError,
  sendJson,
  sendNoContent,
  readJson,
  applyCors,
  createLimiter,
  clientIp,
};
