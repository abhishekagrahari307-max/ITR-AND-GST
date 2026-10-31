/* TaxMitra AI Enterprise — Service Worker | Developer: Abhishek Agrahari */
const CACHE = 'taxmitra-v4';
const ASSETS = ['/', '/ITR-AND-GST/', '/ITR-AND-GST/index.html',
  '/ITR-AND-GST/css/taxmitra.css', '/ITR-AND-GST/js/taxmitra.js',
  '/ITR-AND-GST/pages/computation.html', '/ITR-AND-GST/pages/ai-assistant.html',
  '/ITR-AND-GST/pages/calculators.html', '/ITR-AND-GST/pages/itr-center.html',
  '/ITR-AND-GST/pages/gst.html', '/ITR-AND-GST/pages/dashboard.html', '/ITR-AND-GST/pages/import-data.html', '/ITR-AND-GST/pages/tds-payroll.html', '/ITR-AND-GST/pages/compliance.html', '/ITR-AND-GST/pages/investment.html', '/ITR-AND-GST/css/responsive.css', '/ITR-AND-GST/js/ai-real.js', '/ITR-AND-GST/js/pdf-real.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => {
    if (r && r.status === 200) { const c = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request).then(c => c || caches.match('/ITR-AND-GST/index.html'))));
});
