/* TaxMitra server – OAuth 2.0 sign-in (GitHub and Google).

   Authorisation-code flow, server-side exchange, no implicit tokens in the URL.
   The only thing the browser ever receives is a short-lived one-time code that
   it exchanges for a session; access tokens never reach JavaScript.

   Configure with GITHUB_OAUTH_CLIENT_ID/SECRET and/or GOOGLE_OAUTH_CLIENT_ID/SECRET,
   plus OAUTH_BASE_URL = the public origin of this server (used to build the
   callback URL, which must match the provider's app settings exactly). */

'use strict';

const PROVIDERS = {
  github: {
    id: 'github',
    label: 'GitHub',
    authorize: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
    emailScopeNote: 'GitHub returns a verified primary email through /user/emails.',
  },
  google: {
    id: 'google',
    label: 'Google',
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    emailScopeNote: 'Google returns a verified email through the OIDC userinfo endpoint.',
  },
};

function providerConfig(cfg, id) {
  const provider = PROVIDERS[id];
  if (!provider) return null;
  const clientId = id === 'github' ? cfg.oauth.githubClientId : cfg.oauth.googleClientId;
  const clientSecret = id === 'github' ? cfg.oauth.githubSecret : cfg.oauth.googleSecret;
  if (!clientId || !clientSecret) return null;
  return { provider, clientId, clientSecret };
}

function enabledProviders(cfg) {
  return Object.keys(PROVIDERS).filter((id) => providerConfig(cfg, id)).map((id) => ({
    id,
    label: PROVIDERS[id].label,
  }));
}

function redirectUri(cfg, id) {
  const base = String(cfg.oauth.baseUrl || '').replace(/\/$/, '');
  return base + '/api/auth/oauth/' + id + '/callback';
}

function authorizeUrl(cfg, id, state) {
  const conf = providerConfig(cfg, id);
  if (!conf) {
    const err = new Error(PROVIDERS[id] ? PROVIDERS[id].label + ' sign-in is not configured on this server.' : 'Unknown provider.');
    err.code = 'OAUTH_NOT_CONFIGURED';
    err.status = 501;
    throw err;
  }
  const params = new URLSearchParams({
    client_id: conf.clientId,
    redirect_uri: redirectUri(cfg, id),
    scope: conf.provider.scope,
    state,
    response_type: 'code',
  });
  if (id === 'google') {
    params.set('prompt', 'select_account');
    params.set('access_type', 'online');
  }
  return conf.provider.authorize + '?' + params.toString();
}

async function exchangeCode(cfg, id, code) {
  const conf = providerConfig(cfg, id);
  if (!conf) {
    const err = new Error('That provider is not configured.');
    err.code = 'OAUTH_NOT_CONFIGURED';
    err.status = 501;
    throw err;
  }
  const body = new URLSearchParams({
    client_id: conf.clientId,
    client_secret: conf.clientSecret,
    code: String(code),
    redirect_uri: redirectUri(cfg, id),
    grant_type: 'authorization_code',
  });
  const res = await fetch(conf.provider.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { data = Object.fromEntries(new URLSearchParams(text)); }
  if (!res.ok || !data.access_token) {
    const err = new Error('The provider rejected the sign-in code' + (data.error_description ? ': ' + data.error_description : '.'));
    err.code = 'OAUTH_EXCHANGE_FAILED';
    err.status = 502;
    throw err;
  }
  return data.access_token;
}

async function getJson(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
      'User-Agent': 'TaxMitra/1.0',
    },
  });
  if (!res.ok) {
    const err = new Error('Provider profile request failed with HTTP ' + res.status + '.');
    err.code = 'OAUTH_PROFILE_FAILED';
    err.status = 502;
    throw err;
  }
  return res.json();
}

async function fetchProfile(cfg, id, accessToken) {
  if (id === 'github') {
    const user = await getJson('https://api.github.com/user', accessToken);
    let email = user.email || '';
    let verified = false;
    try {
      const emails = await getJson('https://api.github.com/user/emails', accessToken);
      if (Array.isArray(emails)) {
        const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);
        if (primary) { email = primary.email; verified = true; }
        else if (!email && emails[0]) email = emails[0].email;
      }
    } catch (e) { /* the scope may be missing; fall back to the public email */ }
    return {
      provider: 'github',
      subject: String(user.id),
      login: user.login,
      name: user.name || user.login || '',
      email: String(email || '').toLowerCase(),
      emailVerified: verified,
      avatar: user.avatar_url || '',
    };
  }

  if (id === 'google') {
    const info = await getJson('https://openidconnect.googleapis.com/v1/userinfo', accessToken);
    return {
      provider: 'google',
      subject: String(info.sub),
      login: info.email,
      name: info.name || '',
      email: String(info.email || '').toLowerCase(),
      emailVerified: info.email_verified === true,
      avatar: info.picture || '',
    };
  }

  const err = new Error('Unknown provider.');
  err.code = 'OAUTH_UNKNOWN_PROVIDER';
  err.status = 400;
  throw err;
}

module.exports = { PROVIDERS, enabledProviders, providerConfig, authorizeUrl, exchangeCode, fetchProfile, redirectUri };
