const CACHE = 'malle-hq-v10'
const APP_SHELL = ['./', './manifest.webmanifest', './app-icon.svg']
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL))))
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))))
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone()
    event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)))
    return response
  }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./'))))
})
