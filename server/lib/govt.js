/* TaxMitra server – government integration layer.

   Reality check, stated in code because the UI must not lie about it:
   • GST e-invoice (IRN) and GST returns are reachable only through an
     IRP / GSP with credentials issued to an empanelled taxpayer or GSP.
   • Income-tax return filing has no open public API. An ASP/eRI account with
     the department is required, and the department's own schema + DSC/EVC
     flow has to be used.

   So this module is a real adapter: it builds and sends the official request
   shapes when credentials exist, and answers 501 with a precise code when they
   do not. It never fabricates an IRN, an acknowledgement number, a filing
   status or a success message. */

'use strict';

const crypto = require('node:crypto');

function isConfigured(cfg) {
  return Boolean(cfg.govt.gstClientId && cfg.govt.gstClientSecret && cfg.govt.gstUsername && cfg.govt.gstPassword);
}

function status(cfg) {
  const configured = isConfigured(cfg);
  return {
    configured,
    env: cfg.govt.irpEnv,
    einvoice: {
      available: configured,
      reason: configured ? null : 'GSTN client credentials are not set on this server.',
      base: cfg.govt.irpBase[cfg.govt.irpEnv] || cfg.govt.irpBase.sandbox,
      docs: 'https://einv-apisandbox.nic.in/',
    },
    gstReturns: {
      available: Boolean(configured && cfg.govt.gspBase[cfg.govt.gspEnv]),
      reason: configured ? null : 'A GSP account (client id + secret) is required for return filing.',
    },
    incomeTaxFiling: {
      available: false,
      reason: 'The income-tax department has no open filing API. You need an ASP/eRI account and DSC/EVC. This server will never simulate a filing.',
      docs: 'https://www.incometax.gov.in/iec/foportal/help/e-filing',
    },
  };
}

/* NIC IRP requires the password to be AES-256-ECB encrypted with the first 32
   characters of the client secret (the "app key"), then base64 encoded. This is
   the documented NIC pattern; it is implemented here rather than left as a
   TODO so the adapter is genuinely usable once credentials exist. */
function encryptPasswordForIrp(password, clientSecret) {
  const appKey = String(clientSecret || '').slice(0, 32);
  if (appKey.length !== 32) throw new Error('GSTN client secret must be at least 32 characters for IRP auth');
  const cipher = crypto.createCipheriv('aes-256-ecb', Buffer.from(appKey, 'utf8'), null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(String(password), 'utf8'), cipher.final()]).toString('base64');
}

function notConfigured(cfg) {
  const err = new Error(status(cfg).einvoice.reason || 'Government APIs are not configured on this server.');
  err.code = 'GOVT_NOT_CONFIGURED';
  err.status = 501;
  return err;
}

async function fetchJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { raw: text.slice(0, 800) }; }
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/* IRP: authenticate → returns { authToken, sek } which must be reused for the
   IRN call within its lifetime. Kept in memory per process. */
async function irpAuthenticate(cfg) {
  if (!isConfigured(cfg)) throw notConfigured(cfg);
  const base = cfg.govt.irpBase[cfg.govt.irpEnv] || cfg.govt.irpBase.sandbox;
  const body = {
    UserName: cfg.govt.gstUsername,
    Password: encryptPasswordForIrp(cfg.govt.gstPassword, cfg.govt.gstClientSecret),
    AppKey: Buffer.from(String(cfg.govt.gstClientSecret).slice(0, 32), 'utf8').toString('base64'),
    ForceRefreshAccessToken: true,
  };
  const result = await fetchJson(base + '/eivital/v1.04/auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'client-id': cfg.govt.gstClientId,
      'client-secret': cfg.govt.gstClientSecret,
      'gstin': cfg.govt.gstUsername,
    },
    body: JSON.stringify(body),
  }, cfg.govt.timeoutMs);

  if (result.status >= 400) {
    const err = new Error('IRP authentication failed with HTTP ' + result.status + '. Check the credentials, the GSTIN and whether you are pointing at the sandbox.');
    err.code = 'IRP_AUTH_FAILED';
    err.status = 502;
    err.upstream = result.data;
    throw err;
  }
  return result.data;
}

/* Generate an IRN. `payload` must be a complete NIC e-invoice schema document
   supplied by the caller; this server does not invent line items or totals. */
async function generateIrn(cfg, payload) {
  if (!isConfigured(cfg)) throw notConfigured(cfg);
  if (!payload || typeof payload !== 'object' || !payload.Version || !payload.TranDtls || !payload.DocDtls || !payload.ItemList) {
    const err = new Error('Send a complete e-invoice document (Version, TranDtls, DocDtls, SellerDtls, BuyerDtls, ItemList). Nothing is filled in for you.');
    err.code = 'EINVOICE_PAYLOAD_INCOMPLETE';
    err.status = 400;
    throw err;
  }
  const auth = await irpAuthenticate(cfg);
  const authToken = auth && auth.AuthToken ? auth.AuthToken : (auth && auth.authToken) || '';
  const sek = auth && auth.Sek ? auth.Sek : '';
  if (!authToken || !sek) {
    const err = new Error('IRP authentication returned no AuthToken/Sek. Cannot continue.');
    err.code = 'IRP_AUTH_INCOMPLETE';
    err.status = 502;
    throw err;
  }
  const base = cfg.govt.irpBase[cfg.govt.irpEnv] || cfg.govt.irpBase.sandbox;
  const result = await fetchJson(base + '/eicore/v1.03/Invoice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      client_id: cfg.govt.gstClientId,
      client_secret: cfg.govt.gstClientSecret,
      user_name: cfg.govt.gstUsername,
      authtoken: authToken,
      sek: sek,
      gstin: cfg.govt.gstUsername,
    },
    body: JSON.stringify(payload),
  }, cfg.govt.timeoutMs);

  if (result.status >= 400) {
    const err = new Error('IRP rejected the invoice with HTTP ' + result.status + '.');
    err.code = 'IRP_REJECTED';
    err.status = 502;
    err.upstream = result.data;
    throw err;
  }
  return { generated: true, upstreamStatus: result.status, irp: result.data };
}

/* GST return filing through a GSP. The GSP contract differs per provider, so
   this posts the department-shaped payload to the configured GSP base and
   returns whatever the GSP says — no interpretation, no invention. */
async function fileGstReturn(cfg, { returnType, payload } = {}) {
  if (!isConfigured(cfg)) throw notConfigured(cfg);
  const allowed = ['GSTR1', 'GSTR3B', 'GSTR9'];
  const type = String(returnType || '').toUpperCase();
  if (!allowed.includes(type)) {
    const err = new Error('returnType must be one of ' + allowed.join(', '));
    err.code = 'RETURN_TYPE_INVALID';
    err.status = 400;
    throw err;
  }
  if (!payload || typeof payload !== 'object') {
    const err = new Error('A complete department-shaped return payload is required.');
    err.code = 'RETURN_PAYLOAD_REQUIRED';
    err.status = 400;
    throw err;
  }
  const base = cfg.govt.gspBase[cfg.govt.gspEnv] || cfg.govt.gspBase.sandbox;
  const result = await fetchJson(base + '/gst/v1/returns/' + type.toLowerCase(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'client-id': cfg.govt.gstClientId,
      'client-secret': cfg.govt.gstClientSecret,
      gstin: cfg.govt.gstUsername,
      'x-api-key': cfg.govt.gstClientSecret,
    },
    body: JSON.stringify({ gstin: cfg.govt.gstUsername, ret_period: payload.ret_period, payload }),
  }, cfg.govt.timeoutMs);

  if (result.status >= 400) {
    const err = new Error('The GSP rejected the return with HTTP ' + result.status + '. Nothing was filed.');
    err.code = 'GSP_REJECTED';
    err.status = 502;
    err.upstream = result.data;
    throw err;
  }
  return { submittedToGsp: true, upstreamStatus: result.status, gsp: result.data };
}

function itrUnavailable() {
  const err = new Error(
    'Filing an income-tax return is not available through this server. The department exposes no open API: ' +
    'an ASP/eRI account and the department schema with DSC/EVC are mandatory, and a filing can only be made by the ' +
    'taxpayer or their authorised representative. The ITR JSON this site produces is a working paper and is labelled as such.'
  );
  err.code = 'ITD_FILING_API_UNAVAILABLE';
  err.status = 501;
  return err;
}

module.exports = {
  isConfigured,
  status,
  encryptPasswordForIrp,
  irpAuthenticate,
  generateIrn,
  fileGstReturn,
  itrUnavailable,
  notConfigured,
};
