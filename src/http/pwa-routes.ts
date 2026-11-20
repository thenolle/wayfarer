import type { App } from '@gambrel/core'
import { ICONS, renderIcon, SERVICE_WORKER, webManifest } from './pwa'

/**
 * Registers the files a browser needs to install the dashboard as an app:
 * the manifest, a service worker at the root so its scope covers every page,
 * and the icons. They hold nothing private, so they need no sign-in.
 */
export function registerPwaRoutes(app: App): void {
	app.get('/manifest.webmanifest', () => new Response(JSON.stringify(webManifest()), { headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'public, max-age=3600' } }))
	app.get('/sw.js', () => new Response(SERVICE_WORKER, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache', 'service-worker-allowed': '/' } }))
	for (const icon of ICONS) {
		app.get(icon.path, () => new Response(new Uint8Array(renderIcon(icon.size, icon.maskable)), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } }))
	}
}
