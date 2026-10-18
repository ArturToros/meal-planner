// App shell cache so the app opens instantly, plus the evening reminder notification.
const CACHE = 'eat-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin) return
  // Pages: network first so updates arrive; built files: cache first (their names change on every build).
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./'))),
    )
    return
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})

self.addEventListener('push', (e) => {
  let data = { title: 'Tomorrow', body: 'Check tomorrow’s meals.' }
  try {
    data = { ...data, ...e.data.json() }
  } catch {
    /* plain text or empty push */
  }
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'evening' }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus()
      return self.clients.openWindow('./')
    }),
  )
})
