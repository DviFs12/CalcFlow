/**
 * sw.js — Service Worker do CalcFlow  v2
 *
 * Estratégias:
 *   - Shell do app (HTML/CSS/JS/icons): Cache First com fallback de rede
 *   - Fontes do Google: Stale-While-Revalidate (serve do cache e atualiza)
 *   - Resto: Network First com fallback para cache
 *
 * Bump CACHE_VERSION ao fazer deploy de nova versão para forçar atualização.
 */

const CACHE_VERSION = 'calcflow-v2';

const APP_SHELL = [
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/engine.js',
  './js/ui.js',
  './js/converter.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

// ── Install ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache =>
        // allSettled: falha de um arquivo não bloqueia os outros
        Promise.allSettled(APP_SHELL.map(url => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  );
});

// ── Activate: remove caches de versões anteriores ─────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Fontes externas: stale-while-revalidate
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // App shell e assets locais: cache first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Tudo mais: network first
  event.respondWith(networkFirst(event.request));
});

// ── Estratégias ───────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // SPA fallback: serve index.html para navegações offline
    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline — conteúdo não disponível', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache  = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  // Inicia fetch em background para atualizar o cache
  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  // Retorna o cache imediatamente se disponível, senão aguarda a rede
  return cached ?? fetchPromise;
}
