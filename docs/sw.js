/* Service Worker for Controle Finanças
   Listens for push events and displays notifications. */
'use strict';

self.addEventListener('push', function(event) {
  try {
    // payload may be JSON or plain text; handle safely
    let payload = { title: 'Controle Finanças', body: 'Você tem um vencimento próximo.' };
    try {
      if (event.data) {
        // prefer json parse, but wrap in try
        payload = event.data.json ? event.data.json() : JSON.parse(event.data.text());
      }
    } catch (pe) {
      try { const text = event.data && event.data.text ? event.data.text() : null; if (text) payload.body = text; } catch(e){}
    }
    const title = payload.title || 'Controle Finanças';
    const tag = (payload.tag || 'controlefinancas-due');
    const options = {
      body: payload.body || '',
      // use a local icon that exists in the repo (relative to SW scope)
      icon: 'cartao.png',
      badge: 'cartao.png',
      vibrate: [100, 50, 100],
      tag: tag,
      renotify: true,
      actions: payload.actions || [{ action: 'view', title: 'Ver' }],
      data: payload.data || {},
      timestamp: Date.now()
    };
    // show system notification and broadcast the payload to clients
    const p = self.registration.showNotification(title, options);
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
  const data = event.notification && event.notification.data ? event.notification.data : {};
  const target = data.url || ('/' );
  // handle action buttons
  const action = event.action || null;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
    // try to focus an existing client
    for (let i = 0; i < clientList.length; i++) {
      const client = clientList[i];
      // prefer clients that match our path (relative)
      if (client.url && client.url.indexOf(location.origin) === 0) {
        try { client.focus(); client.postMessage({ type: 'NOTIFICATION_CLICK', action, data }); } catch(e){}
        return;
      }
    }
    // if none found, open a new window relative to SW scope
    if (clients.openWindow) {
      const scopeBase = (self.registration && self.registration.scope) ? self.registration.scope : '/';
      const openUrl = new URL(target, scopeBase).href;
      return clients.openWindow(openUrl);
    }
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
