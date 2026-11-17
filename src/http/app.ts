import { createApp, json, text } from '@gambrel/core'
import type { App } from '@gambrel/core'
import { registerDownloadRoutes } from './api/downloads'
import type { ApiRuntime } from './api/context'
import { errorResponse, handleError } from './api/errors'
import { registerSettingsRoutes } from './api/settings'
import { authGuard, buildAllowedHosts, hostGuard, originGuard, securityHeaders } from './middleware/security'

/**
 * Builds the HTTP application: security middleware, then the REST API.
 *
 * Middleware order matters. Security headers wrap every response, including
 * rejections; the host check runs before authentication so unexpected host
 * names get no information; the origin check runs last.
 */
export function createHttpApp(runtime: ApiRuntime): App {
	const app = createApp()
	app.use(securityHeaders())
	app.use(hostGuard(buildAllowedHosts(runtime.config)))
	app.use(authGuard(runtime.config.authToken))
	app.use(originGuard())
	app.get('/api/health', () => json({ data: { status: 'ok' } }))
	registerDownloadRoutes(app, runtime)
	registerSettingsRoutes(app, runtime)
	app.notFound((context) => context.url.pathname.startsWith('/api/') ? errorResponse(404, 'not_found', 'Not found') : text('Not Found', { status: 404 }))
	app.onError(handleError)
	return app
}
