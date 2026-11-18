/**
 * The service worker: precaches every page, answers from the cache first and
 * refreshes it in the background. A new version waits until the reader accepts
 * the "reload" prompt.
 */
export function serviceWorkerSource(base: string, version: string, urls: readonly string[]): string {
	return `const VERSION = ${JSON.stringify(version)}
const BASE = ${JSON.stringify(base)}
const PRECACHE = ${JSON.stringify(urls)}
const CACHE = 'wayfarer-docs-' + VERSION

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('wayfarer-docs-') && key !== CACHE) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const cached = await cache.match(request)
    const network = fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    }).catch(() => null)
    if (cached) {
      event.waitUntil(network)
      return cached
    }
    const response = await network
    if (response) return response
    if (request.mode === 'navigate') {
      const fallback = await cache.match(BASE + '404.html')
      if (fallback) return fallback
    }
    return Response.error()
  })())
})
`
}
