// AuraGoal's service worker: makes the app installable and quick to open, shows an offline page when there is no
// connection, and shows the reminders the server pushes (only to devices whose owner turned notifications on).
//
// What is cached, and what never is:
//   * The app's own files (built code and styles under /assets/, icons, the manifest, fonts, the offline page).
//     Built files have a fingerprint in their name, so a cached copy is never out of date.
//   * Never: anything under /api/ (accounts, goals, plans, messages, photos, sign-in). Those always come from the
//     server, so nobody's data is stored on the device and nothing old is shown as if it were current. Without a
//     connection they answer "offline" straight away.
//   * Pages are fetched fresh; when that fails, the offline page is shown instead of an old copy of the app.

const VERSION = 'v1';
const SHELL = `auragoal-shell-${VERSION}`;     // the offline page, icons and manifest
const ASSETS = `auragoal-assets-${VERSION}`;   // built JS / CSS, cached as they are used
const FONTS = `auragoal-fonts-${VERSION}`;     // Google Fonts
const KEEP = [SHELL, ASSETS, FONTS];
const PRECACHE = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
];
const MAX_ASSETS = 80;   // old builds' files are trimmed so the cache does not grow for ever

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)));
  // A new version waits until the app says "update now" (or every tab is closed), so a page is never switched
  // under someone's feet. The very first install takes over at once.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('auragoal-') && !KEEP.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const offlineJson = () => new Response(
  JSON.stringify({ success: false, offline: true, error: "You're offline. Connect to the internet and try again." }),
  { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
);

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

/** Cache first, for files whose content never changes under the same address. */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
    const cache = await caches.open(cacheName);
    await cache.put(request, res.clone());
    if (cacheName === ASSETS) trim(ASSETS, MAX_ASSETS);
  }
  return res;
}

/** The cached copy at once if there is one, refreshed in the background (fonts). */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fresh = fetch(request).then((res) => { if (res.ok || res.type === 'opaque') cache.put(request, res.clone()); return res; }).catch(() => cached);
  return cached || fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;   // saving, signing in, uploads: always straight to the network
  const url = new URL(request.url);

  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONTS));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Personal data is never cached: always the network, or a clear "offline" answer
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(offlineJson));
    return;
  }

  // Opening a page: always fresh. With no connection, the offline page (never an old copy of someone's goals)
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/offline.html')) || Response.error()));
    return;
  }

  // The built app files, icons and manifest
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest' || url.pathname === '/offline.html') {
    event.respondWith(cacheFirst(request, SHELL));
  }
  // Anything else (for example the development server's own files) goes to the network as usual
});

// ---- Push reminders: only arrive on devices where the user turned notifications on in Settings ----------------

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'AuraGoal', body: event.data ? event.data.text() : '' }; }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // If AuraGoal is open and in front, the page already alerts you itself (a message and a sound), so stay quiet.
    // The test button always shows, so you can see it work.
    if (data.kind !== 'test' && windows.some((w) => w.visibilityState === 'visible' && w.focused)) {
      windows.forEach((w) => w.postMessage({ type: 'push', data }));
      return;
    }
    await self.registration.showNotification(data.title || 'AuraGoal', {
      body: data.body || '',
      tag: data.tag || 'auragoal',          // a new message with the same tag replaces the old one instead of stacking
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of windows) {
      if ('focus' in w) return w.focus();   // reuse the tab or app window that is already open
    }
    return self.clients.openWindow(url);
  })());
});
