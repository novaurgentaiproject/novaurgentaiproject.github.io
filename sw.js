// Nova service worker — offline app shell (network-first, cache fallback).
const VERSION = 'nova-v14';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/nova.css',
  'assets/nova-logo.svg',
  'assets/icon-192.png',
  'js/account.js',
  'js/agents.js',
  'js/app.js',
  'js/engines/claude.js',
  'js/engines/codegen.js',
  'js/engines/index.js',
  'js/engines/knowledge.js',
  'js/engines/local.js',
  'js/engines/mathx.js',
  'js/engines/prompt.js',
  'js/engines/writer.js',
  'js/highlight.js',
  'js/icons.js',
  'js/markdown.js',
  'js/modals.js',
  'js/premium.js',
  'js/models.js',
  'js/render.js',
  'js/state.js',
  'js/sync.js',
  'js/tools/aimode.js',
  'js/tools/canvas.js',
  'js/tools/files.js',
  'js/tools/genui.js',
  'js/tools/hearing.js',
  'js/tools/imagegen.js',
  'js/tools/research.js',
  'js/tools/study.js',
  'js/tools/voice.js',
  'js/tools/widgetgen.js',
  'js/tools/widgetkit.js',
  'js/ui.js',
  'js/util.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/__/')) return; // Firebase's sign-in pages: always from the network, never cached
  // Network-first keeps every module in sync after an update; the cache is the offline fallback.
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req.mode === 'navigate' ? 'index.html' : req, copy)); }
    return res;
  }).catch(() => caches.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true })));
});
