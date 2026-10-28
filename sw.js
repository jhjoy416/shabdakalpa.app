/* শব্দকল্প — offline-first service worker */
const VERSION = 'shabdakalpa-v6';
const CORE = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'
];
const PDF_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Anek+Bangla:wght@400;500;600;700&family=Galada&family=Lora:wght@400;600&family=Tiro+Bangla&display=swap';

async function precacheFonts(cache) {
  const res = await fetch(FONT_CSS, { mode: 'cors' });
  if (!res.ok) throw new Error('font css');
  const css = await res.clone().text();
  await cache.put(FONT_CSS, res);
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1].replace(/['"]/g, '')))];
  await Promise.allSettled(urls.map(async u => {
    const r = await fetch(u, { mode: 'cors' });
    if (r.ok) await cache.put(u, r);
  }));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE);
    await Promise.allSettled([
      cache.add(new Request(PDF_LIB, { mode: 'no-cors' })),
      precacheFonts(cache)
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
    const cache = await caches.open(VERSION);
    const ready = !!(await cache.match(PDF_LIB, { ignoreVary: true })) && !!(await cache.match(FONT_CSS, { ignoreVary: true }));
    (await self.clients.matchAll()).forEach(c => c.postMessage({ type: 'offline-ready', full: ready }));
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || !/^https?:/.test(req.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreVary: true });
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { event.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') {
      const page = await cache.match('./index.html');
      if (page) return page;
    }
    return new Response('', { status: 504, statusText: 'Offline' });
  })());
});
