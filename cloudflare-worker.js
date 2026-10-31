/**
 * TaxMitra AI — Cloudflare Worker API Proxy
 * Developer: Abhishek Agrahari | TaxMitra AI Enterprise
 * 
 * This Worker acts as a secure proxy between the browser and AI APIs.
 * API keys are stored as Cloudflare Worker Secrets (never in browser).
 * 
 * SETUP:
 * 1. Go to: https://dash.cloudflare.com/workers
 * 2. Create new Worker → paste this code
 * 3. Add Secrets: GEMINI_API_KEY, OPENROUTER_API_KEY
 * 4. Set ALLOWED_ORIGIN to your GitHub Pages URL
 * 5. Copy Worker URL → update js/ai-proxy-config.js
 * 
 * FREE TIER: 100,000 requests/day — more than enough!
 */

// ── Config ────────────────────────────────────────────────────
const ALLOWED_ORIGIN = 'https://abhishekagrahari307-max.github.io';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

// ── Main Handler ──────────────────────────────────────────────
export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-TaxMitra-Model',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // Only allow POST from our GitHub Pages domain
    const origin = request.headers.get('Origin') || '';
    if (!origin.startsWith(ALLOWED_ORIGIN) && !origin.includes('localhost')) {
      return new Response('Forbidden', { status: 403 });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Parse request
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const model = request.headers.get('X-TaxMitra-Model') || 'gemini';
    const corsHeaders = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Content-Type': 'application/json',
    };

    try {
      let response;

      if (model === 'gemini' || model === 'gemini-vision') {
        // ── Gemini API Call ──────────────────────────────────
        if (!env.GEMINI_API_KEY) {
          return new Response(JSON.stringify({ error: 'Gemini key not configured on server' }), { status: 503, headers: corsHeaders });
        }
        const geminiResp = await fetch(GEMINI_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': env.GEMINI_API_KEY,
          },
          body: JSON.stringify(body),
        });
        const data = await geminiResp.json();
        return new Response(JSON.stringify(data), {
          status: geminiResp.status,
          headers: corsHeaders,
        });

      } else if (model === 'openrouter') {
        // ── OpenRouter API Call ──────────────────────────────
        if (!env.OPENROUTER_API_KEY) {
          return new Response(JSON.stringify({ error: 'OpenRouter key not configured on server' }), { status: 503, headers: corsHeaders });
        }
        const orResp = await fetch(OPENROUTER_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + env.OPENROUTER_API_KEY,
            'HTTP-Referer': ALLOWED_ORIGIN + '/ITR-AND-GST/',
            'X-Title': 'TaxMitra AI Enterprise',
          },
          body: JSON.stringify(body),
        });
        const data = await orResp.json();
        return new Response(JSON.stringify(data), {
          status: orResp.status,
          headers: corsHeaders,
        });

      } else {
        return new Response(JSON.stringify({ error: 'Unknown model: ' + model }), { status: 400, headers: corsHeaders });
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Proxy error: ' + err.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  }
};
