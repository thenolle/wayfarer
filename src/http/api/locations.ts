import { json } from '@gambrel/core'
import type { App } from '@gambrel/core'
import { readJsonObject } from './body'
import type { ApiRuntime } from './context'
import { ApiError } from './errors'

function text(body: Readonly<Record<string, unknown>>, key: string): string | undefined {
	const value = body[key]
	if (value === undefined) return undefined
	if (typeof value !== 'string') throw new ApiError(400, 'invalid_request', `"${key}" must be a string`)
	return value
}

function required(body: Readonly<Record<string, unknown>>, key: string): string {
	const value = text(body, key)
	if (value === undefined || value.trim() === '') throw new ApiError(400, 'invalid_request', `"${key}" is required`)
	return value
}

/**
 * Registers the save-location endpoints. Locations from the server
 * configuration are listed but cannot be changed through the API.
 */
export function registerLocationRoutes(app: App, runtime: ApiRuntime): void {
	const describe = (location: { id: string; label: string; path: string; managed: string }) => ({
		id: location.id,
		label: location.label,
		path: location.path,
		managed: location.managed,
		downloads: runtime.locations.downloadsIn(location)
	})

	app.get('/api/locations', () => json({ data: runtime.locations.list().map(describe) }))

	app.post('/api/locations', async (context) => {
		const body = await readJsonObject(context.request)
		const location = await runtime.locations.add(required(body, 'label'), required(body, 'path'))
		return json({ data: describe({ ...location, managed: 'user' }) }, { status: 201 })
	})

	app.patch('/api/locations/:id', async (context) => {
		const body = await readJsonObject(context.request)
		const label = text(body, 'label')
		const path = text(body, 'path')
		const location = await runtime.locations.update(context.params.id, { ...(label === undefined ? {} : { label }), ...(path === undefined ? {} : { path }) })
		return json({ data: describe({ ...location, managed: 'user' }) })
	})

	app.delete('/api/locations/:id', (context) => {
		runtime.locations.remove(context.params.id)
		return new Response(null, { status: 204 })
	})
}
