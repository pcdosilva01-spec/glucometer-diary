const CACHE_NAME = 'glucometer-shell-v10-recovery-import';
const SHELL = [
  '/', '/index.html', '/styles.css?v=16', '/src/app.mjs?v=12',
  '/src/core.mjs?v=7', '/src/pdf-export.mjs?v=8', '/src/glucose-card.mjs?v=3',
'/logo.svg', '/app-icon-192.png', '/app-icon-512.png', '/manifest.webmanifest',
  '/soundreality-glass-filled-with-water-201638.mp3'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('glucometer-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put('/index.html', response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match('/index.html'))));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && (url.pathname.startsWith('/src/') || SHELL.includes(url.pathname))) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});


self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Bebe água aí 💧';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appVisible = windows.some(client => client.visibilityState === 'visible');
    const options = {
      body: typeof data.body === 'string' && data.body ? data.body : 'Pausa rápida: toma alguns goles se puder. Se já bebeu, pode ignorar.',
      icon: '/app-icon-192.png',
      badge: '/app-icon-192.png',
      tag: 'glucometer-water-reminder',
      renotify: true,
      // Quando a página está visível, o app pode tocar o MP3 local; com tudo fechado, deixa o sistema tocar seu aviso padrão.
      silent: appVisible,
      data: { url: typeof data.url === 'string' ? data.url : '/#water' }
    };
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/#water', self.location.origin).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.focus();
        if ('navigate' in client && client.url !== targetUrl) await client.navigate(targetUrl);
        return;
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
