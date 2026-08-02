/**
 * TaxMitra AI — Netlify Serverless Function Proxy
 * Developer: Abhishek Agrahari | TaxMitra AI Enterprise
 * 
 * Deployed on Netlify (free). Keys stored as Netlify env vars.
 * Browser calls /api/ai → Netlify Function → Gemini/OpenRouter
 * Keys NEVER reach the browser.
 * 
 * Setup: netlify.com → Site settings → Env vars:
 *   GEMINI_API_KEY = AIzaSy...
 *   OPENROUTER_API_KEY = sk-or-...
 */

const ALLOWED_ORIGINS = [
  'https://abhishekagrahari307-max.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

const GEMINI_EP = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const OR_EP = 'https://openrouter.ai/api/v1/chat/completions';

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-TaxMitra-Model',
  };

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: 'Method not allowed' };
  }

  if (!isAllowed) {
    return { statusCode: 403, headers: corsHeaders, body: 'Forbidden' };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: corsHeaders, body: 'Invalid JSON' }; }

  const model = event.headers['x-taxmitra-model'] || 'gemini';
  
  try {
    let response, data;

    if (model === 'gemini' || model === 'gemini-vision') {
      if (!process.env.GEMINI_API_KEY) {
        return { statusCode: 503, headers: corsHeaders, body: JSON.stringify({ error: 'Gemini key not configured' }) };
      }
      response = await fetch(GEMINI_EP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify(body),
      });
      data = await response.json();
    } else if (model === 'openrouter') {
      if (!process.env.OPENROUTER_API_KEY) {
        return { statusCode: 503, headers: corsHeaders, body: JSON.stringify({ error: 'OpenRouter key not configured' }) };
      }
      response = await fetch(OR_EP, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
          'HTTP-Referer': 'https://abhishekagrahari307-max.github.io/ITR-AND-GST/',
          'X-Title': 'TaxMitra AI Enterprise',
        },
        body: JSON.stringify(body),
      });
      data = await response.json();
    } else {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Unknown model' }) };
    }

    return {
      statusCode: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Proxy error: ' + err.message }),
    };
  }
};
