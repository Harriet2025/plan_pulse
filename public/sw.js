// AuraGoal's service worker. Its only job is to show reminders that the server pushes, even when the site is closed.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
      icon: '/icon-192.png',
      badge: '/icon-192.png',
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
      if ('focus' in w) return w.focus();   // reuse the tab that is already open
    }
    return self.clients.openWindow(url);
  })());
});
