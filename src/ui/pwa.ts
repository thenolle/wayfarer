/**
 * Registers the service worker, which browsers require before they offer to
 * install the dashboard as an app.
 */
export function registerServiceWorker(): void {
	if (!('serviceWorker' in navigator)) return
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => console.error('[wayfarer] the service worker could not be registered', error))
	})
}
