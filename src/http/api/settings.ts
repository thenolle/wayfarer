import { json } from '@gambrel/core'
import type { App } from '@gambrel/core'
import { readJsonObject, requireInteger } from './body'
import type { ApiRuntime } from './context'
import { ApiError } from './errors'

/**
 * Registers the settings endpoints.
 */
export function registerSettingsRoutes(app: App, runtime: ApiRuntime): void {
	app.get('/api/settings/bandwidth', () => json({ data: { bytesPerSecond: runtime.limiter.bytesPerSecond } }))

	app.patch('/api/settings/bandwidth', async (context) => {
		const body = await readJsonObject(context.request)
		const bytesPerSecond = requireInteger(body, 'bytesPerSecond')
		try {
			runtime.setBandwidthLimit(bytesPerSecond)
		} catch (error) {
			if (error instanceof RangeError) throw new ApiError(400, 'invalid_request', error.message)
			throw error
		}
		return json({ data: { bytesPerSecond } })
	})
}
