export async function registerWorker(base: string, onUpdate: (apply: () => void) => void): Promise<void> {
	if (!('serviceWorker' in navigator)) return
	const hadController = navigator.serviceWorker.controller !== null
	const registration = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => null)
	if (registration === null) return
	const notify = (worker: ServiceWorker): void => onUpdate(() => worker.postMessage({ type: 'skip-waiting' }))
	if (registration.waiting !== null && hadController) notify(registration.waiting)
	registration.addEventListener('updatefound', () => {
		const worker = registration.installing
		worker?.addEventListener('statechange', () => {
			if (worker.state === 'installed' && navigator.serviceWorker.controller !== null) notify(worker)
		})
	})
	let reloaded = false
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (!hadController || reloaded) return
		reloaded = true
		location.reload()
	})
}
