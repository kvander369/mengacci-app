/* Mengacci $$ — service worker.
 *
 * The app must open on the course with no signal. On first load this takes a
 * copy of everything and serves from that copy thereafter. Same shape as
 * Mixed Up Golf's, which is proven on Kyle's phone.
 *
 * Bump CACHE when the app changes; the old cache is deleted on activate and
 * the version shows at the bottom of Setup so "which version is my phone on"
 * has an answer.
 */
const CACHE = 'mengacci-v2';

const SHELL = [
  './',
  './index.html',
  './scoring.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'version' && e.source) e.source.postMessage({ version: CACHE });
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* Two things this worker must keep its hands off, or the club TV freezes.
     Its scope is the whole site, so without these it would answer both from
     the cache and the board would show the same scores all afternoon:
       - the live channel: every answer is new by definition, never cached;
       - the board page itself, which is online-only and has no offline story. */
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('script.googleusercontent.com')) return;
  if (url.pathname.indexOf('/tv/') >= 0) return;

  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => {
        if (req.mode === 'navigate') return caches.match('./index.html');
        if (isFont) return new Response('', { status: 204 });
        return new Response('', { status: 504, statusText: 'offline' });
      });
    })
  );
});
