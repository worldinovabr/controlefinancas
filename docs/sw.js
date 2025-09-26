/* Service Worker for Controle Finanças
   Listens for push events and displays notifications. */
'use strict';

self.addEventListener('push', function(event) {
  try {
    const payload = event.data ? event.data.json() : { title: 'Controle Finanças', body: 'Você tem um vencimento próximo.' };
    const title = payload.title || 'Controle Finanças';
    const options = {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: payload.data || {}
    };
    // show system notification
    const p = self.registration.showNotification(title, options);
    // also broadcast the payload to all open clients so the page can persist the notice
    const msg = { type: 'PUSH_PAYLOAD', payload };
    const bc = self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
      clients.forEach(c => {
        try { c.postMessage(msg); } catch (err) { /* ignore */ }
      });
    }).catch(() => {});
    event.waitUntil(Promise.all([p, bc]));
  } catch (e) {
    console.error('SW push handler error', e);
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = (event.notification && event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
    for (let i = 0; i < clientList.length; i++) {
      const client = clientList[i];
      if (client.url === url && 'focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
const CACHE_NAME = 'controlefinancas-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/cartao.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // only handle GET navigation and same-origin requests
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      try{ const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)); }catch(e){}
      return res;
    })).catch(() => caches.match('/index.html'))
  );
});
