import { staticFiles } from '@gambrel/bun'
import { createApp, json, redirect } from '@gambrel/core'
import type { App } from '@gambrel/core'
import { createDocumentHandler } from '@gambrel/ssr'
import { components, hooks, routes } from '../../.gambrel/manifest.server'
import type { PageContext } from '../ui/context.server'
import { registerDownloadRoutes } from './api/downloads'
import type { ApiRuntime } from './api/context'
import { errorResponse, handleError } from './api/errors'
import { registerSettingsRoutes } from './api/settings'
import { authGuard, buildAllowedHosts, hostGuard, originGuard, securityHeaders } from './middleware/security'
import { registerWebRoutes } from './web/actions'
import { createSessionResolver } from './web/session-context'
import type { SessionResolver } from './web/session-context'
import { assetContentTypes } from './middleware/assets'
import { registerLocationRoutes } from './api/locations'
import { registerQueueRoutes } from './api/queue'
import { registerStatsRoutes } from './api/stats'
import { registerTransferRoutes } from './api/transfer'

/**
 * Builds the HTTP application.
 *
 * Middleware order matters. Security headers wrap every response, including
 * rejections; the host check runs before anything else reveals information;
 * API routes then require the bearer token; state-changing requests must be
 * same-origin; sessions attach their cookie last.
 *
 * Explicit routes (API, form actions, files) win. Everything else is handed to
 * the Gambrel document handler, which renders file-routed pages and error
 * documents.
 */
export function createHttpApp(runtime: ApiRuntime, sessions: SessionResolver = createSessionResolver(runtime.config)): App {
	const documents = createDocumentHandler<PageContext>({ routes, components, hooks, entry: '/assets/client.js', development: process.env['NODE_ENV'] === 'development' })
	const app = createApp()
	app.use(securityHeaders())
	app.use(hostGuard(buildAllowedHosts(runtime.config)))
	app.use(authGuard(runtime.config.authToken))
	app.use(originGuard())
	app.use(sessions.middleware())
	app.use(assetContentTypes())
	app.use(staticFiles({ directory: runtime.config.clientDirectory, prefix: '/assets' }))
	app.get('/favicon.ico', () => redirect('/assets/favicon.svg', 302))
	app.get('/api/health', () => json({ data: { status: 'ok' } }))
	registerDownloadRoutes(app, runtime)
	registerSettingsRoutes(app, runtime)
	registerLocationRoutes(app, runtime)
	registerQueueRoutes(app, runtime)
	registerStatsRoutes(app, runtime)
	registerTransferRoutes(app, runtime)
	registerWebRoutes(app, runtime, sessions)
	app.notFound((context) => context.url.pathname.startsWith('/api/') ? errorResponse(404, 'not_found', 'Not found') : documents.handle(context.request, { ...context, runtime, session: () => sessions.resolve(context.request).session }))
	app.onError(handleError)
	return app
}
