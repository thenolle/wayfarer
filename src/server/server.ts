import type { App } from '@gambrel/core'

const MAX_REQUEST_BODY_BYTES = 1024 * 1024

export interface ServerOptions {
	readonly hostname: string
	readonly port: number
}

export interface RunningServer {
	readonly url: URL
	/** Stops listening and closes open connections. */
	stop(): Promise<void>
}

/**
 * Serves the application with `Bun.serve`.
 *
 * Bun is used directly rather than through `@gambrel/bun`'s `serve`, because
 * the dashboard's `/ws` endpoint needs the server object to upgrade
 * connections and `serve` does not expose it. Routing, middleware and
 * responses still come from `@gambrel/core`.
 */
export function startServer(app: Pick<App, 'fetch'>, options: ServerOptions): RunningServer {
	const server = Bun.serve({
		hostname: options.hostname,
		port: options.port,
		maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
		fetch: (request) => app.fetch(request)
	})
	return {
		url: server.url,
		stop: () => server.stop(true)
	}
}
