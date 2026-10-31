/* ================================================================
   TaxMitra AI — Proxy Configuration
   Developer: Abhishek Agrahari | TaxMitra AI Enterprise
   
   Option A: Direct API (user sets key in localStorage)
     TaxMitra.setKeys({ geminiApiKey: 'AIzaSy...' })
   
   Option B: Cloudflare Worker Proxy (no key in browser!)
     1. Deploy cloudflare-worker.js to Cloudflare Workers
     2. Set GEMINI_API_KEY secret in Cloudflare dashboard
     3. Set PROXY_URL below to your Worker URL
   
   Set proxy URL:
     TaxMitra.setProxy('https://your-worker.your-name.workers.dev')
   ================================================================ */
'use strict';

(function() {
  // Load proxy URL from localStorage if set
  // Check for Netlify Function proxy (auto-detected)
  const netlifyProxy = '/api/ai'; // Netlify function endpoint (works when deployed on Netlify)
  const customProxy = localStorage.getItem('tm_proxy_url') || '';
  
  // Auto-detect: if we're on Netlify, use built-in function proxy
  const isNetlify = typeof window !== 'undefined' && 
    (window.location.hostname.includes('.netlify.app') || 
     localStorage.getItem('tm_use_netlify') === 'true');
  
  const proxyUrl = customProxy || (isNetlify ? netlifyProxy : '');
  
  window.TAXMITRA_PROXY = {
    url: proxyUrl,
    enabled: !!proxyUrl,
    
    // Call Gemini via proxy (key stays on server)
    callGemini: async function(body) {
      if (!this.url) throw new Error('Proxy not configured');
      const resp = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TaxMitra-Model': 'gemini',
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error('Proxy error: ' + resp.status);
      return await resp.json();
    },
    
    // Call OpenRouter via proxy
    callOpenRouter: async function(body) {
      if (!this.url) throw new Error('Proxy not configured');
      const resp = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TaxMitra-Model': 'openrouter',
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error('Proxy error: ' + resp.status);
      return await resp.json();
    },
    
    // Test proxy connection
    test: async function() {
      if (!this.url) { console.warn('No proxy URL set'); return false; }
      try {
        const resp = await fetch(this.url, { method: 'OPTIONS' });
        console.log('%c✅ Proxy OK: ' + this.url, 'color:#059669;font-weight:700');
        return true;
      } catch(e) {
        console.warn('Proxy test failed:', e.message);
        return false;
      }
    },
  };
  
  if (proxyUrl) {
    console.log('%c🔗 TaxMitra Proxy: ' + proxyUrl, 'color:#7c3aed;font-size:11px');
  }
})();
